import React, { useState, useEffect, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { WeeklyInsight, WeeklyData, SpendCategory, EmotionCount } from '../types';
import { generateWeeklyInsight, NOT_ENOUGH_DATA } from '../services/WeeklyInsightService';
import { SECTION_LABELS } from './InsightSections';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function parseSections(text: string): Array<{ key: string; body: string }> {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sectionKeys = Object.keys(SECTION_LABELS);
  const sections: Array<{ key: string; body: string }> = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const headingKey = sectionKeys.find(k =>
      line.toLowerCase().startsWith(k.toLowerCase()),
    );
    if (headingKey) {
      const inlineBody = line.replace(new RegExp(`^${headingKey}:?\\s*`, 'i'), '').trim();
      const bodyLines: string[] = [];
      i++;
      while (
        i < lines.length &&
        !sectionKeys.some(k => lines[i].toLowerCase().startsWith(k.toLowerCase()))
      ) {
        bodyLines.push(lines[i]);
        i++;
      }
      const body = inlineBody ? [inlineBody, ...bodyLines].join(' ') : bodyLines.join(' ');
      sections.push({ key: headingKey, body });
    } else {
      i++;
    }
  }
  return sections;
}

function firstSentence(body: string): string {
  return body.match(/[^.!?]+[.!?]+/)?.[0]?.trim() ?? body;
}

// ── Infographic components ────────────────────────────────────────────────────

/** Emotion bar chart — horizontal bars proportional to entry count */
const EMOTION_SENTIMENT_COLOR = {
  positive: { bar: 'rgba(110,231,183,0.55)', text: 'rgba(110,231,183,0.90)', track: 'rgba(110,231,183,0.10)' },
  neutral:  { bar: 'rgba(147,197,253,0.45)', text: 'rgba(147,197,253,0.80)', track: 'rgba(147,197,253,0.08)' },
  negative: { bar: 'rgba(252,165,165,0.50)', text: 'rgba(252,165,165,0.90)', track: 'rgba(252,165,165,0.10)' },
};

