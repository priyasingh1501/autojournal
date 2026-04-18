import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { audioRecorderService, RecordingStatus } from '../services/AudioRecorderService';
import { transcribePendingClips, BatchProgress, SummaryBannerStatus } from '../services/BatchTranscriptionService';
import { StorageService } from '../services/StorageService';
import { generateDailySummary } from '../services/SummaryService';
import { FeatureFlagsService } from '../services/FeatureFlagsService';
import {
  analyzeEntry,
  getPendingReentry,
  clearPendingReentry,
  recordFalsePositive,
  ReentryPending,
  WellbeingAnalysis,
} from '../services/WellbeingService';
import { PendingClip, TranscriptEntry } from '../types';
import ComposeModal from '../components/ComposeModal';
import MonthlyInsightCard from '../components/MonthlyInsightCard';
import WellbeingResponseModal from '../components/WellbeingResponseModal';
import TalkScreen from './TalkScreenV2';
import { WIDGET_MONITORING_KEY } from '../widgets/widgetTaskHandler';
import { track } from '../services/AnalyticsService';
import {
  requestNotificationPermission,
  scheduleSmartNotifications,
} from '../services/SmartNotificationService';
import { ActionablesService } from '../services/ActionablesService';
import ActionablesCard from '../components/ActionablesCard';
// SMS spend tracking disabled — READ_SMS permission not grantable on non-rooted devices
// import { syncSMSTransactionsToNotes } from '../services/SMSSpendService';

