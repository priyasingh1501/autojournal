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
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { audioRecorderService, RecordingStatus } from '../services/AudioRecorderService';
import { transcribePendingClips, BatchProgress } from '../services/BatchTranscriptionService';
import { StorageService } from '../services/StorageService';
import { TranscriptEntry, PendingClip } from '../types';
import ComposeModal from '../components/ComposeModal';
import WeeklyInsightCard from '../components/WeeklyInsightCard';
import { WIDGET_MONITORING_KEY } from '../widgets/widgetTaskHandler';

export default function HomeScreen() {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [todayTranscripts, setTodayTranscripts] = useState<TranscriptEntry[]>([]);
  const [pendingClips, setPendingClips] = useState<PendingClip[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [showCompose, setShowCompose] = useState(false);
  const isTranscribingRef = React.useRef(false);
  const [editingEntry, setEditingEntry] = useState<(TranscriptEntry & { date: string }) | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
      // When the screen gains focus (including via widget deeplink), check
      // whether the widget set a monitoring intent while the app was closed.
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
    const [entries, clips] = await Promise.all([
      StorageService.getTodayTranscripts(),
      StorageService.getPendingClips(),
    ]);
    setTodayTranscripts(entries.reverse());
    setPendingClips(clips);
  };

  // ── Widget ↔ app sync ────────────────────────────────────────────────────
  // Called every time the Journal tab gains focus (including when the widget
  // deeplink opens the app).  Reads the shared AsyncStorage flag set by the
  // widget task handler and starts / stops monitoring to match.
  const syncWidgetMonitoringIntent = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const val = await AsyncStorage.getItem(WIDGET_MONITORING_KEY);
      // Use audioRecorderService.getStatus() — always live, never a stale closure
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

  // Persist the new monitoring state to AsyncStorage so the widget reflects it,
  // then ask react-native-android-widget to re-render the widget UI.
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
    if (isTranscribingRef.current) return; // always current, no stale closure
    isTranscribingRef.current = true;
    setBatchProgress({ total: 0, completed: 0, failed: 0 });
    try {
      await transcribePendingClips(
        (progress) => setBatchProgress(progress),
        (entry) => {
          // Called once with the single merged card after all clips are processed
          const today = new Date().toISOString().split('T')[0];
          const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
          if (entryDate === today) {
            setTodayTranscripts(prev => [entry, ...prev]);
          }
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
      case 'idle': return 'rgba(147, 210, 232, 0.5)';
      case 'monitoring': return '#48cae4';
      case 'recording': return '#48cae4';
    }
  };

  const handleManualEntrySaved = (entry: TranscriptEntry) => {
    const today = new Date().toISOString().split('T')[0];
    const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
    if (entryDate === today) {
      setTodayTranscripts(prev => [entry, ...prev]);
    }
  };

  const isActive = status !== 'idle';
  const isTranscribing = batchProgress !== null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Main Button */}
      <View style={styles.buttonSection}>
        {/* Outer glow ring */}
        <View style={[styles.glowRing, isActive && styles.glowRingActive]}>
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
        </View>

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
              <ActivityIndicator color="#f4a261" size="small" />
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

      {/* Weekly insight + today's entries — single scroll area */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <WeeklyInsightCard />

        <Text style={styles.sectionTitle}>Today</Text>
          {todayTranscripts.slice(0, 8).map((entry) => {
            const today = new Date().toISOString().split('T')[0];
            return (
              <View
                key={entry.id}
                style={[
                  styles.transcriptCard,
                  entry.kind === 'manual' && styles.transcriptCardManual,
                ]}
              >
                <View style={styles.transcriptCardHeader}>
                  <Text style={styles.kindBadge}>
                    {entry.kind === 'manual' ? '🗒️' : '🎙️'}
                  </Text>
                  <Text style={styles.transcriptTime}>
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => setEditingEntry({ ...entry, date: today })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.editBtnText}>✎</Text>
                  </TouchableOpacity>
                </View>
                {entry.text.length > 0 && (
                  <Text style={styles.transcriptText} numberOfLines={3}>
                    {entry.text}
                  </Text>
                )}
                {entry.photoUri && (
                  <Image
                    source={{ uri: entry.photoUri }}
                    style={styles.photoThumb}
                    resizeMode="cover"
                  />
                )}
              </View>
            );
          })}
          {todayTranscripts.length === 0 && (
            <Text style={styles.emptyText}>
              No entries yet.{'\n'}Tap the mic to start listening, or ✏️ to write.
            </Text>
          )}
      </ScrollView>

      {/* Compose FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCompose(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>✏️</Text>
      </TouchableOpacity>

      <ComposeModal
        visible={showCompose}
        onClose={() => setShowCompose(false)}
        onSaved={handleManualEntrySaved}
      />

      <ComposeModal
        visible={editingEntry !== null}
        editEntry={editingEntry ?? undefined}
        onClose={() => setEditingEntry(null)}
        onSaved={(updated) => {
          setEditingEntry(null);
          setTodayTranscripts(prev =>
            prev.map(e => (e.id === updated.id ? updated : e))
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#010c1a' },

  // ── Mic button section ────────────────────────────────────────────────────
  buttonSection: { alignItems: 'center', paddingVertical: 32 },

  glowRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(72, 202, 228, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRingActive: {
    backgroundColor: 'rgba(72, 202, 228, 0.14)',
  },

  mainButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(3, 18, 40, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(72, 202, 228, 0.4)',
    shadowColor: '#48cae4',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  mainButtonActive: {
    backgroundColor: '#48cae4',
    borderColor: '#48cae4',
    shadowOpacity: 0.35,
  },
  mainButtonIcon: { fontSize: 40 },

  statusText: { marginTop: 16, fontSize: 18, fontWeight: '600' },
  transcriptCount: { marginTop: 8, fontSize: 14, color: 'rgba(147, 210, 232, 0.35)' },

  // ── Pending banner ────────────────────────────────────────────────────────
  pendingBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: 'rgba(244, 162, 97, 0.15)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(244, 162, 97, 0.35)',
    shadowColor: '#48cae4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  pendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  pendingText: { color: '#f4a261', fontSize: 14, fontWeight: '500', flex: 1 },
  pendingActions: { flexDirection: 'row', gap: 8 },
  transcribeButton: {
    backgroundColor: '#f4a261',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  transcribeButtonText: { color: '#010c1a', fontSize: 13, fontWeight: '700' },
  discardButton: {
    backgroundColor: 'rgba(72, 202, 228, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.2)',
  },
  discardButtonText: { color: '#48cae4', fontSize: 13, fontWeight: '600' },

  // ── Scroll area ───────────────────────────────────────────────────────────
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 110 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(224, 242, 254, 0.95)',
    marginBottom: 12,
  },

  // ── Entry cards ───────────────────────────────────────────────────────────
  transcriptCard: {
    backgroundColor: 'rgba(3, 18, 40, 0.72)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.13)',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(72, 202, 228, 0.5)',
    shadowColor: '#48cae4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  transcriptCardManual: { borderLeftColor: 'rgba(0, 180, 216, 0.4)' },
  transcriptCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  kindBadge: { fontSize: 11 },
  transcriptTime: { fontSize: 12, color: 'rgba(147, 210, 232, 0.65)', flex: 1 },
  editBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(72, 202, 228, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: { color: '#48cae4', fontSize: 11, fontWeight: '700' },
  transcriptText: { fontSize: 15, color: 'rgba(147, 210, 232, 0.65)', lineHeight: 22 },
  photoThumb: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyText: {
    color: 'rgba(147, 210, 232, 0.35)',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    lineHeight: 24,
  },

  // ── FAB ───────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#48cae4',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#48cae4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  fabIcon: { fontSize: 22, color: '#010c1a' },
});