function EmotionBars({ emotions }: { emotions: EmotionCount[] }) {
  const maxCount = Math.max(...emotions.map(e => e.count), 1);
  return (
    <View style={{ gap: 6, marginTop: 8 }}>
      {emotions.map(e => {
        const cfg = EMOTION_SENTIMENT_COLOR[e.sentiment] ?? EMOTION_SENTIMENT_COLOR.neutral;
        const pct = e.count / maxCount;
        return (
          <View key={e.name} style={infoStyles.emotionRow}>
            <Text style={[infoStyles.emotionName, { color: cfg.text }]}>{e.name}</Text>
            <View style={[infoStyles.emotionTrack, { backgroundColor: cfg.track }]}>
              <View style={[infoStyles.emotionBar, { flex: pct, backgroundColor: cfg.bar }]} />
              <View style={{ flex: 1 - pct }} />
            </View>
            <Text style={[infoStyles.emotionCount, { color: cfg.text }]}>{e.count}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Monthly movement grid — rows of 7 dots, labelled W1 W2 … */
function MovementGrid({ days }: { days: boolean[] }) {
  const rows: boolean[][] = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
  return (
    <View style={{ gap: 5, marginTop: 7 }}>
      {rows.map((row, wi) => (
        <View key={wi} style={infoStyles.gridRow}>
          <Text style={infoStyles.weekLabel}>W{wi + 1}</Text>
          {row.map((active, di) => (
            <View key={di} style={[infoStyles.gridDot, active ? infoStyles.gridDotOn : infoStyles.gridDotOff]} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Monthly meditation grid — same layout as movement, purple accent */
function MeditationGrid({ days }: { days: boolean[] }) {
  const rows: boolean[][] = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
  return (
    <View style={{ gap: 5, marginTop: 7 }}>
      {rows.map((row, wi) => (
        <View key={wi} style={infoStyles.gridRow}>
          <Text style={infoStyles.weekLabel}>W{wi + 1}</Text>
          {row.map((active, di) => (
            <View key={di} style={[infoStyles.gridDot, active ? infoStyles.meditationDotOn : infoStyles.gridDotOff]} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Weekly meal quality strip — W1 W2 W3 W4 coloured circles */
const MEAL_WEEK_CFG = {
  good:  { bg: 'rgba(110,231,183,0.18)', border: 'rgba(110,231,183,0.55)', text: 'rgba(110,231,183,0.95)' },
  mixed: { bg: 'rgba(251,191, 36,0.18)', border: 'rgba(251,191, 36,0.55)', text: 'rgba(251,191, 36,0.95)' },
  poor:  { bg: 'rgba(252,165,165,0.20)', border: 'rgba(252,165,165,0.55)', text: 'rgba(252,165,165,0.95)' },
};
function MealWeekStrip({ weeks }: { weeks: ('good' | 'mixed' | 'poor')[] }) {
  return (
    <View style={infoStyles.row}>
      {weeks.map((q, i) => {
        const cfg = MEAL_WEEK_CFG[q] ?? MEAL_WEEK_CFG.mixed;
        return (
          <View key={i} style={[infoStyles.mealWeekCircle, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Text style={[infoStyles.mealWeekLabel, { color: cfg.text }]}>W{i + 1}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Spend category breakdown */
const LEVEL_DOT_COUNT = { low: 1, medium: 2, high: 3 };
const LEVEL_COLOR = {
  low:    'rgba(110,231,183,0.90)',
  medium: 'rgba(251,191, 36,0.90)',
  high:   'rgba(252,165,165,0.95)',
};

function CategoryLevelDots({ level }: { level: 'low' | 'medium' | 'high' }) {
  const filled = LEVEL_DOT_COUNT[level] ?? 1;
  const color  = LEVEL_COLOR[level];
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={[
            infoStyles.levelDot,
            { backgroundColor: i < filled ? color : 'rgba(152,212,250,0.12)' },
          ]}
        />
      ))}
    </View>
  );
}

function SpendCategoryList({ categories }: { categories: SpendCategory[] }) {
  return (
    <View style={{ gap: 7, marginTop: 8 }}>
      {categories.map(cat => (
        <View key={cat.name} style={infoStyles.catRow}>
          <View style={infoStyles.catHeader}>
            <Text style={infoStyles.catName}>{cat.name}</Text>
            <CategoryLevelDots level={cat.level} />
          </View>
          <Text style={infoStyles.catSummary}>{cat.summary}</Text>
        </View>
      ))}
    </View>
  );
}

/** Word cloud for recurring topics — size + opacity scale with frequency */
function WordCloud({ topics }: { topics: { word: string; count: number }[] }) {
  const maxCount = Math.max(...topics.map(t => t.count), 1);
  // Shuffle slightly so it doesn't look like a ranked list
  const shuffled = [...topics].sort(() => Math.random() - 0.5);
  return (
    <View style={cloudStyles.container}>
      {shuffled.map(t => {
        const ratio    = t.count / maxCount;
        const fontSize = Math.round(11 + ratio * 12);      // 11 – 23 px
        const opacity  = 0.40 + ratio * 0.60;              // 0.40 – 1.0
        const bg       = `rgba(147,197,253,${(0.05 + ratio * 0.12).toFixed(2)})`;
        const border   = `rgba(147,197,253,${(0.15 + ratio * 0.30).toFixed(2)})`;
        return (
          <View key={t.word} style={[cloudStyles.chip, { backgroundColor: bg, borderColor: border }]}>
            <Text style={[cloudStyles.word, { fontSize, opacity }]}>{t.word}</Text>
          </View>
        );
      })}
    </View>
  );
}

const cloudStyles = StyleSheet.create({
  container: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 7, marginTop: 8,
  },
  chip: {
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  word: {
    fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.90)',
    lineHeight: 20,
  },
});

/** Learning count chip */
function LearningCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={infoStyles.learningChip}>
      <Feather name="star" size={10} color="rgba(196, 181, 253, 0.90)" />
      <Text style={infoStyles.learningText}>{count} logged</Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' },
  infoLabel: { fontSize: 11, color: 'rgba(152,212,250,0.55)', fontFamily: 'GillSans-Light', marginLeft: 4 },

  // Emotion bars
  emotionRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emotionName:  { fontSize: 11, fontFamily: 'GillSans-Light', width: 90, textTransform: 'capitalize' },
  emotionTrack: { flex: 1, height: 6, borderRadius: 3, flexDirection: 'row', overflow: 'hidden' },
  emotionBar:   { height: 6, borderRadius: 3 },
  emotionCount: { fontSize: 11, fontFamily: 'GillSans-Light', width: 18, textAlign: 'right' },

  // Movement grid
  gridRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  weekLabel: { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', width: 18 },
  gridDot:   { width: 14, height: 14, borderRadius: 7 },
  gridDotOn:        { backgroundColor: 'rgba(110,231,183,0.22)', borderWidth: 1, borderColor: 'rgba(110,231,183,0.55)' },
  gridDotOff:       { backgroundColor: 'rgba(152,212,250,0.05)', borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)' },
  meditationDotOn:  { backgroundColor: 'rgba(196,181,253,0.22)', borderWidth: 1, borderColor: 'rgba(196,181,253,0.60)' },

  // Meal weeks
  mealWeekCircle: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  mealWeekLabel: { fontSize: 10, fontFamily: 'GillSans-Light', fontWeight: '500' },

  // Spend categories
  catRow: {
    backgroundColor: 'rgba(152,212,250,0.04)',
    borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.09)',
    paddingHorizontal: 12, paddingVertical: 8,
    gap: 3,
  },
  catHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catName:    { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.85)', fontWeight: '500' },
  catSummary: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', lineHeight: 16 },
  levelDot:   { width: 7, height: 7, borderRadius: 4 },

  // Learning
  learningChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
    backgroundColor: 'rgba(196,181,253,0.08)',
    borderColor: 'rgba(196,181,253,0.25)',
    marginTop: 6, alignSelf: 'flex-start',
  },
  learningText: { fontSize: 11, color: 'rgba(196,181,253,0.85)', fontFamily: 'GillSans-Light' },
});

// ── Sub-components ────────────────────────────────────────────────────────────

function DayDots({ active, total = 31 }: { active: number; total?: number }) {
  const clamped = Math.min(total, 31);
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: clamped }, (_, i) => (
        <View key={i} style={[dotStyles.dot, i < active ? dotStyles.dotOn : dotStyles.dotOff]} />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, alignItems: 'center', flexWrap: 'wrap', maxWidth: 160 },
  dot:    { width: 6, height: 6, borderRadius: 3 },
  dotOn:  { backgroundColor: 'rgba(152,212,250,0.85)' },
  dotOff: { backgroundColor: 'rgba(152,212,250,0.18)' },
});

function SectionRow({
  sectionKey,
  body,
  weeklyData,
}: {
  sectionKey: string;
  body: string;
  weeklyData?: WeeklyData;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta    = SECTION_LABELS[sectionKey];
  const preview = firstSentence(body);
  const hasMore = body.trim().length > preview.length + 2;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(e => !e);
  };

  const renderInfographic = () => {
    if (!weeklyData) return null;
    switch (sectionKey) {
      case 'Emotional check-in':
        return weeklyData.emotionCounts?.length
          ? <EmotionBars emotions={weeklyData.emotionCounts} />
          : null;
      case 'Movement':
        return weeklyData.movementDays?.length
          ? <MovementGrid days={weeklyData.movementDays} />
          : null;
      case 'Meditation':
        return weeklyData.meditationDays?.length
          ? <MeditationGrid days={weeklyData.meditationDays} />
          : null;
      case 'Meals':
        return weeklyData.mealWeeks?.length
          ? <MealWeekStrip weeks={weeklyData.mealWeeks as any} />
          : null;
      case 'Spending':
        return weeklyData.spendCategories?.length
          ? <SpendCategoryList categories={weeklyData.spendCategories} />
          : null;
      case 'Recurring thoughts':
        return weeklyData.recurringTopics?.length
          ? <WordCloud topics={weeklyData.recurringTopics} />
          : null;
      case 'Learnings':
        return <LearningCount count={weeklyData.learningCount} />;
      default:
        return null;
    }
  };

  return (
    <TouchableOpacity
      style={styles.sectionRow}
      onPress={hasMore ? toggle : undefined}
      activeOpacity={hasMore ? 0.75 : 1}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionLeft}>
          <Feather name={meta.iconName as any} size={12} color="rgba(152,212,250,0.70)" />
          <Text style={styles.sectionLabel}>{sectionKey}</Text>
        </View>
        {hasMore && (
          <Feather
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={13}
            color="rgba(152,212,250,0.35)"
          />
        )}
      </View>

      {renderInfographic()}

      <Text style={[styles.sectionBody, { marginTop: 6 }]}>
        {expanded ? body : preview}
      </Text>
    </TouchableOpacity>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export default function WeeklyInsightCard() {
  const [insight,       setInsight]       = useState<WeeklyInsight | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [notEnoughData, setNotEnoughData] = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [refreshing,    setRefreshing]    = useState(false);

  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => { loadInsight(false); }, []);

  useEffect(() => {
    if (loading) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.9, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(0.4);
    }
  }, [loading]);

  const loadInsight = async (force: boolean) => {
    setError(null);
    setNotEnoughData(false);
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await generateWeeklyInsight(force);
      setInsight(result);
    } catch (e: any) {
      if (e?.message === NOT_ENOUGH_DATA) setNotEnoughData(true);
      else setError(e?.message ?? 'Could not load monthly insight.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Month label e.g. "March 2026"
  const monthLabel = insight
    ? new Date(insight.weekStart + 'T12:00:00').toLocaleDateString([], { month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString([], { month: 'long', year: 'numeric' });

  const sections = insight ? parseSections(insight.insightText) : [];

  return (
    <View style={styles.card}>
      {/* ── Heading ── */}
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.heading}>Monthly insights</Text>
          <Text style={styles.headingSub}>{monthLabel}</Text>
        </View>
        <TouchableOpacity
          onPress={() => loadInsight(true)}
          disabled={refreshing || loading}
          style={styles.refreshBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {refreshing
            ? <ActivityIndicator size="small" color="rgba(152,212,250,0.85)" />
            : <Feather name="refresh-cw" size={13} color="rgba(152,212,250,0.65)" />}
        </TouchableOpacity>
      </View>

      {/* ── Loading skeleton ── */}
      {loading && (
        <View style={{ gap: 8 }}>
          {(['92%', '78%', '65%'] as const).map((w, i) => (
            <Animated.View key={i} style={[styles.skeletonLine, { width: w, opacity: pulseAnim }]} />
          ))}
        </View>
      )}

      {/* ── Not enough data ── */}
      {!loading && notEnoughData && (
        <Text style={styles.emptyText}>
          Keep journaling — monthly insights appear once you have at least one daily summary this month.
        </Text>
      )}

      {/* ── Error ── */}
      {!loading && error && <Text style={styles.errorText}>{error}</Text>}

      {/* ── Loaded ── */}
      {!loading && insight && (
        <>
          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statNum}>{insight.daysActive}</Text>
              <Text style={styles.statLabel}>days active</Text>
            </View>
            <DayDots active={insight.daysActive} total={insight.daysSummarised} />
            <View style={styles.statBlock}>
              <Text style={styles.statNum}>{insight.totalEntries}</Text>
              <Text style={styles.statLabel}>entries</Text>
            </View>
          </View>

          {/* Section accordion */}
          <View style={styles.sections}>
            {sections.map(s => (
              <SectionRow
                key={s.key}
                sectionKey={s.key}
                body={s.body}
                weeklyData={insight.weeklyData}
              />
            ))}
          </View>

          <Text style={styles.lastUpdated}>Updated {formatRelativeTime(insight.generatedAt)}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 16, marginBottom: 16, backgroundColor: 'transparent' },

  headingRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 14,
  },
  heading: {
    fontSize: 15, fontWeight: '500',
    color: 'rgba(224,242,254,0.95)', fontFamily: 'Baskerville',
  },
  headingSub: {
    fontSize: 11, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.50)', marginTop: 2,
  },
  refreshBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(6,26,55,0.55)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(152,212,250,0.05)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(152,212,250,0.10)',
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12,
  },
  statBlock: { alignItems: 'center' },
  statNum: {
    fontSize: 20, fontWeight: '500',
    color: 'rgba(224,242,254,0.90)', fontFamily: 'Baskerville',
  },
  statLabel: {
    fontSize: 10, color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light', marginTop: 1, letterSpacing: 0.3,
  },

  sections: { gap: 6 },
  sectionRow: {
    backgroundColor: 'rgba(152,212,250,0.04)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.09)',
    paddingHorizontal: 14, paddingVertical: 11,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLeft:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionLabel: {
    fontSize: 11, fontWeight: '500',
    color: 'rgba(152,212,250,0.70)', fontFamily: 'GillSans-Light',
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  sectionBody: {
    fontSize: 13, color: 'rgba(224,242,254,0.75)',
    lineHeight: 20, fontFamily: 'GillSans-Light',
  },

  lastUpdated: {
    fontSize: 11, color: 'rgba(152,212,250,0.45)',
    marginTop: 10, textAlign: 'right', fontFamily: 'GillSans-Light',
  },
  skeletonLine: { height: 13, backgroundColor: 'rgba(9,41,173,0.08)', borderRadius: 7 },
  emptyText: {
    fontSize: 14, color: 'rgba(152,212,250,0.60)', lineHeight: 22,
    textAlign: 'center', paddingVertical: 8, fontStyle: 'italic', fontFamily: 'GillSans-Light',
  },
  errorText: { fontSize: 14, color: '#e63946', lineHeight: 22, fontFamily: 'GillSans-Light' },
});