function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function HomeScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [pendingClips, setPendingClips] = useState<PendingClip[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [showCompose,       setShowCompose]       = useState(false);
  const [showPerspective,   setShowPerspective]   = useState(false);
  const [cardRefreshKey, setCardRefreshKey] = useState(0);
  const isTranscribingRef = React.useRef(false);
  const [summaryBanner, setSummaryBanner] = useState<SummaryBannerStatus | null>(null);
  const summaryBannerTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Clear the banner timer if the component unmounts mid-countdown
  useEffect(() => () => { if (summaryBannerTimerRef.current) clearTimeout(summaryBannerTimerRef.current); }, []);
  const [isNewUser, setIsNewUser] = useState(false);
  const [notifOptInDone, setNotifOptInDone] = useState(false);
  // Rotating mic prompts
  const MIC_PROMPTS = ['How is your day going?', 'Something you\'re thinking about?', 'How are you feeling right now?'];
  const [promptIdx, setPromptIdx] = useState(0);
  const [promptOpacity] = useState(new Animated.Value(1));
  const promptIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    promptIntervalRef.current = setInterval(() => {
      Animated.timing(promptOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        setPromptIdx(i => (i + 1) % MIC_PROMPTS.length);
        Animated.timing(promptOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    }, 3000);
    return () => { if (promptIntervalRef.current) clearInterval(promptIntervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          const today = localDateStr();
          if (r.date < today) {
            setReentryPending(r);
          }
        }
      }).catch(() => {});
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

  // When the app returns to foreground, retry any pending clips that were
  // interrupted mid-transcription (e.g. user switched apps while Whisper was running).
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        // Reset stuck flag in case JS was suspended before the finally block ran
        isTranscribingRef.current = false;
        StorageService.getPendingClips().then(clips => {
          if (clips.length > 0) handleTranscribeNow();
        }).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    audioRecorderService.setCallbacks({
      onStatus: (s) => setStatus(s),
      onPendingClip: (clip) => {
        setPendingClips(prev => [...prev, clip]);
        track('recording_completed', { duration_ms: clip.duration });
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

  // Check once on mount whether this is a first-time user
  useEffect(() => {
    AsyncStorage.getItem('UNTANGLE_FIRST_NOTE_DONE').then(val => {
      if (!val) setIsNewUser(true);
    }).catch(() => {});
    AsyncStorage.getItem('UNTANGLE_NOTIF_OPT_IN_DONE').then(val => {
      if (val) setNotifOptInDone(true);
    }).catch(() => {});
  }, []);

  // ── Wellbeing check ───────────────────────────────────────────────────────
  const checkWellbeing = async (entry: TranscriptEntry, batchGuard = false) => {
    // During batch transcription, stop after the first alert to avoid
    // re-triggering the modal for every remaining entry in the batch
    if (batchGuard && batchWellbeingFiredRef.current) return;
    const _e = new Date(entry.timestamp);
    const date = localDateStr(_e);
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
        renderWidget: () => require('react').default.createElement(MicWidget, {}),
      });
    } catch {
      // Widget might not be placed yet; ignore
    }
  };

  const toggleMonitoring = async () => {
    if (status === 'idle') {
      track('recording_started');
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
          // Dismiss new-user guided state on first ever note
          if (isNewUser) {
            setIsNewUser(false);
            AsyncStorage.setItem('UNTANGLE_FIRST_NOTE_DONE', '1').catch(() => {});
            // Ask for notification permission on first saved note — the user is now
            // invested enough for the prompt to feel relevant, not intrusive.
            if (!notifOptInDone) {
              setNotifOptInDone(true);
              AsyncStorage.setItem('UNTANGLE_NOTIF_OPT_IN_DONE', '1').catch(() => {});
              requestNotificationPermission().then(granted => {
                if (granted) {
                  StorageService.getSettings().then(s => {
                    const time = s?.notificationTime;
                    // Mark notifications as enabled in settings and schedule
                    StorageService.saveSettings({ ...s, notificationsEnabled: true } as any).catch(() => {});
                    scheduleSmartNotifications(time).catch(() => {});
                  }).catch(() => {});
                }
              }).catch(() => {});
            }
          }
          // Entry saved to storage — run wellbeing check fire-and-forget
          // batchGuard=true so only the first alert fires per batch
          checkWellbeing(entry, true).catch(() => {});
        },
        (status) => {
          setSummaryBanner(status);
          if (summaryBannerTimerRef.current) clearTimeout(summaryBannerTimerRef.current);
          if (status === 'ready') {
            // Auto-dismiss "ready" after 5 s
            summaryBannerTimerRef.current = setTimeout(() => setSummaryBanner(null), 5000);
          } else if (status === 'generating') {
            // Safety timeout: if generation never completes, stop showing spinner after 45 s
            summaryBannerTimerRef.current = setTimeout(() => setSummaryBanner(null), 45_000);
          }
        },
      );
    } finally {
      isTranscribingRef.current = false;
      setPendingClips([]);
      setBatchProgress(null);
      // Refresh the home card so new entries are reflected immediately
      setCardRefreshKey(k => k + 1);
      ActionablesService.invalidate();
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
  //
  // Under ff_day_close_model, this debounce is a no-op: summaries are only
  // produced once at 23:59 close-out, so we explicitly clear any lingering
  // timer and return before scheduling a new one.
  const scheduleAutoGenerateIfNeeded = async () => {
    try {
      const dayCloseOn = await FeatureFlagsService.getFlag('ff_day_close_model').catch(() => false);
      if (dayCloseOn) {
        if (autoGenerateTimerRef.current) {
          clearTimeout(autoGenerateTimerRef.current);
          autoGenerateTimerRef.current = null;
        }
        return;
      }

      const today = localDateStr();
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
            if (summaryBannerTimerRef.current) clearTimeout(summaryBannerTimerRef.current);
            setSummaryBanner('generating');
            // 45 s safety timeout in case generation hangs
            summaryBannerTimerRef.current = setTimeout(() => setSummaryBanner(null), 45_000);
            await generateDailySummary(transcripts, today);
            setCardRefreshKey(k => k + 1);
            if (summaryBannerTimerRef.current) clearTimeout(summaryBannerTimerRef.current);
            setSummaryBanner('ready');
            summaryBannerTimerRef.current = setTimeout(() => setSummaryBanner(null), 5000);
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
      case 'idle':       return isNewUser ? 'Tap the mic to start' : 'Tap to record';
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
      {/* Primary section — all 4 components, always visible without scroll */}
      <View style={styles.primarySection}>

        {/* Warm line card (or re-entry check-in when pending) */}
        {reentryPending ? (
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
        ) : (
          <View style={styles.warmLineCard}>
            <Animated.Text style={[styles.warmLineText, { opacity: promptOpacity }]}>
              {MIC_PROMPTS[promptIdx]}
            </Animated.Text>
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

        {/* Action tiles */}
        <View style={styles.tilesRow}>
          <TouchableOpacity
            style={styles.tile}
            onPress={() => setShowCompose(true)}
            activeOpacity={0.85}
          >
            <Feather name="edit-2" size={20} color="rgba(152, 212, 250, 0.80)" />
            <Text style={styles.tileLabel}>Add a manual entry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tile}
            onPress={() => setShowPerspective(true)}
            activeOpacity={0.85}
          >
            <Feather name="compass" size={20} color="rgba(152, 212, 250, 0.80)" />
            <Text style={styles.tileLabel}>Get a new perspective</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Secondary scrollable content — banners + insight cards */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

        {/* Summary generation banner */}
        {summaryBanner && (
          <TouchableOpacity
            style={styles.summaryBanner}
            activeOpacity={summaryBanner === 'ready' ? 0.75 : 1}
            onPress={() => {
              if (summaryBanner === 'ready') {
                setSummaryBanner(null);
                navigation.navigate('Summary');
              }
            }}
          >
            {summaryBanner === 'generating' ? (
              <>
                <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" style={{ marginRight: 8 }} />
                <Text style={styles.summaryBannerText}>Building your summary…</Text>
              </>
            ) : (
              <>
                <Feather name="star" size={13} color="rgba(152,212,250,0.90)" style={{ marginRight: 8 }} />
                <Text style={[styles.summaryBannerText, styles.summaryBannerReady]}>
                  Your summary is ready
                </Text>
                <Feather name="arrow-right" size={13} color="rgba(152,212,250,0.60)" style={{ marginLeft: 4 }} />
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Monthly insight card */}
        <MonthlyInsightCard refreshKey={cardRefreshKey} />

        {/* Actionables — goal, action, question derived from recent entries */}
        <ActionablesCard refreshKey={cardRefreshKey} />
      </ScrollView>

      <ComposeModal
        visible={showCompose}
        onClose={() => setShowCompose(false)}
        onSaved={(entry) => {
          setShowCompose(false);
          track('manual_note_created', { has_photo: !!entry.photoUri });
          ActionablesService.invalidate();
          // Refresh home card so the new entry appears immediately
          setCardRefreshKey(k => k + 1);
          // Schedule auto-generate (same logic as after voice batch) so the
          // summary banner and 5-minute timer fire for manual entries too
          scheduleAutoGenerateIfNeeded();
          // Run wellbeing check after a brief delay so modal closes first
          setTimeout(() => checkWellbeing(entry).catch(() => {}), 600);
        }}
        onExpensesExtracted={() => setCardRefreshKey(k => k + 1)}
      />

      {/* Wellbeing response modal — Tier 2 or Tier 3 */}
      {wellbeingAlert && (
        <WellbeingResponseModal
          visible
          tier={wellbeingAlert.tier}
          onContinue={() => setWellbeingAlert(null)}
          onDismiss={() => setWellbeingAlert(null)}
          onFalsePositive={() => {
            recordFalsePositive().catch(() => {});
            setWellbeingAlert(null);
          }}
        />
      )}

      {/* Get a perspective — opens mind picker in call mode, no day context */}
      <Modal
        visible={showPerspective}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowPerspective(false)}
      >
        {showPerspective && (
          <TalkScreen onClose={() => setShowPerspective(false)} />
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },

  // ── Primary (non-scroll) section ──────────────────────────────────────────
  primarySection: {
    flex: 1,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 10,
    gap: 10,
  },

  // ── Warm line card ────────────────────────────────────────────────────────
  warmLineCard: {
    backgroundColor: 'rgba(3, 18, 40, 0.80)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.16)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warmLineText: {
    fontSize: 16,
    fontFamily: 'Baskerville',
    color: 'rgba(224, 242, 254, 0.78)',
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 22,
  },

  // ── Action tiles ──────────────────────────────────────────────────────────
  tilesRow: {
    flexDirection: 'row',
    gap: 10,
    height: 88,
  },
  tile: {
    flex: 1,
    backgroundColor: 'rgba(3, 18, 40, 0.82)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tileLabel: {
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.75)',
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  // ── Re-entry check-in card ────────────────────────────────────────────────
  reentryCard: {
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
    flex: 1,
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
  monitorCardBg: { flex: 1, width: '100%' },
  monitorCardImage: { opacity: 0.80 },
  monitorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 14, 0.48)',
  },

  // ── Mic button section ────────────────────────────────────────────────────
  buttonSection: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, paddingHorizontal: 20 },

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
  guidedCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: 'rgba(4,13,30,0.70)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.12)',
    padding: 22,
  },
  guidedPrompt: {
    fontSize: 19,
    fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.92)',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 26,
  },
  guidedSub: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.50)',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  guidedHints: {
    gap: 8,
  },
  guidedHint: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.60)',
    lineHeight: 19,
  },

  notifOptIn: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152,212,250,0.10)',
  },
  notifOptInLabel: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.65)',
    textAlign: 'center',
    marginBottom: 12,
  },
  notifOptInRow: {
    flexDirection: 'row',
    gap: 10,
  },
  notifOptInYes: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,41,173,0.25)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.30)',
    paddingVertical: 10,
  },
  notifOptInYesText: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.90)',
    fontWeight: '500',
  },
  notifOptInNo: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifOptInNoText: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.40)',
  },

  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 0,
    backgroundColor: 'rgba(9,41,173,0.18)',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.18)',
  },
  summaryBannerText: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.70)',
    flex: 1,
  },
  summaryBannerReady: {
    color: 'rgba(224,242,254,0.90)',
  },

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

  // ── Scroll area (secondary content below primary section) ────────────────
  scrollArea: { flexShrink: 0 },
  scrollContent: { paddingBottom: 24 },
});
