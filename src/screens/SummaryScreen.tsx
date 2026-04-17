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
import NewDaySummaryView from '../components/NewDaySummaryView';
import { StorageService } from '../services/StorageService';
import { FeatureFlagsService } from '../services/FeatureFlagsService';
import { generateDailySummary, generateFullBreakdown } from '../services/SummaryService';
import { generateIfNeeded } from '../services/AutoSummaryService';
import { SubscriptionService } from '../services/SubscriptionService';
import PaywallModal from '../components/PaywallModal';
import { DailySummary, DayMacros, UserGoals } from '../types';
import TalkScreen from './TalkScreenV2';
import ChatScreen from './ChatScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
  const todayStr = localDateStr();
  const _yd = new Date(); _yd.setDate(_yd.getDate() - 1);
  const yesterdayStr = localDateStr(_yd);
  if (date === todayStr) return 'Today';
  if (date === yesterdayStr) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatCreatedAt(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(date: string): string {
  const todayStr = localDateStr();
  const _yd2 = new Date(); _yd2.setDate(_yd2.getDate() - 1);
  const yesterdayStr = localDateStr(_yd2);
  if (date === todayStr) return 'Today';
  if (date === yesterdayStr) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
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
  newCount,
  onRegenerate,
  generating,
}: {
  newCount: number;
  onRegenerate: () => void;
  generating: boolean;
}) {
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
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(9,41,173,0.18)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(152,212,250,0.14)',
  },
  text: {
    flex: 1, fontSize: 12, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.80)',
  },
  btn: {
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(9,41,173,0.50)',
    borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.35)',
  },
  btnText: { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.90)' },
});

