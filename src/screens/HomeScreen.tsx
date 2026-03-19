import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { audioRecorderService, RecordingStatus } from '../services/AudioRecorderService';
import { StorageService } from '../services/StorageService';
import { TranscriptEntry } from '../types';

export default function HomeScreen() {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [todayTranscripts, setTodayTranscripts] = useState<TranscriptEntry[]>([]);
  const [pulseAnim] = useState(new Animated.Value(1));

  useFocusEffect(
    useCallback(() => {
      loadTodayTranscripts();
    }, [])
  );

  useEffect(() => {
    audioRecorderService.setCallbacks({
      onStatus: (s) => setStatus(s),
      onTranscript: (entry) => {
        setTodayTranscripts(prev => [entry, ...prev]);
      },
      onError: (err) => Alert.alert('Error', err),
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

  const loadTodayTranscripts = async () => {
    const entries = await StorageService.getTodayTranscripts();
    setTodayTranscripts(entries.reverse());
  };

  const toggleMonitoring = async () => {
    if (status === 'idle') {
      const settings = await StorageService.getSettings();
      if (!settings?.openaiApiKey || !settings?.anthropicApiKey) {
        Alert.alert(
          'Setup Required',
          'Please configure your API keys in Settings before starting.',
        );
        return;
      }
      await audioRecorderService.startMonitoring();
    } else {
      await audioRecorderService.stopMonitoring();
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'idle': return 'Tap to start monitoring';
      case 'monitoring': return 'Listening...';
      case 'recording': return 'Recording your voice';
      case 'transcribing': return 'Transcribing...';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'idle': return '#6b7280';
      case 'monitoring': return '#10b981';
      case 'recording': return '#e94560';
      case 'transcribing': return '#f59e0b';
    }
  };

  const isActive = status !== 'idle';

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
          {todayTranscripts.length} entries today
        </Text>
      </View>

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
              No recordings yet. Start monitoring to capture your thoughts.
            </Text>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  buttonSection: {
    alignItems: 'center',
    paddingVertical: 40,
  },
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
  mainButtonActive: {
    borderColor: '#e94560',
    shadowColor: '#e94560',
  },
  mainButtonIcon: { fontSize: 48 },
  statusText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
  },
  transcriptCount: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
  },
  recentSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  scrollView: { flex: 1 },
  transcriptCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#e94560',
  },
  transcriptTime: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
  },
  transcriptText: {
    fontSize: 15,
    color: '#e5e7eb',
    lineHeight: 22,
  },
  emptyText: {
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    lineHeight: 24,
  },
});
