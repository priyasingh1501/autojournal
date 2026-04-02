import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Dimensions,
  ImageBackground,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Markdown from 'react-native-markdown-display';
import { renderInsightSections } from '../components/InsightSections';
import { StorageService } from '../services/StorageService';
import { generateDailySummary } from '../services/SummaryService';
import { generateIfNeeded } from '../services/AutoSummaryService';
import { DailySummary } from '../types';
import TalkScreen from './TalkScreen';
import ChatScreen from './ChatScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── markdown styles ───────────────────────────────────────────────────────────
const markdownStyles = {
  body: { color: 'rgba(152, 212, 250, 0.65)', fontSize: 14, lineHeight: 22, fontFamily: 'GillSans-Light' },
  heading2: {
    color: 'rgba(224, 242, 254, 0.95)',
    fontSize: 15,
    fontWeight: '500' as const,
    fontFamily: 'Baskerville',
    marginTop: 12,
    marginBottom: 4,
    borderBottomWidth: 0,
  },
  bullet_list: { marginLeft: 0 },
  bullet_list_item: { color: 'rgba(152, 212, 250, 0.65)', marginBottom: 2, fontFamily: 'GillSans-Light' },
  bullet_list_icon: { color: 'rgba(152, 212, 250, 0.85)', marginTop: 5 },
  strong: { color: 'rgba(224, 242, 254, 0.95)', fontWeight: '500' as const, fontFamily: 'GillSans-Light' },
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

// ── stale entries banner ──────────────────────────────────────────────────────

function StaleBanner({
  item,
  onRegenerate,
  generating,
}: {
  item: DailySummary;
  onRegenerate: () => void;
  generating: boolean;
}) {
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    StorageService.getTranscriptsForDate(item.date).then(transcripts => {
      // If createdAt is missing (old summary), fall back to the latest transcript
      // timestamp so we don't falsely flag all entries as newer
      const createdAt = item.createdAt
        ?? Math.max(...transcripts.map(t => t.timestamp), 0);
      const newer = transcripts.filter(t => t.timestamp > createdAt).length;
      setNewCount(newer);
    }).catch(() => {});
  }, [item.date, item.createdAt]);

  if (newCount === 0) return null;

  return (
    <View style={sb.wrap}>
      <Feather name="clock" size={11} color="rgba(152,212,250,0.55)" />
      <Text style={sb.text}>
        {newCount} new entr{newCount === 1 ? 'y' : 'ies'} since this summary
      </Text>
      <TouchableOpacity
        onPress={onRegenerate}
        disabled={generating}
        style={[sb.btn, generating && { opacity: 0.5 }]}
        activeOpacity={0.75}
      >
        <Text style={sb.btnText}>{generating ? 'Regenerating…' : 'Regenerate'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const sb = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: 'rgba(9,41,173,0.14)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(152,212,250,0.10)',
  },
  text: {
    flex: 1, fontSize: 11, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.65)',
  },
  btn: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: 'rgba(9,41,173,0.40)',
    borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.28)',
  },
  btnText: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.90)' },
});