// ── main component ────────────────────────────────────────────────────────────
export default function SummaryScreen() {
  const route = useRoute<any>();
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [staleCounts, setStaleCounts] = useState<Record<string, number>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [generatingDate, setGeneratingDate] = useState<string | null>(null);
  const [perspectiveSummary, setPerspectiveSummary] = useState<DailySummary | null>(null);
  const [callMindId, setCallMindId] = useState<string | null | undefined>(undefined); // undefined = not a call
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallHint, setPaywallHint] = useState<string | undefined>();
  const pendingPerspectiveRef = useRef<DailySummary | null>(null);
  const pendingGenerateDateRef = useRef<string | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [enabledTrackers, setEnabledTrackers] = useState<Set<string> | null>(null);
  const [mealMacrosByDate, setMealMacrosByDate] = useState<Record<string, DayMacros>>({});
  const [goals, setGoals] = useState<UserGoals | null>(null);
  const [expandedBreakdowns, setExpandedBreakdowns] = useState<Set<string>>(new Set());
  const [breakdownGenerating, setBreakdownGenerating] = useState<Set<string>>(new Set());
  const [newDaySummaryOn, setNewDaySummaryOn] = useState<boolean>(false);

  const flatListRef = useRef<FlatList<DailySummary>>(null);
  const currentIndexRef = useRef(0);
  const summariesRef = useRef<DailySummary[]>([]);
  // Ref-based guard so handleGenerate stays a stable useCallback([]) reference,
  // preventing renderItem from being recreated on every generate start/end.
  const generatingRef = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const _yd3 = new Date(); _yd3.setDate(_yd3.getDate() - 1);
      const yesterday = localDateStr(_yd3);
      // Load immediately, then also try to auto-generate any missing summaries
      // and reload so they appear without the user having to navigate away and back
      loadSummaries().then(() => {
        const jumpToDate: string | undefined = route?.params?.jumpToDate;
        if (jumpToDate) {
          const idx = summariesRef.current.findIndex(s => s.date === jumpToDate);
          if (idx !== -1) scrollToIndex(idx, false);
        }
      });
      // Load tracker preferences for insight section filtering
      StorageService.getSettings().then(s => {
        if (s?.enabledTrackers) {
          setEnabledTrackers(new Set(s.enabledTrackers));
        } else {
          setEnabledTrackers(null); // null = show all
        }
      }).catch(() => {});
      // Load goals and meal macros from monthly insights
      StorageService.getGoals().then(g => setGoals(g)).catch(() => {});
      loadMealMacros().catch(() => {});
      // Re-read the flag on every focus so dev toggles take effect without a reload
      FeatureFlagsService.getFlag('ff_new_day_summary')
        .then(setNewDaySummaryOn)
        .catch(() => setNewDaySummaryOn(false));
      // Catch-up generation: generate yesterday's summary if missing OR stale, then
      // reload. regenerate=true means it also picks up entries recorded after an
      // earlier auto-summary (e.g. notes added after the 5-min auto-generate).
      // Preserve the date the user is currently viewing so the index doesn't jump
      // when the new summary is prepended at position 0.
      generateIfNeeded(yesterday, true).then(generated => {
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

    // Compute stale counts: only check the last 7 days since entries can only be
    // added to dates within the last 30 days, and old summaries can't realistically
    // become stale. Use transcript count comparison to avoid reading full entry arrays.
    const counts: Record<string, number> = {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const recentSummaries = valid.filter(s => s.date >= cutoffStr);
    await Promise.all(recentSummaries.map(async (s) => {
      const transcripts = await StorageService.getTranscriptsForDate(s.date);
      const newer = transcripts.length - (s.transcriptCount ?? 0);
      if (newer > 0) counts[s.date] = newer;
    }));
    setStaleCounts(counts);
  };

  // Build a date→DayMacros lookup from stored monthly insights
  const loadMealMacros = async () => {
    const dates = await StorageService.getSummaryDates();
    const monthKeys = [...new Set(dates.map(d => d.slice(0, 7)))];
    const lookup: Record<string, DayMacros> = {};
    await Promise.all(monthKeys.map(async mk => {
      const insight = await StorageService.getMonthlyInsight(mk);
      insight?.weeklyData?.mealMacrosByDay?.forEach(m => {
        lookup[m.date] = m;
      });
    }));
    setMealMacrosByDate(lookup);
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
  // Recompute on every render so it stays correct after midnight without needing
  // a timer. useMemo with no deps gives a stable value per mount but refreshes
  // on the next focus (useFocusEffect re-renders the component).
  const today = React.useMemo(() => localDateStr(), []);

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
      // Refresh meal macros in case monthly insight was updated alongside
      loadMealMacros().catch(() => {});
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      generatingRef.current = null;
      setGeneratingDate(null);
    }
  }, []);

  // Soft gate: 3 summaries/week free, paywall on 4th+. On success, retry the pending date.
  const gatedHandleGenerate = async (date: string) => {
    const allowed = await SubscriptionService.canGenerateSummary();
    if (!allowed) {
      pendingGenerateDateRef.current = date;
      setPaywallHint(`You've used your ${SubscriptionService.FREE_SUMMARIES_PER_WEEK} free summaries this week. Upgrade to generate unlimited summaries.`);
      setShowPaywall(true);
      return;
    }
    await SubscriptionService.recordSummaryGenerated();
    handleGenerate(date);
  };

  // Single entry point — opens the mind picker (ChatScreen), which routes to chat or call
  const handlePerspectivePress = async (item: DailySummary) => {
    const allowed = await SubscriptionService.canUseConversation();
    if (!allowed) {
      pendingPerspectiveRef.current = item;
      setPaywallHint('Unlimited AI conversations are a Pro feature.');
      setShowPaywall(true);
      return;
    }
    await SubscriptionService.recordConversationUsed();
    setCallMindId(undefined); // start as chat picker, not a direct call
    setPerspectiveSummary(item);
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
      const plainSummary = toPlainText(item.summary || item.insightText || '');
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

  const handleToggleBreakdown = useCallback(async (date: string) => {
    const isExpanded = expandedBreakdowns.has(date);
    if (isExpanded) {
      setExpandedBreakdowns(prev => { const n = new Set(prev); n.delete(date); return n; });
      return;
    }
    setExpandedBreakdowns(prev => { const n = new Set(prev); n.add(date); return n; });
    const current = summariesRef.current.find(s => s.date === date);
    if (current && !current.summary && !breakdownGenerating.has(date)) {
      setBreakdownGenerating(prev => { const n = new Set(prev); n.add(date); return n; });
      try {
        const text = await generateFullBreakdown(date);
        setSummaries(prev => prev.map(s => s.date === date ? { ...s, summary: text } : s));
      } catch { /* silently skip — user can tap again */ }
      finally {
        setBreakdownGenerating(prev => { const n = new Set(prev); n.delete(date); return n; });
      }
    }
  }, [expandedBreakdowns, breakdownGenerating]);

  // ── card content ─────────────────────────────────────────────────────────
  const renderCardContent = (item: DailySummary) => {
    if (newDaySummaryOn) {
      return (
        <NewDaySummaryView
          item={item}
          enabledTrackers={enabledTrackers}
          mealMacrosByDate={mealMacrosByDate}
          goals={goals}
          staleCount={staleCounts[item.date] ?? 0}
          generatingDate={generatingDate}
          expanded={expandedBreakdowns.has(item.date)}
          breakdownGenerating={breakdownGenerating.has(item.date)}
          onGenerate={gatedHandleGenerate}
          onDownload={handleDownload}
          onPerspective={handlePerspectivePress}
          onToggleBreakdown={handleToggleBreakdown}
        />
      );
    }
    return (
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
                onPress={() => gatedHandleGenerate(item.date)}
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
              onPress={() => gatedHandleGenerate(item.date)}
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
        newCount={staleCounts[item.date] ?? 0}
        onRegenerate={() => gatedHandleGenerate(item.date)}
        generating={generatingDate === item.date}
      />

      <ScrollView
        style={styles.cardScrollView}
        contentContainerStyle={styles.cardScroll}
        showsVerticalScrollIndicator={false}
        directionalLockEnabled={true}
      >
        {/* Reflection — elevated to top since it's the most personal content */}
        {item.reflectionText ? (
          <View style={styles.reflectionBlock}>
            <Text style={styles.reflectionText}>"{item.reflectionText}"</Text>
          </View>
        ) : null}

        {/* Insight sections */}
        {item.insightText ? (
          <View style={[styles.insightSection, item.reflectionText ? { marginTop: 10 } : null]}>
            {renderInsightSections(
              item.insightText,
              enabledTrackers,
              item.dailyMacros ?? mealMacrosByDate[item.date],
              goals,
              !!item.dailyMacros,
            )}
          </View>
        ) : (
          // Legacy summary — generated before section views existed
          <View style={styles.legacyNudge}>
            <Feather name="refresh-cw" size={12} color="rgba(152,212,250,0.45)" />
            <Text style={styles.legacyNudgeText}>
              Regenerate to see section breakdown
            </Text>
          </View>
        )}

        {/* Full breakdown — generated on first expand, then cached in storage */}
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.breakdownToggleRow}
          onPress={async () => {
            const isExpanded = expandedBreakdowns.has(item.date);
            if (isExpanded) {
              setExpandedBreakdowns(prev => { const n = new Set(prev); n.delete(item.date); return n; });
              return;
            }
            // Expand — generate if not yet available
            setExpandedBreakdowns(prev => { const n = new Set(prev); n.add(item.date); return n; });
            if (!item.summary && !breakdownGenerating.has(item.date)) {
              setBreakdownGenerating(prev => { const n = new Set(prev); n.add(item.date); return n; });
              try {
                const text = await generateFullBreakdown(item.date);
                setSummaries(prev => prev.map(s => s.date === item.date ? { ...s, summary: text } : s));
              } catch { /* silently skip — user can tap again */ }
              finally {
                setBreakdownGenerating(prev => { const n = new Set(prev); n.delete(item.date); return n; });
              }
            }
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.breakdownLabel}>FULL BREAKDOWN</Text>
          {breakdownGenerating.has(item.date)
            ? <ActivityIndicator size="small" color="rgba(152,212,250,0.50)" />
            : <Feather
                name={expandedBreakdowns.has(item.date) ? 'chevron-up' : 'chevron-down'}
                size={13}
                color="rgba(152,212,250,0.50)"
              />
          }
        </TouchableOpacity>
        {expandedBreakdowns.has(item.date) && (
          item.summary
            ? <Markdown style={markdownStyles}>{item.summary}</Markdown>
            : breakdownGenerating.has(item.date)
              ? <ActivityIndicator size="small" color="rgba(152,212,250,0.30)" style={{ marginVertical: 12 }} />
              : null
        )}
      </ScrollView>

      <View style={styles.ctaRow}>
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => handlePerspectivePress(item)}
          activeOpacity={0.85}
        >
          <Feather name="compass" size={15} color="rgba(224, 242, 254, 0.95)" />
          <Text style={styles.ctaBtnText}>Get a new perspective</Text>
        </TouchableOpacity>
      </View>
    </>
  );
  };

  // ── FlatList item ─────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }: { item: DailySummary }) => (
    <View style={[styles.page, { height: containerHeight || undefined }]}>
      <View style={styles.card}>
        {renderCardContent(item)}
      </View>
    </View>
  ), [containerHeight, generatingDate, handleGenerate, staleCounts, mealMacrosByDate, goals, enabledTrackers, expandedBreakdowns, breakdownGenerating, newDaySummaryOn, handleToggleBreakdown]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index,
  }), []);

  const handleMomentumScrollEnd = useCallback((e: any) => {
    const newIdx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    currentIndexRef.current = newIdx;
    setCurrentIndex(newIdx);
  }, []);

  const handleScrollToIndexFailed = useCallback((info: { index: number }) => {
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
    }, 100);
  }, []);

  const todaySummary = summaries.find(s => s.date === today);
  const isGeneratingToday = generatingDate === today;
  const currentSummary = summaries[currentIndex];
  const isViewingToday = currentSummary?.date === today;
  const currentIsStale = currentSummary ? (staleCounts[currentSummary.date] ?? 0) > 0 : false;
  // Hide top-bar Regenerate when viewing today's stale card — stale banner is the CTA
  const showTopBarGenerate = !(isViewingToday && currentIsStale);
  const todayIdx = summaries.findIndex(s => s.date === today);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Summaries</Text>
        <View style={styles.topBarRight}>
          {summaries.length > 0 && !isViewingToday && (
            <TouchableOpacity
              onPress={() => todayIdx !== -1 && scrollToIndex(todayIdx)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.counter}>Today</Text>
            </TouchableOpacity>
          )}
          {showTopBarGenerate && (
            <TouchableOpacity
              onPress={() => gatedHandleGenerate(today)}
              disabled={isGeneratingToday}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isGeneratingToday
                ? <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.70)" />
                : <View style={styles.generateWrapper}>
                    <Text style={styles.generateLink}>
                      {todaySummary ? 'Regenerate' : '+ Generate'}
                    </Text>
                    {!todaySummary && (
                      <Text style={styles.autoHint}>auto-generates tonight</Text>
                    )}
                  </View>
              }
            </TouchableOpacity>
          )}
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
            getItemLayout={getItemLayout}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            onScrollToIndexFailed={handleScrollToIndexFailed}
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
              <Feather name="chevron-left" size={14} color="rgba(152, 212, 250, 0.85)" />
              <Text style={styles.navBtnText}>{formatShortDate(summaries[currentIndex - 1].date)}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.navPlaceholder} />
          )}
          <Text style={styles.swipeHint}>swipe to navigate</Text>
          {currentIndex < summaries.length - 1 ? (
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => scrollToIndex(currentIndex + 1)}
            >
              <Text style={styles.navBtnText}>{formatShortDate(summaries[currentIndex + 1].date)}</Text>
              <Feather name="chevron-right" size={14} color="rgba(152, 212, 250, 0.85)" />
            </TouchableOpacity>
          ) : (
            <View style={styles.navPlaceholder} />
          )}
        </View>
      )}

      {/* Perspective modal — ChatScreen (picker) or TalkScreen (direct call) */}
      <Modal
        visible={!!perspectiveSummary}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => { setPerspectiveSummary(null); setCallMindId(undefined); loadSummaries(); }}
      >
        {perspectiveSummary && callMindId === undefined && (
          <ChatScreen
            summary={perspectiveSummary}
            onClose={() => { setPerspectiveSummary(null); loadSummaries(); }}
            onCallRequested={(mindId) => setCallMindId(mindId ?? null)}
          />
        )}
        {perspectiveSummary && callMindId !== undefined && (
          <TalkScreen
            summary={perspectiveSummary}
            initialMindId={callMindId}
            onClose={() => { setPerspectiveSummary(null); setCallMindId(undefined); loadSummaries(); }}
          />
        )}
      </Modal>

      <PaywallModal
        visible={showPaywall}
        featureHint={paywallHint}
        onClose={() => {
          setShowPaywall(false);
          pendingGenerateDateRef.current = null;
          pendingPerspectiveRef.current = null;
        }}
        onSuccess={() => {
          setShowPaywall(false);
          if (pendingGenerateDateRef.current) {
            const d = pendingGenerateDateRef.current;
            pendingGenerateDateRef.current = null;
            handleGenerate(d);
          } else if (pendingPerspectiveRef.current) {
            const s = pendingPerspectiveRef.current;
            pendingPerspectiveRef.current = null;
            setCallMindId(undefined);
            setPerspectiveSummary(s);
          }
        }}
      />
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
    borderColor: 'rgba(152, 212, 250, 0.15)',
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 4,
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
  breakdownToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, marginHorizontal: -18, paddingHorizontal: 18,
  },
  breakdownLabel: {
    fontSize: 10, fontWeight: '500',
    color: 'rgba(152, 212, 250, 0.60)', letterSpacing: 0.8,
    fontFamily: 'GillSans-Light',
  },
  reflectionBlock: {
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(152,212,250,0.25)',
    paddingLeft: 14,
    marginBottom: 4,
  },
  reflectionText: {
    fontSize: 14, lineHeight: 22,
    color: 'rgba(224, 242, 254, 0.80)',
    fontFamily: 'GillSans-Light',
  },
  legacyNudge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 4,
  },
  legacyNudgeText: {
    fontSize: 13, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.50)', fontStyle: 'italic',
  },
  generateWrapper: { alignItems: 'flex-end', gap: 2 },
  autoHint: {
    fontSize: 10, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.40)', letterSpacing: 0.2,
  },

  // ── Bottom nav ─────────────────────────────────────────────────────────────
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 10,
  },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: 'rgba(9, 41, 173, 0.10)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.22)',
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
    justifyContent: 'center', gap: 8, paddingVertical: 15,
    backgroundColor: 'rgba(9, 41, 173, 0.55)',
  },
  ctaBtnText: {
    fontSize: 15, color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'GillSans-Light', letterSpacing: 0.2,
  },
});
