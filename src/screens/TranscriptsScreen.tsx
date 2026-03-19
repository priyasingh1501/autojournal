import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { StorageService } from '../services/StorageService';
import { TranscriptEntry } from '../types';

export default function TranscriptsScreen() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadDates();
    }, [])
  );

  const loadDates = async () => {
    const d = await StorageService.getTranscriptDates();
    setDates(d);
    const today = new Date().toISOString().split('T')[0];
    const dateToShow = d.includes(today) ? today : d[0];
    if (dateToShow) selectDate(dateToShow);
  };

  const selectDate = async (date: string) => {
    setSelectedDate(date);
    const entries = await StorageService.getTranscriptsForDate(date);
    setTranscripts(entries.reverse());
  };

  const formatDate = (date: string) => {
    const d = new Date(date + 'T12:00:00');
    const today = new Date().toISOString().split('T')[0];
    if (date === today) return 'Today';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Date picker */}
      <FlatList
        horizontal
        data={dates}
        keyExtractor={(d) => d}
        showsHorizontalScrollIndicator={false}
        style={styles.datePicker}
        contentContainerStyle={styles.datePickerContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.dateChip, selectedDate === item && styles.dateChipSelected]}
            onPress={() => selectDate(item)}
          >
            <Text style={[styles.dateChipText, selectedDate === item && styles.dateChipTextSelected]}>
              {formatDate(item)}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No recordings yet</Text>
        }
      />

      {/* Transcripts list */}
      <FlatList
        data={transcripts}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTime}>
                {new Date(item.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </Text>
              <Text style={styles.cardDuration}>{item.duration.toFixed(1)}s</Text>
            </View>
            <Text style={styles.cardText}>{item.text}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {selectedDate ? 'No transcripts for this date' : 'No recordings yet'}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  datePicker: { maxHeight: 60, flexGrow: 0 },
  datePickerContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  dateChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#374151',
  },
  dateChipSelected: { backgroundColor: '#e94560', borderColor: '#e94560' },
  dateChipText: { color: '#9ca3af', fontSize: 14, fontWeight: '500' },
  dateChipTextSelected: { color: '#ffffff' },
  listContent: { padding: 16, gap: 10 },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTime: { fontSize: 12, color: '#9ca3af' },
  cardDuration: { fontSize: 12, color: '#6b7280' },
  cardText: { fontSize: 15, color: '#e5e7eb', lineHeight: 22 },
  emptyText: {
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 60,
    fontSize: 15,
  },
});
