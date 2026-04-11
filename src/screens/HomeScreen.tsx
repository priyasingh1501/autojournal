import React, { useState, useEffect, useCallback } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
  ActivityIndicator,
  Platform,
  ImageBackground,
  AppState,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { audioRecorderService, RecordingStatus } from '../services/AudioRecorderService';
import { transcribePendingClips, BatchProgress } from '../services/BatchTranscriptionService';
import { StorageService } from '../services/StorageService';
import { generateDailySummary } from '../services/SummaryService';
import {
  analyzeEntry,
  getPendingReentry,
  clearPendingReentry,
  ReentryPending,
  WellbeingAnalysis,
} from '../services/WellbeingService';
import { PendingClip, TranscriptEntry } from '../types';
import ComposeModal from '../components/ComposeModal';
import MonthlyInsightCard from '../components/MonthlyInsightCard';
import WellbeingResponseModal from '../components/WellbeingResponseModal';
import TalkScreen from './TalkScreen';
import ChatScreen from './ChatScreen';
import { WIDGET_MONITORING_KEY } from '../widgets/widgetTaskHandler';
// SMS spend tracking disabled — READ_SMS permission not grantable on non-rooted devices
// import { syncSMSTransactionsToNotes } from '../services/SMSSpendService';

export default function HomeScreen() {
  const route = useRoute<any>();
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [pendingClips, setPendingClips] = useState<PendingClip[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [showCompose, setShowCompose] = useState(false);
  const [showCall,    setShowCall]    = useState(false);
  const [showChat,    setShowChat]    = useState(false);
  const [cardRefreshKey, setCardRefreshKey] = useState(0);
  const isTranscribingRef = React.useRef(false);
  // Prevents multiple wellbeing alerts firing from a single batch
  const batchWellbeingFiredRef = React.useRef(false);
  // Holds the pending auto-generate timer so additional notes reset the countdown
  const autoGenerateTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Wellbeing ────────────────────────────────────────────────────────────
  const [wellbeingAlert, setWellbeingAlert] = useState<WellbeingAnalysis | null>(null);
  const [reentryPending, setReentryPending] = useState<ReentryPending | null>(null);
  // Ref (not state) so dismissal survives tab-switch re-focus without resetting
  const reentryDismissedRef = React.useRef(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
      syncWidgetMonitoringIntent();
      // Re-read tracker/settings changes made on the Settings screen
      setCardRefreshKey(k => k + 1);
      // Check for a pending re-entry check-in from a prior Tier 2/3 session.
      // Guard with the ref so re-focusing (tab switch, back nav) doesn't
      // re-show the card after the user has already dismissed it this session.
      getPendingReentry().then(r => {
        if (r && !reentryDismissedRef.current) {
          const today = new Date().toISOString().split('T')[0];
          if (r.date < today) {
            setReentryPending(r);
          }
        }
      });
      // SMS spend tracking disabled — READ_SMS permission not grantable on non-rooted devices
      // if (Platform.OS === 'android') {
      //   syncSMSTransactionsToNotes().catch(() => {});
      // }
    }, [])
  );

  // Open compose modal when arriving via the widget "Type a note" deeplink
  useEffect(() => {
    if (route.params?.openCompose) {
      setShowCompose(true);
    }
  }, [route.params?.openCompose]);

  // Cancel the auto-generate debounce timer when the component unmounts so we
  // don't call setState on an unmounted component or do unnecessary API work.
  useEffect(() => {
    return () => {
      if (autoGenerateTimerRef.current) {
        clearTimeout(autoGenerateTimerRef.current);
        autoGenerateTimerRef.current = null;
      }
    };
  }, []);


  // Sync widget state whenever the app comes to foreground (not just on screen focus).
  // This catches the "tap widget to stop" case where HomeScreen is already focused
  // so useFocusEffect doesn't re-fire.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') syncWidgetMonitoringIntent();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    audioRecorderService.setCallbacks({
      onStatus: (s) => setStatus(s),
      onPendingClip: (clip) => {
        setPendingClips(prev => [...prev, clip]);
        // Auto-transcribe as soon as the recording is saved
        handleTranscribeNow();
      },
      onError: (err) => {
        Alert.alert('Error', err);
      },
    });
  }, []);

  useEffect(() => {
    if (status === 'recording') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => {
        anim.stop();
        pulseAnim.setValue(1);
      };
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  const loadData = async () => {
    const clips = await StorageService.getPendingClips();
    setPendingClips(clips);
  };

  // ── Wellbeing check ───────────────────────────────────────────────────────
  const checkWellbeing = async (entry: TranscriptEntry, batchGuard = false) => {
    // During batch transcription, stop after the first alert to avoid
    // re-triggering the modal for every remaining entry in the batch
    if (batchGuard && batchWellbeingFiredRef.current) return;
    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    const analysis = await analyzeEntry(entry, date);
    if (analysis && analysis.tier >= 2) {
      if (batchGuard) batchWellbeingFiredRef.current = true;
      setWellbeingAlert(analysis);
    }
  };

  // ── Widget ↔ app sync ────────────────────────────────────────────────────
  const syncWidgetMonitoringIntent = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const val = await AsyncStorage.getItem(WIDGET_MONITORING_KEY);
      const liveStatus = audioRecorderService.getStatus();
      if (val === 'true' && liveStatus === 'idle') {
        await audioRecorderService.startMonitoring();
      } else if (val === 'false' && liveStatus !== 'idle') {
        await audioRecorderService.stopMonitoring();
      }
    } catch {
      // Ignore; widget state is best-effort
    }
  };

  const updateWidgetState = async (monitoring: boolean) => {
    if (Platform.OS !== 'android') return;
    try {
      await AsyncStorage.setItem(WIDGET_MONITORING_KEY, monitoring ? 'true' : 'false');
      const { requestWidgetUpdate } = require('react-native-android-widget');
      const { MicWidget } = require('../widgets/MicWidget');
      await requestWidgetUpdate({
        widgetName: 'MicWidget',
        renderWidget: () => require('react').default.createElement(MicWidget, { isMonitoring: monitoring }),
      });
    } catch {
      // Widget might not be placed yet; ignore
    }
  };

  const toggleMonitoring = async () => {
    if (status === 'idle') {
      await audioRecorderService.startMonitoring();
      await updateWidgetState(true);
    } else {
      await audioRecorderService.stopMonitoring();
      await updateWidgetState(false);
    }
  };

  const handleTranscribeNow = async () => {
    if (isTranscribingRef.current) return;
    isTranscribingRef.current = true;
    batchWellbeingFiredRef.current = false; // reset per batch
    setBatchProgress({ total: 0, completed: 0, failed: 0 });
    try {
      await transcribePendingClips(
        (progress) => setBatchProgress(progress),
        (entry) => {
          // Entry saved to storage — run wellbeing check fire-and-forget
          // batchGuard=true so only the first alert fires per batch
          checkWellbeing(entry, true).catch(() => {});
        },
      );
    } finally {
      isTranscribingRef.current = false;
      setPendingClips([]);
      setBatchProgress(null);
      // Refresh the home card so new entries are reflected immediately
      setCardRefreshKey(k => k + 1);
      // After each batch, schedule (or debounce) an auto-generate if no summary yet
      scheduleAutoGenerateIfNeeded();
      // Re-trigger for any clips that arrived while this batch was running
      // (new clips fire onPendingClip but are blocked by isTranscribingRef)
      StorageService.getPendingClips().then(remaining => {
        if (remaining.length > 0) handleTranscribeNow();
      }).catch(() => {});
    }
  };

  // Silently generate today's summary 5 minutes after the last note, if no
  // summary exists yet. Each new note resets the countdown.
  const scheduleAutoGenerateIfNeeded = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const existingSummary = await StorageService.getSummaryForDate(today);
      if (existingSummary) return; // already have one — nothing to do

      const todayTranscripts = await StorageService.getTranscriptsForDate(today);
      if (todayTranscripts.length === 0) return;

      // Clear any previous pending timer (debounce on each new note)
      if (autoGenerateTimerRef.current) {
        clearTimeout(autoGenerateTimerRef.current);
      }

      autoGenerateTimerRef.current = setTimeout(async () => {
        autoGenerateTimerRef.current = null;
        try {
          const summaryCheck = await StorageService.getSummaryForDate(today);
          if (summaryCheck) return; // user may have manually generated in the meantime
          const transcripts = await StorageService.getTranscriptsForDate(today);
          if (transcripts.length > 0) {
            await generateDailySummary(transcripts, today);
            // Refresh home card so the new summary's signals appear
            setCardRefreshKey(k => k + 1);
          }
        } catch {
          // Silent — user can always generate manually from Summaries tab
        }
      }, 5 * 60 * 1000); // 5 minutes
    } catch {
      // Ignore any storage errors
    }
  };

  const getStatusText = (): string => {
    switch (status) {
      case 'idle':       return 'Tap to record';
      case 'monitoring': return 'Listening…';
      case 'recording':  return 'Recording — tap to stop';
      default:           return '';
    }
  };

  const getStatusColor = (): string => {
    switch (status) {
      case 'idle':       return 'rgba(152, 212, 250, 0.65)';
      case 'monitoring': return 'rgba(152, 212, 250, 0.80)';
      case 'recording':  return 'rgba(224, 242, 254, 0.95)';
      default:           return 'rgba(152, 212, 250, 0.65)';
    }
  };

  const isActive = status !== 'idle';
  const isTranscribing = batchProgress !== null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Everything scrolls together */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Re-entry check-in — shown after a Tier 2/3 session from a prior day */}
        {reentryPending && (
          <View style={styles.reentryCard}>
            <View style={styles.reentryRow}>
              <Feather name="heart" size={15} color="rgba(152, 212, 250, 0.70)" />
              <Text style={styles.reentryText}>
                Last time felt heavy. How are you today?
              </Text>
            </View>
            <View style={styles.reentryActions}>
              <TouchableOpacity
                style={styles.reentryBtn}
                onPress={() => {
                  reentryDismissedRef.current = true;
                  clearPendingReentry();
                  setReentryPending(null);
                  setShowCompose(true);
                }}
              >
                <Text style={styles.reentryBtnText}>Write about it</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.reentrySkipBtn}
                onPress={() => {
                  reentryDismissedRef.current = true;
                  clearPendingReentry();
                  setReentryPending(null);
                }}
              >
                <Text style={styles.reentrySkipText}>I'm okay today</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Main Button — Jellyfish card */}
        <View style={styles.monitorCard}>
          <ImageBackground
            source={require('../../assets/jellyfish.jpg')}
            style={styles.monitorCardBg}
            imageStyle={styles.monitorCardImage}
            resizeMode="cover"
          >
            <View style={styles.monitorOverlay} />
            <View style={styles.buttonSection}>
              <View style={[styles.glowRing, isActive && styles.glowRingActive]}>
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <TouchableOpacity
                    style={[styles.mainButton, isActive && styles.mainButtonActive]}
                    onPress={toggleMonitoring}
                    activeOpacity={0.8}
                  >
                    <Feather
                      name={status === 'recording' ? 'square' : 'mic'}
                      size={28}
                      color={isActive ? 'rgba(224, 242, 254, 0.95)' : '#98D4FA'}
                    />
                  </TouchableOpacity>
                </Animated.View>
              </View>

              <Text style={[styles.statusText, { color: getStatusColor() }]}>
                {getStatusText()}
              </Text>

            </View>
          </ImageBackground>
        </View>

        {/* Transcription progress banner */}
        {isTranscribing && (
          <View style={styles.pendingBanner}>
            <View style={styles.pendingRow}>
              <ActivityIndicator color="#f4a261" size="small" />
              <Text style={styles.pendingText}>
                Transcribing…
              </Text>
            </View>
          </View>
        )}

        {/* Monthly insight card */}
        <MonthlyInsightCard refreshKey={cardRefreshKey} />
      </ScrollView>

      {/* FAB cluster */}
      <View style={styles.fabCluster}>
        <TouchableOpacity
          style={styles.fabSecondary}
          onPress={() => setShowCall(true)}
          activeOpacity={0.85}
        >
          <Feather name="phone" size={17} color="rgba(224, 242, 254, 0.75)" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fabSecondary}
          onPress={() => setShowChat(true)}
          activeOpacity={0.85}
        >
          <Feather name="message-circle" size={17} color="rgba(224, 242, 254, 0.75)" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowCompose(true)}
          activeOpacity={0.85}
        >
          <Feather name="edit-2" size={18} color="rgba(224, 242, 254, 0.8)" />
        </TouchableOpacity>
      </View>

      <ComposeModal
        visible={showCompose}
        onClose={() => setShowCompose(false)}
        onSaved={(entry) => {
          setShowCompose(false);
          // Run wellbeing check after a brief delay so modal closes first
          setTimeout(() => checkWellbeing(entry).catch(() => {}), 600);
        }}
      />

      {/* Wellbeing response modal — Tier 2 or Tier 3 */}
      {wellbeingAlert && (
        <WellbeingResponseModal
          visible
          tier={wellbeingAlert.tier}
          onContinue={() => setWellbeingAlert(null)}
          onDismiss={() => setWellbeingAlert(null)}
        />
      )}

      {/* Call modal — no day context */}
      <Modal
        visible={showCall}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowCall(false)}
      >
        {showCall && (
          <TalkScreen onClose={() => setShowCall(false)} />
        )}
      </Modal>

      {/* Chat modal — no day context */}
      <Modal
        visible={showChat}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowChat(false)}
      >
        {showChat && (
          <ChatScreen onClose={() => setShowChat(false)} />
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },

  // ── Re-entry check-in card ────────────────────────────────────────────────
  reentryCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: 'rgba(3, 18, 40, 0.85)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
    padding: 16,
  },
  reentryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  reentryText: {
    fontSize: 15,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.88)',
    flex: 1,
    lineHeight: 22,
  },
  reentryActions: {
    flexDirection: 'row',
    gap: 10,
  },
  reentryBtn: {
    flex: 1,
    backgroundColor: 'rgba(9, 41, 173, 0.22)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.28)',
    paddingVertical: 9,
    alignItems: 'center',
  },
  reentryBtnText: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.88)',
    fontWeight: '500',
  },
  reentrySkipBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
  },
  reentrySkipText: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.50)',
  },

  // ── Jellyfish monitor card ────────────────────────────────────────────────
  monitorCard: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.22)',
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 10,
  },
  monitorCardBg: { width: '100%', minHeight: 280 },
  monitorCardImage: { opacity: 0.80 },
  monitorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 14, 0.48)',
  },

  // ── Mic button section ────────────────────────────────────────────────────
  buttonSection: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 20 },

  glowRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(152, 212, 250, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRingActive: {
    backgroundColor: 'rgba(152, 212, 250, 0.12)',
    borderColor: 'rgba(152, 212, 250, 0.55)',
  },

  mainButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(2, 6, 14, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.30)',
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.20,
    shadowRadius: 24,
    elevation: 8,
  },
  mainButtonActive: {
    backgroundColor: 'rgba(9, 41, 173, 0.30)',
    borderColor: 'rgba(152, 212, 250, 0.60)',
    shadowOpacity: 0.40,
  },

  statusText: {
    marginTop: 18,
    fontSize: 17,
    fontWeight: '500',
    fontFamily: 'Baskerville',
  },
  pendingCount: {
    marginTop: 6,
    fontSize: 13,
    color: '#f4a261',
    fontFamily: 'GillSans-Light',
  },

  // ── Pending banner ────────────────────────────────────────────────────────
  pendingBanner: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 0,
    backgroundColor: 'rgba(244, 162, 97, 0.12)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(244, 162, 97, 0.3)',
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  pendingText: { color: '#f4a261', fontSize: 14, fontWeight: '500', fontFamily: 'GillSans-Light' },
  pendingActions: { flexDirection: 'row', gap: 8 },
  transcribeButton: {
    backgroundColor: 'rgba(244, 162, 97, 0.18)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(244, 162, 97, 0.4)',
  },
  transcribeButtonText: { color: '#f4a261', fontSize: 13, fontWeight: '500', fontFamily: 'GillSans-Light' },
  discardButton: {
    backgroundColor: 'rgba(9, 41, 173, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
  },
  discardButtonText: { color: 'rgba(152, 212, 250, 0.70)', fontSize: 13, fontWeight: '500', fontFamily: 'GillSans-Light' },

  // ── Scroll area ───────────────────────────────────────────────────────────
  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: 100 },

  // ── FAB cluster ───────────────────────────────────────────────────────────
  fabCluster: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(9, 41, 173, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.40)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  fabSecondary: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(3, 18, 40, 0.80)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
});