// ── main component ────────────────────────────────────────────────────────────
export default function SummaryScreen() {
  const route = useRoute<any>();
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [generatingDate, setGeneratingDate] = useState<string | null>(null);
  const [callSummary, setCallSummary] = useState<DailySummary | null>(null);
  const [chatSummary, setChatSummary] = useState<DailySummary | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  const flatListRef = useRef<FlatList<DailySummary>>(null);
  const currentIndexRef = useRef(0);
  const summariesRef = useRef<DailySummary[]>([]);
  // Ref-based guard so handleGenerate stays a stable useCallback([]) reference,
  // preventing renderItem from being recreated on every generate start/end.
  const generatingRef = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
      // Load immediately, then also try to auto-generate any missing summaries
      // and reload so they appear without the user having to navigate away and back
      loadSummaries().then(() => {
        const jumpToDate: string | undefined = route?.params?.jumpToDate;
        if (jumpToDate) {
          const idx = summariesRef.current.findIndex(s => s.date === jumpToDate);
          if (idx !== -1) scrollToIndex(idx, false);
        }
      });
      // Catch-up generation: generate yesterday's summary if missing, then reload.
      // Preserve the date the user is currently viewing so the index doesn't jump
      // when the new summary is prepended at position 0.
      generateIfNeeded(yesterday).then(generated => {
        if (generated) {
          const viewingDate = summariesRef.current[currentIndexRef.current]?.date;
          loadSummaries().then(() => {
            if (viewingDate) {
              const idx = summariesRef.current.findIndex(s => s.date === viewingDate);
              if (idx !== -1) scrollToIndex(idx, false);
            }
          });
        }
      }).catch(() => {});
    }, [route?.params?.jumpToDate])
  );

  const loadSummaries = async () => {
    const dates = await StorageService.getSummaryDates();
    const all = await Promise.all(dates.map(d => StorageService.getSummaryForDate(d)));
    const valid = all.filter(Boolean) as DailySummary[];
    summariesRef.current = valid;
    setSummaries(valid);
    const clamped = valid.length === 0 ? 0 : Math.min(currentIndexRef.current, valid.length - 1);
    currentIndexRef.current = clamped;
    setCurrentIndex(clamped);
  };

  const scrollToIndex = (idx: number, animated = true) => {
    currentIndexRef.current = idx;
    setCurrentIndex(idx);
    // Slight delay so FlatList has mounted/updated before scrolling
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: idx, animated, viewPosition: 0 });
    }, 50);
  };

  // ── generate / download ──────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];

  const handleGenerate = useCallback(async (date: string) => {
    // Use a ref guard (not state) so this callback stays stable and renderItem
    // doesn't re-create on every generate start/end cycle.
    if (generatingRef.current) return;
    generatingRef.current = date;
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
        const next = [result, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
        summariesRef.current = next;
        // Scroll to the regenerated card's new position
        const newIdx = next.findIndex(s => s.date === date);
        if (newIdx !== -1) setTimeout(() => scrollToIndex(newIdx), 50);
        return next;
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      generatingRef.current = null;
      setGeneratingDate(null);
    }
  }, []);

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
      Alert.alert('Export failed', err?.message ?? 'Could not export the summary.');
    }
  };

  // ── card content ─────────────────────────────────────────────────────────
  const renderCardContent = (item: DailySummary) => (
    <>
      {item.imageUri ? (
        <ImageBackground
          source={{ uri: item.imageUri }}
          style={styles.cardImageHeader}
          imageStyle={styles.cardImageStyle}
          resizeMode="cover"
        >
          <LinearGradient
            colors={['transparent', 'rgba(2,6,14,0.55)', 'rgba(2,6,14,0.92)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.cardHeaderOnImage}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
              <Text style={styles.cardMeta}>
                {item.transcriptCount} entr{item.transcriptCount !== 1 ? 'ies' : 'y'}
                {' · '}generated {formatCreatedAt(item.createdAt)}
              </Text>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                onPress={() => handleDownload(item)}
                style={styles.actionBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="download" size={13} color="rgba(152, 212, 250, 0.85)" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleGenerate(item.date)}
                disabled={!!generatingDate}
                style={styles.actionBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {generatingDate === item.date
                  ? <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.65)" />
                  : <Feather name="refresh-cw" size={13} color="rgba(152, 212, 250, 0.65)" />}
              </TouchableOpacity>
            </View>
          </View>
        </ImageBackground>
      ) : (
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
            <Text style={styles.cardMeta}>
              {item.transcriptCount} entr{item.transcriptCount !== 1 ? 'ies' : 'y'}
              {' · '}generated {formatCreatedAt(item.createdAt)}
            </Text>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity
              onPress={() => handleDownload(item)}
              style={styles.actionBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="download" size={13} color="rgba(152, 212, 250, 0.85)" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleGenerate(item.date)}
              disabled={!!generatingDate}
              style={styles.actionBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {generatingDate === item.date
                ? <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.65)" />
                : <Feather name="refresh-cw" size={13} color="rgba(152, 212, 250, 0.65)" />}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <StaleBanner
        item={item}
        onRegenerate={() => handleGenerate(item.date)}
        generating={generatingDate === item.date}
      />

      <ScrollView
        style={styles.cardScrollView}
        contentContainerStyle={styles.cardScroll}
        showsVerticalScrollIndicator={false}
        directionalLockEnabled={true}
      >
        {item.insightText ? (
          <View style={styles.insightSection}>
            {renderInsightSections(item.insightText)}
          </View>
        ) : null}

        {item.reflectionText ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.breakdownLabel}>REFLECTION</Text>
            <Text style={styles.reflectionText}>{item.reflectionText}</Text>
          </>
        ) : null}

        <View style={styles.divider} />
        <Text style={styles.breakdownLabel}>FULL BREAKDOWN</Text>
        <Markdown style={markdownStyles}>{item.summary}</Markdown>
      </ScrollView>

      <View style={styles.ctaRow}>
        <TouchableOpacity
          style={[styles.ctaBtn, styles.ctaBtnCall]}
          onPress={() => setCallSummary(item)}
          activeOpacity={0.85}
        >
          <Feather name="phone" size={15} color="rgba(224, 242, 254, 0.95)" />
          <Text style={styles.ctaBtnText}>Call</Text>
        </TouchableOpacity>
        <View style={styles.ctaDivider} />
        <TouchableOpacity
          style={[styles.ctaBtn, styles.ctaBtnChat]}
          onPress={() => setChatSummary(item)}
          activeOpacity={0.85}
        >
          <Feather name="message-circle" size={15} color="rgba(224, 242, 254, 0.95)" />
          <Text style={styles.ctaBtnText}>Chat</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  // ── FlatList item ─────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }: { item: DailySummary }) => (
    <View style={[styles.page, { height: containerHeight || undefined }]}>
      <View style={styles.card}>
        {renderCardContent(item)}
      </View>
    </View>
  ), [containerHeight, generatingDate, handleGenerate]);

  const todaySummary = summaries.find(s => s.date === today);
  const isGeneratingToday = generatingDate === today;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Summaries</Text>
        <View style={styles.topBarRight}>
          {summaries.length > 0 && (
            <Text style={styles.counter}>{currentIndex + 1} / {summaries.length}</Text>
          )}
          <TouchableOpacity
            onPress={() => handleGenerate(today)}
            disabled={isGeneratingToday}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {isGeneratingToday
              ? <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.70)" />
              : <Text style={styles.generateLink}>
                  {todaySummary ? 'Regenerate' : '+ Generate'}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* Card area */}
      <View
        style={styles.stackContainer}
        onLayout={e => setContainerHeight(e.nativeEvent.layout.height)}
      >
        {summaries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="star" size={44} color="rgba(152, 212, 250, 0.40)" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyTitle}>No summaries yet</Text>
            <Text style={styles.emptySubtitle}>
              Summaries auto-generate at 11:59 PM.{'\n'}Tap above to generate today's now.
            </Text>
          </View>
        ) : containerHeight > 0 ? (
          <FlatList
            ref={flatListRef}
            data={summaries}
            keyExtractor={item => item.date}
            renderItem={renderItem}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            initialScrollIndex={currentIndex}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index,
            })}
            onMomentumScrollEnd={e => {
              const newIdx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              currentIndexRef.current = newIdx;
              setCurrentIndex(newIdx);
            }}
            // Scroll-to-index failures (sparse data) — fail silently
            onScrollToIndexFailed={info => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
              }, 100);
            }}
          />
        ) : null}
      </View>

      {/* Bottom nav */}
      {summaries.length > 0 && (
        <View style={styles.navRow}>
          {currentIndex > 0 ? (
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => scrollToIndex(currentIndex - 1)}
            >
              <Text style={styles.navBtnText}>← Newer</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.navPlaceholder} />
          )}
          <Text style={styles.swipeHint}>swipe to go back in time</Text>
          {currentIndex < summaries.length - 1 ? (
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => scrollToIndex(currentIndex + 1)}
            >
              <Text style={styles.navBtnText}>Older →</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.navPlaceholder} />
          )}
        </View>
      )}

      {/* Call modal */}
      <Modal
        visible={!!callSummary}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => { setCallSummary(null); loadSummaries(); }}
      >
        {callSummary && (
          <TalkScreen
            summary={callSummary}
            onClose={() => { setCallSummary(null); loadSummaries(); }}
          />
        )}
      </Modal>

      {/* Chat modal */}
      <Modal
        visible={!!chatSummary}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => { setChatSummary(null); loadSummaries(); }}
      >
        {chatSummary && (
          <ChatScreen
            summary={chatSummary}
            onClose={() => { setChatSummary(null); loadSummaries(); }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },

  // ── Top bar ───────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  screenTitle: { fontSize: 22, fontWeight: '500', color: 'rgba(224, 242, 254, 0.95)', fontFamily: 'Baskerville' },
  counter: { fontSize: 13, color: 'rgba(152, 212, 250, 0.50)', fontFamily: 'GillSans-Light' },
  generateLink: {
    fontSize: 14, color: 'rgba(152, 212, 250, 0.80)',
    fontFamily: 'GillSans-Light', letterSpacing: 0.2,
  },

  // ── Stack container + pages ───────────────────────────────────────────────
  stackContainer: { flex: 1 },

  // Each FlatList page is exactly SCREEN_WIDTH wide; card sits inside with margin
  page: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 16,
  },

  card: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#02060E',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.13)',
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyCard: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.13)',
    backgroundColor: '#02060E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 20, fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)', marginBottom: 8, fontFamily: 'Baskerville',
  },
  emptySubtitle: {
    fontSize: 14, color: 'rgba(152, 212, 250, 0.60)',
    textAlign: 'center', lineHeight: 22,
    paddingHorizontal: 28, fontFamily: 'GillSans-Light',
  },

  // ── Card image header ─────────────────────────────────────────────────────
  cardImageHeader: { width: '100%', height: 190, justifyContent: 'flex-end' },
  cardImageStyle: { opacity: 0.90 },
  cardHeaderOnImage: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-end', paddingHorizontal: 18, paddingBottom: 14,
  },

  // ── Card inner content ────────────────────────────────────────────────────
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', padding: 18, paddingBottom: 0,
  },
  cardHeaderLeft: { flex: 1 },
  cardDate: {
    fontSize: 20, fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)', marginBottom: 3, fontFamily: 'Baskerville',
  },
  cardMeta: { fontSize: 12, color: 'rgba(152, 212, 250, 0.60)', fontFamily: 'GillSans-Light' },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(2, 6, 14, 0.60)',
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.20)',
    alignItems: 'center', justifyContent: 'center',
  },

  cardScrollView: { flex: 1, backgroundColor: '#02060E' },
  cardScroll: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 24 },
  insightSection: { marginBottom: 8 },
  divider: {
    height: 1, backgroundColor: 'rgba(9, 41, 173, 0.08)',
    marginBottom: 12, marginTop: 4,
  },
  breakdownLabel: {
    fontSize: 10, fontWeight: '500',
    color: 'rgba(152, 212, 250, 0.60)', letterSpacing: 0.8,
    marginBottom: 8, fontFamily: 'GillSans-Light',
  },
  reflectionText: {
    fontSize: 14, lineHeight: 22,
    color: 'rgba(224, 242, 254, 0.75)',
    fontFamily: 'Baskerville', fontStyle: 'italic', marginBottom: 4,
  },

  // ── Bottom nav ─────────────────────────────────────────────────────────────
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 10,
  },
  navBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: 'rgba(9, 41, 173, 0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.20)',
  },
  navBtnText: {
    color: 'rgba(152, 212, 250, 0.85)', fontSize: 13,
    fontWeight: '500', fontFamily: 'GillSans-Light',
  },
  navPlaceholder: { width: 80 },
  swipeHint: { fontSize: 12, color: 'rgba(152, 212, 250, 0.60)', fontFamily: 'GillSans-Light' },

  // ── Dual CTA row ──────────────────────────────────────────────────────────
  ctaRow: {
    flexDirection: 'row',
    borderTopWidth: 1, borderTopColor: 'rgba(152, 212, 250, 0.12)',
  },
  ctaBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 7, paddingVertical: 15,
  },
  ctaBtnCall: { backgroundColor: '#0929AD' },
  ctaBtnChat: { backgroundColor: 'rgba(9, 41, 173, 0.45)' },
  ctaDivider: { width: 1, backgroundColor: 'rgba(152, 212, 250, 0.15)' },
  ctaBtnText: {
    fontSize: 15, color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'GillSans-Light', letterSpacing: 0.2,
  },
});
