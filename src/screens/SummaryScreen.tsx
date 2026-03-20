import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Markdown from 'react-native-markdown-display';
import { StorageService } from '../services/StorageService';
import { generateDailySummary } from '../services/SummaryService';
import { DailySummary } from '../types';

// Markdown styles — dark theme to match the app
const markdownStyles = {
  body: { color: '#e5e7eb', fontSize: 15, lineHeight: 24 },
  heading2: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700' as const,
    marginTop: 14,
    marginBottom: 4,
    borderBottomWidth: 0,
  },
  bullet_list: { marginLeft: 0 },
  bullet_list_item: { color: '#e5e7eb', marginBottom: 3 },
  bullet_list_icon: { color: '#818cf8', marginTop: 6 },
  strong: { color: '#ffffff', fontWeight: '700' as const },
  paragraph: { marginTop: 0, marginBottom: 6 },
};

export default function SummaryScreen() {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [generatingDate, setGeneratingDate] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadSummaries();
    }, [])
  );

  const loadSummaries = async () => {
    const dates = await StorageService.getSummaryDates();
    const all = await Promise.all(dates.map(d => StorageService.getSummaryForDate(d)));
    setSummaries(all.filter(Boolean) as DailySummary[]);
  };

  const today = new Date().toISOString().split('T')[0];

  const handleGenerate = async (date: string) => {
    if (generatingDate) return;
    setGeneratingDate(date);
    try {
      const transcripts = await StorageService.getTranscriptsForDate(date);
      if (transcripts.length === 0) {
        Alert.alert('No entries', `There are no journal entries for ${formatDate(date)}.`);
        return;
      }
      const result = await generateDailySummary(transcripts, date);
      setSummaries(prev => {
        const filtered = prev.filter(s => s.date !== date);
        return [result, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
      });
      setExpandedDate(date);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setGeneratingDate(null);
    }
  };

  const formatDate = (date: string): string => {
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
    if (date === todayStr) return 'Today';
    if (date === yesterdayStr) return 'Yesterday';
    return new Date(date + 'T12:00:00').toLocaleDateString([], {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  };

  const formatCreatedAt = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Strip markdown syntax for the 2-line collapsed preview
  const toPlainText = (md: string) =>
    md
      .replace(/^##\s+/gm, '')   // headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // bold
      .replace(/^\s*-\s+/gm, '• ')    // bullets
      .replace(/\n{2,}/g, ' ')
      .trim();

  const handleDownload = async (item: DailySummary) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Not supported', 'Sharing is not available on this device.');
        return;
      }
      const header =
        `AUTO JOURNAL — DAILY SUMMARY\n${formatDate(item.date)}\n${'─'.repeat(40)}\n`;
      const meta =
        `Entries: ${item.transcriptCount}  |  Generated: ${formatCreatedAt(item.createdAt)}\n\n`;
      const fileUri = FileSystem.cacheDirectory + `auto-journal-${item.date}.txt`;
      await FileSystem.writeAsStringAsync(fileUri, header + meta + item.summary + '\n', {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: `Save summary for ${formatDate(item.date)}`,
        UTI: 'public.plain-text',
      });
    } catch {
      Alert.alert('Error', 'Could not export the summary. Please try again.');
    }
  };

  const todaySummary = summaries.find(s => s.date === today);
  const isGeneratingToday = generatingDate === today;

  const renderItem = ({ item }: { item: DailySummary }) => {
    const isExpanded = expandedDate === item.date;
    const isGenerating = generatingDate === item.date;
    const preview = toPlainText(item.summary).slice(0, 130) + '…';

    return (
      <View style={[styles.card, isExpanded && styles.cardExpanded]}>
        {/* Header row — always tappable to expand/collapse */}
        <TouchableOpacity
          onPress={() => setExpandedDate(isExpanded ? null : item.date)}
          activeOpacity={0.8}
          style={styles.cardHeader}
        >
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
            <Text style={styles.cardMeta}>
              {item.transcriptCount} entr{item.transcriptCount !== 1 ? 'ies' : 'y'}
              {' · '}{formatCreatedAt(item.createdAt)}
            </Text>
          </View>
          <View style={styles.cardHeaderRight}>
            <TouchableOpacity
              onPress={() => handleDownload(item)}
              style={styles.iconBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.downloadText}>⬇</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleGenerate(item.date)}
              disabled={!!generatingDate}
              style={styles.iconBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isGenerating
                ? <ActivityIndicator size="small" color="#9ca3af" />
                : <Text style={styles.regenText}>↻</Text>}
            </TouchableOpacity>
            <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
          </View>
        </TouchableOpacity>

        {/* Body */}
        {isExpanded ? (
          <View style={styles.markdownWrapper}>
            <Markdown style={markdownStyles}>{item.summary}</Markdown>
          </View>
        ) : (
          <Text style={styles.preview} numberOfLines={2}>{preview}</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={summaries}
        keyExtractor={s => s.date}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✨</Text>
            <Text style={styles.emptyTitle}>No summaries yet</Text>
            <Text style={styles.emptySubtitle}>
              Summaries are auto-generated at 11:59 PM.{'\n'}
              Tap below to generate today's summary now.
            </Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, isGeneratingToday && styles.fabDisabled]}
        onPress={() => handleGenerate(today)}
        disabled={isGeneratingToday}
        activeOpacity={0.85}
      >
        {isGeneratingToday ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <>
            <Text style={styles.fabIcon}>{todaySummary ? '↻' : '✨'}</Text>
            <Text style={styles.fabLabel}>
              {todaySummary ? "Regenerate today's" : "Generate today's"}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  listContent: { padding: 16, paddingBottom: 110 },

  card: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#818cf8',
    overflow: 'hidden',
  },
  cardExpanded: { borderLeftColor: '#e94560' },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 10,
  },
  cardHeaderLeft: { flex: 1 },
  cardDate: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  cardMeta: { fontSize: 12, color: '#6b7280', marginTop: 3 },

  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 8 },
  iconBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#0f172a',
    alignItems: 'center', justifyContent: 'center',
  },
  downloadText: { color: '#60a5fa', fontSize: 13, fontWeight: '700' },
  regenText: { color: '#9ca3af', fontSize: 16, fontWeight: '700' },
  chevron: { color: '#6b7280', fontSize: 11 },

  preview: {
    fontSize: 14, color: '#9ca3af', lineHeight: 21,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  markdownWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f2d4e',
    marginTop: 0,
  },

  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#ffffff', marginBottom: 10 },
  emptySubtitle: { fontSize: 15, color: '#9ca3af', textAlign: 'center', lineHeight: 24 },

  fab: {
    position: 'absolute', bottom: 24, right: 20, left: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#e94560', borderRadius: 16, paddingVertical: 16,
    elevation: 6, shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  fabDisabled: { opacity: 0.6 },
  fabIcon: { fontSize: 18, color: '#ffffff' },
  fabLabel: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
});
