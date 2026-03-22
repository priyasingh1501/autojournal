import React, { useState, useCallback, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
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
import { DailySummary } from '../types';
import TalkScreen from './TalkScreen';
import ChatScreen from './ChatScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.30;
const VELOCITY_THRESHOLD = 0.5;

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

// ── main component ────────────────────────────────────────────────────────────
export default function SummaryScreen() {
  const route = useRoute<any>();
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [generatingDate, setGeneratingDate] = useState<string | null>(null);
  const [callSummary, setCallSummary]   = useState<DailySummary | null>(null);
  const [chatSummary, setChatSummary]   = useState<DailySummary | null>(null);

  const pan = useRef(new Animated.ValueXY()).current;
  const isSwiping = useRef(false);
  // Always-fresh refs so PanResponder callbacks never close over stale state
  const currentIndexRef = useRef(0);
  const summariesRef    = useRef<DailySummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadSummaries().then(() => {
        // Jump to a specific date when navigated from Insights tab
        const jumpToDate: string | undefined = route?.params?.jumpToDate;
        if (jumpToDate) {
          const idx = summariesRef.current.findIndex(s => s.date === jumpToDate);
          if (idx !== -1) {
            setCurrentIndex(idx);
            currentIndexRef.current = idx;
          }
        }
      });
    }, [route?.params?.jumpToDate])
  );

  const loadSummaries = async () => {
    const dates = await StorageService.getSummaryDates();
    const all = await Promise.all(dates.map(d => StorageService.getSummaryForDate(d)));
    const valid = all.filter(Boolean) as DailySummary[];
    summariesRef.current = valid;
    setSummaries(valid);
    setCurrentIndex(prev => {
      const next = valid.length === 0 ? 0 : Math.min(prev, valid.length - 1);
      currentIndexRef.current = next;
      return next;
    });
  };

  // ── swipe mechanics ──────────────────────────────────────────────────────
  // Use refs so the PanResponder (created once) always sees fresh values.
  const snapBack = useCallback(() => {
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 7 }).start();
  }, []);

  // Put snapBack in a ref so the one-time panResponder closure can call the latest version
  const snapBackRef = useRef(snapBack);
  snapBackRef.current = snapBack;

  const swipeOff = useCallback((direction: 1 | -1) => {
    if (isSwiping.current) return;
    const idx = currentIndexRef.current;
    const total = summariesRef.current.length;
    // swipe left (direction -1) → newer → decrement; snap back if already at newest (idx 0)
    // swipe right (direction  1) → older → increment; snap back if already at oldest
    if (direction === -1 && idx === 0) { snapBackRef.current(); return; }
    if (direction ===  1 && idx >= total - 1) { snapBackRef.current(); return; }

    isSwiping.current = true;
    Animated.timing(pan, {
      toValue: { x: direction * SCREEN_WIDTH * 1.5, y: 0 },
      duration: 260,
      useNativeDriver: true,
    }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      const next = direction === 1 ? idx + 1 : idx - 1;
      currentIndexRef.current = next;
      setCurrentIndex(next);
      isSwiping.current = false;
    });
  }, []);

  const swipeOffRef = useRef(swipeOff);
  swipeOffRef.current = swipeOff;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      // Capture phase — fires BEFORE the ScrollView sees the touch, so we can
      // steal clearly-horizontal swipes away from the inner ScrollView.
      onMoveShouldSetPanResponderCapture: (_, gs) =>
        !isSwiping.current &&
        Math.abs(gs.dx) > Math.abs(gs.dy) * 2.5 &&
        Math.abs(gs.dx) > 12,
      onMoveShouldSetPanResponder: () => false,
      onPanResponderMove: (_, gs) => {
        pan.setValue({ x: gs.dx, y: gs.dy * 0.06 });
      },
      onPanResponderRelease: (_, gs) => {
        const shouldSwipe =
          Math.abs(gs.dx) > SWIPE_THRESHOLD || Math.abs(gs.vx) > VELOCITY_THRESHOLD;
        if (shouldSwipe) swipeOffRef.current(gs.dx > 0 ? 1 : -1);
        else snapBackRef.current();
      },
      onPanResponderTerminate: () => snapBackRef.current(),
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
    <>
      {/* Jellyfish image header */}
      {item.imageUri ? (
        <ImageBackground
          source={{ uri: item.imageUri }}
          style={styles.cardImageHeader}
          imageStyle={styles.cardImageStyle}
          resizeMode="cover"
        >
          {/* Fade-to-card gradient at the bottom */}
          <LinearGradient
            colors={['transparent', 'rgba(2,6,14,0.55)', 'rgba(2,6,14,0.92)']}
            style={StyleSheet.absoluteFill}
          />
          {/* Date + actions pinned over the image */}
          <View style={styles.cardHeaderOnImage}>
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
            )}
          </View>
        </ImageBackground>
      ) : (
        /* Fallback header when no image yet */
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
          )}
        </View>
      )}

      {/* Scrollable body */}
      <ScrollView
        style={styles.cardScrollView}
        showsVerticalScrollIndicator={false}
        scrollEnabled={isTop}
        nestedScrollEnabled={true}
        contentContainerStyle={styles.cardScroll}
      >
        {/* Five-section insights */}
        {item.insightText ? (
          <View style={styles.insightSection}>
            {renderInsightSections(item.insightText)}
          </View>
        ) : null}

        {/* Reflection — generated from Call / Chat session */}
        {item.reflectionText ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.breakdownLabel}>REFLECTION</Text>
            <Text style={styles.reflectionText}>{item.reflectionText}</Text>
          </>
        ) : null}

        {/* Full breakdown */}
        <View style={styles.divider} />
        <Text style={styles.breakdownLabel}>FULL BREAKDOWN</Text>
        <Markdown style={markdownStyles}>{item.summary}</Markdown>
      </ScrollView>

      {/* Sticky dual CTA — Call + Chat */}
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

  // ── card stack render ─────────────────────────────────────────────────────
  const current = summaries[currentIndex];
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Summaries</Text>
        <View style={styles.topBarRight}>
          {summaries.length > 0 && currentIndex < summaries.length && (
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

      {/* Card stack — fills all space between top bar and tab bar */}
      <View style={styles.stackContainer}>
        {summaries.length === 0 ? (
          /* Empty state */
          <View style={[styles.card, styles.placeholderCard]}>
            <Feather name="star" size={44} color="rgba(152, 212, 250, 0.40)" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyTitle}>No summaries yet</Text>
            <Text style={styles.emptySubtitle}>
              Summaries auto-generate at 11:59 PM.{'\n'}Tap below to generate today's now.
            </Text>
          </View>
        ) : currentIndex >= summaries.length ? (
          /* All swiped through */
          <View style={[styles.card, styles.placeholderCard]}>
            <Feather name="check-circle" size={44} color="rgba(152, 212, 250, 0.40)" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>You've reviewed all your summaries.</Text>
            <TouchableOpacity style={styles.restartBtn} onPress={() => setCurrentIndex(0)}>
              <Text style={styles.restartBtnText}>← Start over</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Peek card — the next card sits stationary behind the top card */}
            {currentIndex + 1 < summaries.length && (
              <View style={[styles.card, styles.peekCard]} pointerEvents="none">
                {renderCardContent(summaries[currentIndex + 1], false)}
              </View>
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
                <Text style={styles.swipeLabelText}>← NEWER</Text>
              </Animated.View>
              <Animated.View style={[styles.swipeLabel, styles.swipeLabelRight, { opacity: rightLabelOpacity }]}>
                <Text style={styles.swipeLabelText}>OLDER →</Text>
              </Animated.View>
            </Animated.View>
          </>
        )}
      </View>

      {/* Bottom nav row — sits outside the card, above the tab bar */}
      {summaries.length > 0 && currentIndex < summaries.length && (
        <View style={styles.navRow}>
          {currentIndex > 0 ? (
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => {
                if (!isSwiping.current) {
                  const next = currentIndexRef.current - 1;
                  currentIndexRef.current = next;
                  setCurrentIndex(next);
                }
              }}
            >
              <Text style={styles.navBtnText}>Newer →</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.navPlaceholder} />
          )}
          <Text style={styles.swipeHint}>swipe to go back in time</Text>
          <View style={styles.navPlaceholder} />
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
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  screenTitle: { fontSize: 22, fontWeight: '500', color: 'rgba(224, 242, 254, 0.95)', fontFamily: 'Baskerville' },
  counter: { fontSize: 13, color: 'rgba(152, 212, 250, 0.50)', fontFamily: 'GillSans-Light' },
  generateLink: {
    fontSize: 14,
    color: 'rgba(152, 212, 250, 0.80)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.2,
  },

  // ── Card stack container ─────────────────────────────────────────────────
  stackContainer: {
    flex: 1,
    backgroundColor: '#02060E',
  },

  // ── Cards ─────────────────────────────────────────────────────────────────
  card: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 16,
    right: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#02060E',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.13)',
  },
  peekCard: {
    // Sits behind the top card: slightly smaller + shifted down to create a stack illusion
    transform: [{ scale: 0.95 }, { translateY: 10 }],
    opacity: 0.55,
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
  },

  // ── Card image header ─────────────────────────────────────────────────────
  cardImageHeader: {
    width: '100%',
    height: 190,
    justifyContent: 'flex-end',
  },
  cardImageStyle: {
    opacity: 0.90,
  },
  cardHeaderOnImage: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },

  // ── Card inner content ────────────────────────────────────────────────────
  cardScroll: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 24 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 18,
    paddingBottom: 0,
  },
  cardHeaderLeft: { flex: 1 },
  cardDate: { fontSize: 20, fontWeight: '500', color: 'rgba(224, 242, 254, 0.95)', marginBottom: 3, fontFamily: 'Baskerville' },
  cardMeta: { fontSize: 12, color: 'rgba(152, 212, 250, 0.60)', fontFamily: 'GillSans-Light' },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(2, 6, 14, 0.60)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardScrollView: { flex: 1, backgroundColor: '#02060E' },
  insightSection: { marginBottom: 8 },
  divider: { height: 1, backgroundColor: 'rgba(9, 41, 173, 0.08)', marginBottom: 12, marginTop: 4 },
  breakdownLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(152, 212, 250, 0.60)',
    letterSpacing: 0.8,
    marginBottom: 8,
    fontFamily: 'GillSans-Light',
  },
  reflectionText: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(224, 242, 254, 0.75)',
    fontFamily: 'Baskerville',
    fontStyle: 'italic',
    marginBottom: 4,
  },

  // ── Swipe direction labels ─────────────────────────────────────────────────
  swipeLabel: {
    position: 'absolute',
    top: 22,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 2.5,
  },
  swipeLabelLeft: { left: 16, borderColor: '#98D4FA' },
  swipeLabelRight: { right: 16, borderColor: '#98D4FA' },
  swipeLabelText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(152, 212, 250, 0.85)',
    letterSpacing: 1.5,
    fontFamily: 'GillSans-Light',
  },

  // ── Empty / done states ───────────────────────────────────────────────────
  emptyTitle: { fontSize: 20, fontWeight: '500', color: 'rgba(224, 242, 254, 0.95)', marginBottom: 8, fontFamily: 'Baskerville' },
  emptySubtitle: {
    fontSize: 14,
    color: 'rgba(152, 212, 250, 0.60)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 28,
    fontFamily: 'GillSans-Light',
  },
  restartBtn: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(9, 41, 173, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.20)',
  },
  restartBtnText: { color: 'rgba(152, 212, 250, 0.85)', fontSize: 14, fontWeight: '500', fontFamily: 'GillSans-Light' },

  // ── Bottom nav ─────────────────────────────────────────────────────────────
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  navBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: 'rgba(9, 41, 173, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.20)',
  },
  navBtnText: { color: 'rgba(152, 212, 250, 0.85)', fontSize: 13, fontWeight: '500', fontFamily: 'GillSans-Light' },
  navPlaceholder: { width: 80 },
  swipeHint: { fontSize: 12, color: 'rgba(152, 212, 250, 0.60)', fontFamily: 'GillSans-Light' },


  // ── Dual CTA row — sticky at card bottom ─────────────────────────────────
  ctaRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(152, 212, 250, 0.12)',
  },
  ctaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 15,
  },
  ctaBtnCall: { backgroundColor: '#0929AD' },
  ctaBtnChat: { backgroundColor: 'rgba(9, 41, 173, 0.45)' },
  ctaDivider: { width: 1, backgroundColor: 'rgba(152, 212, 250, 0.15)' },
  ctaBtnText: {
    fontSize: 15,
    color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.2,
  },
});
