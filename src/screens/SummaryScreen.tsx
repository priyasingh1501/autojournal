import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Markdown from 'react-native-markdown-display';
import { renderInsightSections } from '../components/InsightSections';
import { StorageService } from '../services/StorageService';
import { generateDailySummary } from '../services/SummaryService';
import { DailySummary } from '../types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.30;
const VELOCITY_THRESHOLD = 0.5;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.62;

// ── markdown styles ───────────────────────────────────────────────────────────
const markdownStyles = {
  body: { color: '#e5e7eb', fontSize: 14, lineHeight: 22 },
  heading2: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700' as const,
    marginTop: 12,
    marginBottom: 4,
    borderBottomWidth: 0,
  },
  bullet_list: { marginLeft: 0 },
  bullet_list_item: { color: '#e5e7eb', marginBottom: 2 },
  bullet_list_icon: { color: '#818cf8', marginTop: 5 },
  strong: { color: '#ffffff', fontWeight: '700' as const },
  paragraph: { marginTop: 0, marginBottom: 4 },
};

// ── helpers ───────────────────────────────────────────────────────────────────
function formatDate(date: string): string {
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  if (date === todayStr) return 'Today';
  if (date === yesterdayStr) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatCreatedAt(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toPlainText(md: string) {
  return md
    .replace(/^##\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^\s*-\s+/gm, '• ')
    .replace(/\n{2,}/g, ' ')
    .trim();
}

// ── main component ────────────────────────────────────────────────────────────
export default function SummaryScreen() {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [generatingDate, setGeneratingDate] = useState<string | null>(null);

  const pan = useRef(new Animated.ValueXY()).current;
  const nextScale = useRef(new Animated.Value(0.95)).current;
  const nextTranslateY = useRef(new Animated.Value(14)).current;
  const isSwiping = useRef(false);

  useFocusEffect(
    useCallback(() => { loadSummaries(); }, [])
  );

  const loadSummaries = async () => {
    const dates = await StorageService.getSummaryDates();
    const all = await Promise.all(dates.map(d => StorageService.getSummaryForDate(d)));
    const valid = all.filter(Boolean) as DailySummary[];
    setSummaries(valid);
    setCurrentIndex(prev => (valid.length === 0 ? 0 : Math.min(prev, valid.length - 1)));
  };

  // ── swipe mechanics ──────────────────────────────────────────────────────
  const swipeOff = (direction: 1 | -1) => {
    if (isSwiping.current) return;
    isSwiping.current = true;
    Animated.timing(pan, {
      toValue: { x: direction * SCREEN_WIDTH * 1.5, y: 0 },
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      nextScale.setValue(0.95);
      nextTranslateY.setValue(14);
      setCurrentIndex(prev => prev + 1);
      isSwiping.current = false;
    });
  };

  const snapBack = () => {
    Animated.parallel([
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 7 }),
      Animated.spring(nextScale, { toValue: 0.95, useNativeDriver: true }),
      Animated.spring(nextTranslateY, { toValue: 14, useNativeDriver: true }),
    ]).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Only claim the gesture when it's clearly horizontal
      onMoveShouldSetPanResponder: (_, gs) =>
        !isSwiping.current &&
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 &&
        Math.abs(gs.dx) > 12,
      onPanResponderMove: (_, gs) => {
        pan.setValue({ x: gs.dx, y: gs.dy * 0.08 });
        const progress = Math.min(Math.abs(gs.dx) / SWIPE_THRESHOLD, 1);
        nextScale.setValue(0.95 + progress * 0.05);
        nextTranslateY.setValue(14 - progress * 14);
      },
      onPanResponderRelease: (_, gs) => {
        const shouldSwipe =
          Math.abs(gs.dx) > SWIPE_THRESHOLD || Math.abs(gs.vx) > VELOCITY_THRESHOLD;
        if (shouldSwipe) {
          swipeOff(gs.dx > 0 ? 1 : -1);
        } else {
          snapBack();
        }
      },
      onPanResponderTerminate: () => snapBack(),
    })
  ).current;

  // ── generate / download ──────────────────────────────────────────────────
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
      setCurrentIndex(0);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setGeneratingDate(null);
    }
  };

  const handleDownload = async (item: DailySummary) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Not supported', 'Sharing is not available on this device.');
        return;
      }
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) {
        Alert.alert('Error', 'Device storage is not accessible. Please try again.');
        return;
      }
      const sep = '-'.repeat(40);
      const header = `AUTO JOURNAL - DAILY SUMMARY\n${formatDate(item.date)}\n${sep}\n`;
      const meta = `Entries: ${item.transcriptCount}  |  Generated: ${formatCreatedAt(item.createdAt)}\n\n`;
      const plainSummary = toPlainText(item.summary);
      const insightBlock = item.insightText
        ? `\n${sep}\nDAILY INSIGHTS\n${sep}\n${item.insightText}\n`
        : '';
      const fileUri = cacheDir + `auto-journal-${item.date}.txt`;
      await FileSystem.writeAsStringAsync(fileUri, header + meta + plainSummary + insightBlock + '\n', {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: `Save summary for ${formatDate(item.date)}`,
        UTI: 'public.plain-text',
      });
    } catch (err: any) {
      Alert.alert('Export failed', err?.message ?? 'Could not export the summary. Please try again.');
    }
  };

  // ── card content ─────────────────────────────────────────────────────────
  const renderCardContent = (item: DailySummary, isTop: boolean) => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      scrollEnabled={isTop}
      contentContainerStyle={styles.cardScroll}
    >
      {/* Date + actions */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
          <Text style={styles.cardMeta}>
            {item.transcriptCount} entr{item.transcriptCount !== 1 ? 'ies' : 'y'}
            {' · '}generated {formatCreatedAt(item.createdAt)}
          </Text>
        </View>
        {isTop && (
          <View style={styles.cardActions}>
            <TouchableOpacity
              onPress={() => handleDownload(item)}
              style={styles.actionBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.downloadText}>⬇</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleGenerate(item.date)}
              disabled={!!generatingDate}
              style={styles.actionBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {generatingDate === item.date
                ? <ActivityIndicator size="small" color="#9ca3af" />
                : <Text style={styles.regenText}>↻</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Five-section insights */}
      {item.insightText ? (
        <View style={styles.insightSection}>
          {renderInsightSections(item.insightText)}
        </View>
      ) : null}

      {/* Full breakdown */}
      <View style={styles.divider} />
      <Text style={styles.breakdownLabel}>FULL BREAKDOWN</Text>
      <Markdown style={markdownStyles}>{item.summary}</Markdown>
    </ScrollView>
  );

  // ── card stack render ─────────────────────────────────────────────────────
  const current = summaries[currentIndex];
  const next = summaries[currentIndex + 1];
  const todaySummary = summaries.find(s => s.date === today);
  const isGeneratingToday = generatingDate === today;

  const rotate = pan.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  });

  // Overlay opacity for left/right swipe direction labels
  const leftLabelOpacity = pan.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 3, -40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const rightLabelOpacity = pan.x.interpolate({
    inputRange: [40, SCREEN_WIDTH / 3],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Summaries</Text>
        {summaries.length > 0 && currentIndex < summaries.length && (
          <Text style={styles.counter}>{currentIndex + 1} / {summaries.length}</Text>
        )}
      </View>

      {/* Card stack */}
      <View style={styles.stackContainer}>
        {summaries.length === 0 ? (
          /* Empty state */
          <View style={[styles.card, styles.placeholderCard]}>
            <Text style={styles.emptyIcon}>✨</Text>
            <Text style={styles.emptyTitle}>No summaries yet</Text>
            <Text style={styles.emptySubtitle}>
              Summaries auto-generate at 11:59 PM.{'\n'}Tap below to generate today's now.
            </Text>
          </View>
        ) : currentIndex >= summaries.length ? (
          /* All swiped through */
          <View style={[styles.card, styles.placeholderCard]}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>You've reviewed all your summaries.</Text>
            <TouchableOpacity style={styles.restartBtn} onPress={() => setCurrentIndex(0)}>
              <Text style={styles.restartBtnText}>← Start over</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Card behind (next in deck) — visible as a peek */}
            {next && (
              <Animated.View style={[
                styles.card, styles.cardBehind,
                { transform: [{ scale: nextScale }, { translateY: nextTranslateY }] },
              ]}>
                {renderCardContent(next, false)}
              </Animated.View>
            )}

            {/* Third card — static peek for depth */}
            {summaries[currentIndex + 2] && (
              <View style={[styles.card, styles.cardBehind2]} />
            )}

            {/* Top card — draggable */}
            <Animated.View
              style={[styles.card, {
                transform: [
                  { translateX: pan.x },
                  { translateY: pan.y },
                  { rotate },
                ],
              }]}
              {...panResponder.panHandlers}
            >
              {renderCardContent(current, true)}

              {/* Swipe direction overlays */}
              <Animated.View style={[styles.swipeLabel, styles.swipeLabelLeft, { opacity: leftLabelOpacity }]}>
                <Text style={styles.swipeLabelText}>OLDER</Text>
              </Animated.View>
              <Animated.View style={[styles.swipeLabel, styles.swipeLabelRight, { opacity: rightLabelOpacity }]}>
                <Text style={styles.swipeLabelText}>OLDER</Text>
              </Animated.View>
            </Animated.View>
          </>
        )}
      </View>

      {/* Bottom navigation row */}
      <View style={styles.navRow}>
        {currentIndex > 0 && currentIndex < summaries.length ? (
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => { if (!isSwiping.current) setCurrentIndex(prev => prev - 1); }}
          >
            <Text style={styles.navBtnText}>← Newer</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.navPlaceholder} />
        )}
        {summaries.length > 0 && currentIndex < summaries.length && (
          <Text style={styles.swipeHint}>swipe to go back in time</Text>
        )}
        <View style={styles.navPlaceholder} />
      </View>

      {/* Spacer so FAB doesn't cover navRow */}
      <View style={styles.fabSpacer} />

      {/* FAB — generate today's summary */}
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

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  screenTitle: { fontSize: 22, fontWeight: '700', color: '#ffffff' },
  counter: { fontSize: 14, color: '#6b7280' },

  // Card stack container — fixed height so cards are centered
  stackContainer: {
    height: CARD_HEIGHT + 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Cards — all absolutely positioned inside stackContainer
  card: {
    position: 'absolute',
    width: SCREEN_WIDTH - 32,
    height: CARD_HEIGHT,
    backgroundColor: '#16213e',
    borderRadius: 20,
    overflow: 'hidden',
    borderLeftWidth: 3,
    borderLeftColor: '#818cf8',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  cardBehind: {
    // animated scale + translateY applied inline
  },
  cardBehind2: {
    transform: [{ scale: 0.88 }, { translateY: 24 }],
    opacity: 0.5,
  },
  placeholderCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftColor: '#374151',
  },

  // Card inner content
  cardScroll: { padding: 18, paddingBottom: 40 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  cardHeaderLeft: { flex: 1 },
  cardDate: { fontSize: 20, fontWeight: '700', color: '#ffffff', marginBottom: 3 },
  cardMeta: { fontSize: 12, color: '#6b7280' },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#0f172a',
    alignItems: 'center', justifyContent: 'center',
  },
  downloadText: { color: '#60a5fa', fontSize: 14, fontWeight: '700' },
  regenText: { color: '#9ca3af', fontSize: 17, fontWeight: '700' },

  insightSection: { marginBottom: 8 },
  divider: { height: 1, backgroundColor: '#1f2d4e', marginBottom: 12, marginTop: 4 },
  breakdownLabel: {
    fontSize: 10, fontWeight: '700', color: '#374151',
    letterSpacing: 0.8, marginBottom: 8,
  },

  // Swipe direction labels (like Tinder LIKE/NOPE)
  swipeLabel: {
    position: 'absolute',
    top: 22,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 2.5,
  },
  swipeLabelLeft: { left: 16, borderColor: '#e94560' },
  swipeLabelRight: { right: 16, borderColor: '#e94560' },
  swipeLabelText: {
    fontSize: 13, fontWeight: '900', color: '#e94560', letterSpacing: 1.5,
  },

  // Empty / done states
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
  emptySubtitle: {
    fontSize: 14, color: '#9ca3af', textAlign: 'center',
    lineHeight: 22, paddingHorizontal: 28,
  },
  restartBtn: {
    marginTop: 24, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: '#1a1a2e', borderRadius: 12,
    borderWidth: 1, borderColor: '#374151',
  },
  restartBtnText: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },

  // Bottom nav
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  navBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: '#16213e', borderRadius: 10,
    borderWidth: 1, borderColor: '#374151',
  },
  navBtnText: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  navPlaceholder: { width: 80 },
  swipeHint: { fontSize: 12, color: '#374151' },

  // FAB
  fabSpacer: { height: 72 },
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
