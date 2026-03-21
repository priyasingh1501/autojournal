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
import { PendingClip } from '../types';
import ComposeModal from '../components/ComposeModal';
import WeeklyInsightCard from '../components/WeeklyInsightCard';
import { WIDGET_MONITORING_KEY } from '../widgets/widgetTaskHandler';

export default function HomeScreen() {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [pendingClips, setPendingClips] = useState<PendingClip[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [showCompose, setShowCompose] = useState(false);
  const isTranscribingRef = React.useRef(false);

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
      },
      onError: (err) => {
        if (err === '__BATCH_READY__') {
          handleTranscribeNow();
        } else {
          Alert.alert('Error', err);
        }
      },
    });
  }, []);

  useEffect(() => {
    if (status === 'monitoring' || status === 'recording') {
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
    }
  };

  const handleDiscardPending = () => {
    Alert.alert(
      'Discard Clips',
      `Delete all ${pendingClips.length} unprocessed audio clip${pendingClips.length !== 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            await StorageService.clearPendingClips();
            setPendingClips([]);
          },
        },
      ],
    );
  };

  const getStatusText = () => {
    switch (status) {
      case 'idle': return 'Tap to start monitoring';
      case 'monitoring': return 'Listening...';
      case 'recording': return 'Recording your voice';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'idle': return 'rgba(152, 212, 250, 0.65)';
      case 'monitoring': return 'rgba(224, 242, 254, 0.95)';
      case 'recording': return 'rgba(224, 242, 254, 0.95)';
    }
  };

  const isActive = status !== 'idle';
  const isTranscribing = batchProgress !== null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
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

            {pendingClips.length > 0 && (
              <Text style={styles.pendingCount}>
                {pendingClips.length} clip{pendingClips.length !== 1 ? 's' : ''} pending
              </Text>
            )}
          </View>
        </ImageBackground>
      </View>

      {/* Pending clips banner */}
      {pendingClips.length > 0 && (
        <View style={styles.pendingBanner}>
          {isTranscribing ? (
            <View style={styles.pendingRow}>
              <ActivityIndicator color="#f4a261" size="small" />
              <Text style={styles.pendingText}>
                Transcribing {batchProgress!.completed}/{batchProgress!.total}...
              </Text>
            </View>
          ) : (
            <View style={styles.pendingRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                <Feather name="music" size={12} color="#f4a261" />
                <Text style={styles.pendingText}>
                  {' '}{pendingClips.length} clip{pendingClips.length !== 1 ? 's' : ''} saved locally
                </Text>
              </View>
              <View style={styles.pendingActions}>
                <TouchableOpacity style={styles.transcribeButton} onPress={handleTranscribeNow}>
                  <Text style={styles.transcribeButtonText}>Transcribe</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.discardButton} onPress={handleDiscardPending}>
                  <Text style={styles.discardButtonText}>Discard</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Weekly insight card */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <WeeklyInsightCard />
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
  monitorCardBg: { width: '100%' },
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 },

  // ── FAB ───────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(9, 41, 173, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
});
