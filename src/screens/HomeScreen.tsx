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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { audioRecorderService, RecordingStatus } from '../services/AudioRecorderService';
import { transcribePendingClips, BatchProgress } from '../services/BatchTranscriptionService';
import { StorageService } from '../services/StorageService';
import { generateDailySummary } from '../services/SummaryService';
import { PendingClip } from '../types';
import ComposeModal from '../components/ComposeModal';
import MonthlyInsightCard from '../components/MonthlyInsightCard';
import { WIDGET_MONITORING_KEY } from '../widgets/widgetTaskHandler';

export default function HomeScreen() {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [pendingClips, setPendingClips] = useState<PendingClip[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [showCompose, setShowCompose] = useState(false);
  const [cardRefreshKey, setCardRefreshKey] = useState(0);
  const isTranscribingRef = React.useRef(false);
  // Holds the pending auto-generate timer so additional notes reset the countdown
  const autoGenerateTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
      syncWidgetMonitoringIntent();
    }, [])
  );

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
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  const loadData = async () => {
    const clips = await StorageService.getPendingClips();
    setPendingClips(clips);
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
    setBatchProgress({ total: 0, completed: 0, failed: 0 });
    try {
      await transcribePendingClips(
        (progress) => setBatchProgress(progress),
        () => {
          // Entry saved to storage — Notes tab will show it on next focus
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

  const getStatusText = () => {
    switch (status) {
      case 'idle':      return 'Tap to record';
      case 'recording': return 'Recording — tap to stop';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'idle':      return 'rgba(152, 212, 250, 0.65)';
      case 'recording': return 'rgba(224, 242, 254, 0.95)';
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

      {/* Compose FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCompose(true)}
        activeOpacity={0.85}
      >
        <Feather name="edit-2" size={18} color="rgba(224, 242, 254, 0.8)" />
      </TouchableOpacity>

      <ComposeModal
        visible={showCompose}
        onClose={() => setShowCompose(false)}
        onSaved={() => setShowCompose(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },

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
    shadowOpacity: 0.22,
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
    backgroundColor: 'rgba(152, 212, 250, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRingActive: {
    backgroundColor: 'rgba(152, 212, 250, 0.10)',
    borderColor: 'rgba(152, 212, 250, 0.45)',
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

  // ── FAB ───────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0929AD',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.40)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 10,
  },
});
