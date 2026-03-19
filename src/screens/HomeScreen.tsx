import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { audioRecorderService, RecordingStatus } from '../services/AudioRecorderService';
import { transcribePendingClips, BatchProgress } from '../services/BatchTranscriptionService';
import { StorageService } from '../services/StorageService';
import { TranscriptEntry, PendingClip } from '../types';

export default function HomeScreen() {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [todayTranscripts, setTodayTranscripts] = useState<TranscriptEntry[]>([]);
  const [pendingClips, setPendingClips] = useState<PendingClip[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));

  useFocusEffect(
    useCallback(() => {
      loadData();
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
    const [entries, clips] = await Promise.all([
      StorageService.getTodayTranscripts(),
      StorageService.getPendingClips(),
    ]);
    setTodayTranscripts(entries.reverse());
    setPendingClips(clips);
  };

  const toggleMonitoring = async () => {
    if (status === 'idle') {
      const settings = await StorageService.getSettings();
      if (!settings?.openaiApiKey || !settings?.anthropicApiKey) {
        Alert.alert('Setup Required', 'Please configure your API keys in Settings before starting.');
        return;
      }
      await audioRecorderService.startMonitoring();
    } else {
      await audioRecorderService.stopMonitoring();
    }
  };

  const handleTranscribeNow = async () => {
    if (batchProgress) return; // already running
    setBatchProgress({ total: 0, completed: 0, failed: 0 });
    await transcribePendingClips(
      (progress) => setBatchProgress(progress),
      (entry) => setTodayTranscripts(prev => [entry, ...prev]),
    );
    setPendingClips([]);
    setBatchProgress(null);
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
      case 'idle': return '#6b7280';
      case 'monitoring': return '#10b981';
      case 'recording': return '#e94560';
    }
  };

  const isActive = status !== 'idle';
  const isTranscribing = batchProgress !== null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Main Button */}
      <View style={styles.buttonSection}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.mainButton, isActive && styles.mainButtonActive]}
            onPress={toggleMonitoring}
            activeOpacity={0.8}
          >
            <Text style={styles.mainButtonIcon}>
              {status === 'idle' ? '🎙️' : status === 'recording' ? '🔴' : '👂'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <Text style={[styles.statusText, { color: getStatusColor() }]}>
          {getStatusText()}
        </Text>

        <Text style={styles.transcriptCount}>
          {todayTranscripts.length} transcripts · {pendingClips.length} pending
        </Text>
      </View>

      {/* Pending clips banner */}
      {pendingClips.length > 0 && (
        <View style={styles.pendingBanner}>
          {isTranscribing ? (
            <View style={styles.pendingRow}>
              <ActivityIndicator color="#f59e0b" size="small" />
              <Text style={styles.pendingText}>
                Transcribing {batchProgress!.completed}/{batchProgress!.total}...
              </Text>
            </View>
          ) : (
            <View style={styles.pendingRow}>
              <Text style={styles.pendingText}>
                🎵 {pendingClips.length} clip{pendingClips.length !== 1 ? 's' : ''} saved locally
              </Text>
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

      {/* Recent Transcripts */}
      <View style={styles.recentSection}>
        <Text style={styles.sectionTitle}>Recent</Text>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {todayTranscripts.slice(0, 5).map((entry) => (
            <View key={entry.id} style={styles.transcriptCard}>
              <Text style={styles.transcriptTime}>
                {new Date(entry.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              <Text style={styles.transcriptText} numberOfLines={3}>
                {entry.text}
              </Text>
            </View>
          ))}
          {todayTranscripts.length === 0 && (
            <Text style={styles.emptyText}>
              No transcripts yet. Start monitoring and tap "Transcribe" when ready.
            </Text>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  buttonSection: { alignItems: 'center', paddingVertical: 32 },
  mainButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#16213e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#6b7280',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  mainButtonActive: { borderColor: '#e94560', shadowColor: '#e94560' },
  mainButtonIcon: { fontSize: 48 },
  statusText: { marginTop: 16, fontSize: 18, fontWeight: '600' },
  transcriptCount: { marginTop: 8, fontSize: 14, color: '#6b7280' },
  pendingBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#1c1f2e',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f59e0b44',
  },
  pendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  pendingText: { color: '#f59e0b', fontSize: 14, fontWeight: '500', flex: 1 },
  pendingActions: { flexDirection: 'row', gap: 8 },
  transcribeButton: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  transcribeButtonText: { color: '#000', fontSize: 13, fontWeight: '700' },
  discardButton: {
    backgroundColor: '#374151',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  discardButtonText: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  recentSection: { flex: 1, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 12 },
  scrollView: { flex: 1 },
  transcriptCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#e94560',
  },
  transcriptTime: { fontSize: 12, color: '#9ca3af', marginBottom: 4 },
  transcriptText: { fontSize: 15, color: '#e5e7eb', lineHeight: 22 },
  emptyText: { color: '#6b7280', textAlign: 'center', marginTop: 40, fontSize: 15, lineHeight: 24 },
});
