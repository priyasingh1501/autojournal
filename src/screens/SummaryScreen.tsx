import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { StorageService } from '../services/StorageService';
import { generateDailySummary } from '../services/SummaryService';
import { DailySummary } from '../types';

export default function SummaryScreen() {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');

  useFocusEffect(
    useCallback(() => {
      loadDates();
    }, [])
  );

  const loadDates = async () => {
    const today = new Date().toISOString().split('T')[0];
    const transcriptDates = await StorageService.getTranscriptDates();
    // Always include today so the user can generate a summary even before any transcripts exist
    const allDates = transcriptDates.includes(today)
      ? transcriptDates
      : [today, ...transcriptDates];
    setDates(allDates);
    selectDate(today);
  };

  const selectDate = async (date: string) => {
    setSelectedDate(date);
    const s = await StorageService.getSummaryForDate(date);
    setSummary(s);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const transcripts = await StorageService.getTranscriptsForDate(selectedDate);
      const result = await generateDailySummary(transcripts, selectedDate);
      setSummary(result);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date + 'T12:00:00');
    const today = new Date().toISOString().split('T')[0];
    if (date === today) return 'Today';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Date selector */}
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
      />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {summary ? (
          <View>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryDate}>
                {formatDate(summary.date)} Summary
              </Text>
              <Text style={styles.summaryMeta}>
                {summary.transcriptCount} voice entries
              </Text>
            </View>
            <Text style={styles.summaryText}>{summary.summary}</Text>
            <TouchableOpacity
              style={[styles.generateButton, styles.regenerateButton]}
              onPress={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.generateButtonText}>↻ Regenerate</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✨</Text>
            <Text style={styles.emptyTitle}>No summary yet</Text>
            <Text style={styles.emptySubtitle}>
              Generate a summary of your day based on all your voice recordings.
            </Text>
            <TouchableOpacity
              style={styles.generateButton}
              onPress={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.generateButtonText}>✨ Generate Summary</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  content: { flex: 1 },
  contentContainer: { padding: 20, flexGrow: 1 },
  summaryHeader: { marginBottom: 16 },
  summaryDate: { fontSize: 22, fontWeight: '700', color: '#ffffff' },
  summaryMeta: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  summaryText: {
    fontSize: 16,
    color: '#e5e7eb',
    lineHeight: 26,
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  generateButton: {
    backgroundColor: '#e94560',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  regenerateButton: { backgroundColor: '#374151' },
  generateButtonText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#ffffff', marginBottom: 10 },
  emptySubtitle: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
});
