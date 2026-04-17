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
  ScrollView,
  Dimensions,
} from 'react-native';
import { MonthlyInsight, MonthlyData, SpendCategory, EmotionCount, UserGoals, DayMacros, ExpenseEntry } from '../types';
import { generateMonthlyInsight, NOT_ENOUGH_DATA } from '../services/MonthlyInsightService';
import { StorageService } from '../services/StorageService';
import { SubscriptionService } from '../services/SubscriptionService';
import PaywallModal from './PaywallModal';
import { groupByCategory, formatINR } from '../services/ExpenseService';
// SMS spend tracking disabled — READ_SMS permission not grantable on non-rooted devices
// import { getSMSSpendCategories } from '../services/SMSSpendService';
import { SECTION_LABELS } from './InsightSections';
import GoalsModal from './GoalsModal';

const CARD_WIDTH = Dimensions.get('window').width - 64;

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
  const s = body.match(/[^.!?]+[.!?]+/)?.[0]?.trim() ?? body;
  return s.length > 110 ? s.slice(0, 110).trimEnd() + '…' : s;
}

// ── Infographic components ────────────────────────────────────────────────────

/** Emotion bar chart — horizontal bars proportional to entry count */
const EMOTION_SENTIMENT_COLOR = {
  positive: { bar: 'rgba(236,72,153,0.65)',  text: 'rgba(249,168,212,0.95)', track: 'rgba(236,72,153,0.10)' },
  neutral:  { bar: 'rgba(236,72,153,0.42)',  text: 'rgba(249,168,212,0.75)', track: 'rgba(236,72,153,0.07)' },
  negative: { bar: 'rgba(190,24,93,0.65)',   text: 'rgba(249,168,212,0.85)', track: 'rgba(190,24,93,0.10)'  },
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
function getMonthMeta() {
  const now = new Date();
  return {
    todayIndex:   now.getDate() - 1,  // 0-based day index
    daysInMonth:  new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
  };
}

function MovementGrid({ days }: { days: boolean[] }) {
  const { todayIndex, daysInMonth } = getMonthMeta();
  const full = Array.from({ length: daysInMonth }, (_, i) => days[i] ?? false);
  const rows: boolean[][] = [];
  for (let i = 0; i < full.length; i += 7) rows.push(full.slice(i, i + 7));
  return (
    <View style={{ gap: 5, marginTop: 7 }}>
      {rows.map((row, wi) => (
        <View key={wi} style={infoStyles.gridRow}>
          <Text style={infoStyles.weekLabel}>W{wi + 1}</Text>
          {row.map((active, di) => {
            const idx = wi * 7 + di;
            const isToday  = idx === todayIndex;
            const isFuture = idx > todayIndex;
            const dotStyle = isToday ? infoStyles.gridDotToday
              : isFuture ? infoStyles.gridDotFuture
              : active    ? infoStyles.gridDotOn
              : infoStyles.gridDotOff;
            return (
              <View key={di} style={[infoStyles.gridDot, dotStyle]}>
                {isToday && <Text style={infoStyles.todayStar}>★</Text>}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Monthly meditation grid — same layout as movement, purple accent */
function MeditationGrid({ days }: { days: boolean[] }) {
  const { todayIndex, daysInMonth } = getMonthMeta();
  const full = Array.from({ length: daysInMonth }, (_, i) => days[i] ?? false);
  const rows: boolean[][] = [];
  for (let i = 0; i < full.length; i += 7) rows.push(full.slice(i, i + 7));
  return (
    <View style={{ gap: 5, marginTop: 7 }}>
      {rows.map((row, wi) => (
        <View key={wi} style={infoStyles.gridRow}>
          <Text style={infoStyles.weekLabel}>W{wi + 1}</Text>
          {row.map((active, di) => {
            const idx = wi * 7 + di;
            const isToday  = idx === todayIndex;
            const isFuture = idx > todayIndex;
            const dotStyle = isToday ? infoStyles.gridDotToday
              : isFuture ? infoStyles.gridDotFuture
              : active   ? infoStyles.meditationDotOn
              : infoStyles.gridDotOff;
            return (
              <View key={di} style={[infoStyles.gridDot, dotStyle]}>
                {isToday && <Text style={infoStyles.todayStar}>★</Text>}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Per-day meal quality grid — same layout as meditation, 3-state colour */
const MEAL_DAY_STYLE: Record<'good' | 'mixed' | 'poor', object> = {
  good:  { backgroundColor: 'rgba(110,231,183,0.20)', borderWidth: 1, borderColor: 'rgba(110,231,183,0.65)' },
  mixed: { backgroundColor: 'rgba(251,191,36,0.18)',  borderWidth: 1, borderColor: 'rgba(251,191,36,0.60)'  },
  poor:  { backgroundColor: 'rgba(252,165,165,0.20)', borderWidth: 1, borderColor: 'rgba(252,165,165,0.60)' },
};

function MealDayGrid({
  days,
  mealMacrosByDay,
  selectedDayIdx,
  onDayPress,
}: {
  days: ('good' | 'mixed' | 'poor' | null)[];
  mealMacrosByDay?: DayMacros[];
  selectedDayIdx?: number | null;
  onDayPress?: (dayIdx: number) => void;
}) {
  const { todayIndex, daysInMonth } = getMonthMeta();
  const full: ('good' | 'mixed' | 'poor' | null)[] =
    Array.from({ length: daysInMonth }, (_, i) => days[i] ?? null);
  const rows: ('good' | 'mixed' | 'poor' | null)[][] = [];
  for (let i = 0; i < full.length; i += 7) rows.push(full.slice(i, i + 7));

  // Build a quick lookup: dayIdx → DayMacros
  const macroByIdx: Record<number, DayMacros> = {};
  (mealMacrosByDay ?? []).forEach(m => {
    const d = new Date(m.date + 'T12:00:00');
    macroByIdx[d.getDate() - 1] = m;
  });

  return (
    <View style={{ gap: 5, marginTop: 7 }}>
      {rows.map((row, wi) => (
        <View key={wi} style={infoStyles.gridRow}>
          <Text style={infoStyles.weekLabel}>W{wi + 1}</Text>
          {row.map((quality, di) => {
            const idx = wi * 7 + di;
            const isToday   = idx === todayIndex;
            const isFuture  = idx > todayIndex;
            const isSelected = idx === selectedDayIdx;
            const hasMacros = !!macroByIdx[idx];
            const tappable  = !isFuture && (quality !== null || hasMacros);
            const dotStyle  = isToday ? infoStyles.gridDotToday
              : isFuture ? infoStyles.gridDotFuture
              : quality  ? MEAL_DAY_STYLE[quality]
              : infoStyles.gridDotOff;
            return (
              <TouchableOpacity
                key={di}
                activeOpacity={tappable ? 0.65 : 1}
                onPress={tappable && onDayPress ? () => onDayPress(idx) : undefined}
                style={[
                  infoStyles.gridDot,
                  dotStyle,
                  isSelected && mealGridStyles.selectedRing,
                ]}
              >
                {isToday && <Text style={infoStyles.todayStar}>★</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      {/* Legend */}
      <View style={mealGridStyles.legend}>
        {(['good', 'mixed', 'poor'] as const).map(q => (
          <View key={q} style={mealGridStyles.legendItem}>
            <View style={[mealGridStyles.legendDot, MEAL_DAY_STYLE[q] as any]} />
            <Text style={mealGridStyles.legendLabel}>{q}</Text>
          </View>
        ))}
        <View style={mealGridStyles.legendItem}>
          <View style={[mealGridStyles.legendDot, infoStyles.gridDotOff]} />
          <Text style={mealGridStyles.legendLabel}>no data</Text>
        </View>
      </View>
    </View>
  );
}

const mealSectionLabel = StyleSheet.create({
  label: { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', letterSpacing: 0.6, textTransform: 'uppercase' },
});

const expStyles = StyleSheet.create({
  sourceTag:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sourceText:  { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(147,197,253,0.55)', letterSpacing: 0.3 },
  txCount:     { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)' },
  totalRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel:  { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5 },
  totalAmount: { fontSize: 16, fontFamily: 'Baskerville', color: 'rgba(224,242,254,0.90)' },
});

const mealGridStyles = StyleSheet.create({
  legend:       { flexDirection: 'row', gap: 12, marginTop: 5 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:    { width: 8, height: 8, borderRadius: 4 },
  legendLabel:  { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', textTransform: 'lowercase' },
  selectedRing: { borderWidth: 2, borderColor: 'rgba(224,242,254,0.90)' },
  dayDetail:    { marginTop: 10, padding: 12, backgroundColor: 'rgba(152,212,250,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)', gap: 6 },
  dayDetailTitle: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.70)', fontWeight: '600', letterSpacing: 0.3 },
  dayDetailSummary: { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.70)', lineHeight: 17, fontStyle: 'italic' },
});


/** Monthly meal quality strip — W1 W2 W3 W4 coloured circles (legacy fallback) */
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
  const fromSMS = categories.some(c => c.source === 'sms');
  const maxAmount = fromSMS
    ? Math.max(...categories.map(c => c.amount ?? 0), 1)
    : 1;

  return (
    <View style={{ gap: 7, marginTop: 8 }}>
      {fromSMS && (
        <View style={infoStyles.smsTag}>
          <Feather name="message-square" size={9} color="rgba(110,231,183,0.80)" />
          <Text style={infoStyles.smsTagText}>auto-tracked from bank SMS</Text>
        </View>
      )}
      {categories.map(cat => {
        const hasAmount = cat.source === 'sms' && cat.amount != null;
        const barWidth  = hasAmount ? (cat.amount! / maxAmount) : 0;
        return (
          <View key={cat.name} style={infoStyles.catRow}>
            <View style={infoStyles.catHeader}>
              <Text style={infoStyles.catName}>{cat.name}</Text>
              {hasAmount ? (
                <Text style={[infoStyles.catAmount, { color: LEVEL_COLOR[cat.level] }]}>
                  {cat.amount! >= 100_000
                    ? `₹${(cat.amount! / 100_000).toFixed(1)}L`
                    : cat.amount! >= 1_000
                      ? `₹${(cat.amount! / 1_000).toFixed(1)}k`
                      : `₹${Math.round(cat.amount!)}`}
                </Text>
              ) : (
                <CategoryLevelDots level={cat.level} />
              )}
            </View>
            {/* Spend bar for SMS data */}
            {hasAmount && (
              <View style={infoStyles.spendTrack}>
                <View style={[infoStyles.spendBar, {
                  flex: barWidth,
                  backgroundColor: LEVEL_COLOR[cat.level].replace('0.90)', '0.45)').replace('0.95)', '0.45)'),
                }]} />
                <View style={{ flex: 1 - barWidth }} />
              </View>
            )}
            <Text style={infoStyles.catSummary}>{cat.summary}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Deterministic pseudo-random from a string seed — stable across renders */
function seededRand(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0) / 4294967296;
}

/** Recurring thoughts — ranked list with glow accent bar scaling to frequency */
function WordCloud({ topics }: { topics: { word: string; count: number }[] }) {
  const maxCount = React.useMemo(
    () => Math.max(...topics.map(t => t.count), 1),
    [topics],
  );

  const sorted = React.useMemo(
    () => [...topics].sort((a, b) => b.count - a.count).slice(0, 8),
    [topics],
  );

  return (
    <View style={cloudStyles.container}>
      {sorted.map((t, i) => {
        const ratio      = t.count / maxCount;
        const textOpacity = 0.38 + ratio * 0.62;           // 0.38 → 1.0
        const barOpacity  = 0.18 + ratio * 0.72;           // 0.18 → 0.90
        const barWidth    = Math.round(3 + ratio * 2);     // 3–5 px thick
        const rankOpacity = 0.22 + ratio * 0.38;           // rank number fades with rank

        return (
          <View key={t.word} style={cloudStyles.row}>
            {/* Left accent bar */}
            <View style={[cloudStyles.bar, {
              width: barWidth,
              opacity: barOpacity,
            }]} />

            {/* Rank number */}
            <Text style={[cloudStyles.rank, { opacity: rankOpacity }]}>
              {String(i + 1).padStart(2, '0')}
            </Text>

            {/* Topic word */}
            <Text style={[cloudStyles.word, { opacity: textOpacity }]} numberOfLines={1}>
              {t.word}
            </Text>

            {/* Occurrence count pill */}
            {t.count > 1 && (
              <View style={[cloudStyles.countPill, { opacity: barOpacity }]}>
                <Text style={cloudStyles.countText}>×{t.count}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const mealGoalStyles = StyleSheet.create({
  panel:       { marginTop: 8, backgroundColor: 'rgba(251,191,36,0.04)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(251,191,36,0.12)', padding: 10, gap: 6 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nutriLabel:  { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)' },
  nutriTarget: { fontSize: 13, fontFamily: 'Baskerville', color: 'rgba(251,191,36,0.90)' },
  hint:        { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.38)', lineHeight: 14, marginTop: 2 },
});

const cloudStyles = StyleSheet.create({
  container: {
    marginTop: 8,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  bar: {
    height: 16,
    borderRadius: 2,
    backgroundColor: 'rgba(152,212,250,1)',
  },
  rank: {
    fontSize: 10,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.90)',
    letterSpacing: 0.5,
    width: 20,
  },
  word: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,1)',
    letterSpacing: 0.1,
  },
  countPill: {
    backgroundColor: 'rgba(152,212,250,0.08)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.18)',
  },
  countText: {
    fontSize: 10,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.80)',
    letterSpacing: 0.3,
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
  gridDot:   { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  gridDotOn:        { backgroundColor: 'rgba(110,231,183,0.22)', borderWidth: 1, borderColor: 'rgba(110,231,183,0.55)' },
  gridDotOff:       { backgroundColor: 'rgba(152,212,250,0.05)', borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)' },
  gridDotFuture:    { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(152,212,250,0.06)' },
  gridDotToday:     { backgroundColor: 'rgba(250,204,21,0.15)',  borderWidth: 1, borderColor: 'rgba(250,204,21,0.55)' },
  todayStar:        { fontSize: 7, color: 'rgba(250,204,21,0.95)', lineHeight: 9 },
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
  catHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catName:     { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.85)', fontWeight: '500' },
  catSummary:  { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', lineHeight: 16 },
  catAmount:   { fontSize: 13, fontFamily: 'Baskerville', fontWeight: '500' },
  levelDot:    { width: 7, height: 7, borderRadius: 4 },
  spendTrack:  { height: 4, borderRadius: 2, flexDirection: 'row', overflow: 'hidden',
                 backgroundColor: 'rgba(152,212,250,0.07)', marginTop: 2, marginBottom: 2 },
  spendBar:    { height: 4, borderRadius: 2 },
  smsTag:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  smsTagText:  { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(110,231,183,0.65)', letterSpacing: 0.3 },

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

// ── Meal daily macro view ─────────────────────────────────────────────────────

function MacroBar({
  label, value, target, unit, color,
}: {
  label: string; value: number; target?: number | null; unit: string; color: string;
}) {
  const pct      = value === 0 ? 0 : target ? Math.min(value / target, 1) : 1;
  const over     = target ? value > target * 1.1 : false;
  const barColor = over
    ? 'rgba(252,165,165,0.80)'
    : target && pct >= 0.85
      ? color
      : target && pct >= 0.5
        ? 'rgba(251,191,36,0.65)'
        : color;

  return (
    <View style={macroStyles.wrap}>
      <View style={macroStyles.topRow}>
        <Text style={macroStyles.label}>{label}</Text>
        <Text style={[macroStyles.value, over && { color: 'rgba(252,165,165,0.90)' }]}>
          {Math.round(value)}{unit}
          {target ? ` / ${target}${unit}` : ''}
        </Text>
      </View>
      <View style={macroStyles.track}>
        <View style={[macroStyles.fill, { flex: pct, backgroundColor: barColor }]} />
        <View style={{ flex: 1 - pct }} />
      </View>
      {over && (
        <Text style={macroStyles.overText}>
          ↑ {Math.round((value / target! - 1) * 100)}% over target
        </Text>
      )}
    </View>
  );
}

function DailyMacroView({
  macros, goals,
}: {
  macros: DayMacros | undefined; goals: UserGoals | undefined;
}) {

  return (
    <View style={macroStyles.card}>
      <View style={{ gap: 8, marginTop: 4 }}>
        <MacroBar
          label="Calories"
          value={macros?.calories ?? 0}
          target={goals?.dailyCalorieTarget}
          unit=" kcal"
          color="rgba(251,191,36,0.80)"
        />
        <MacroBar
          label="Protein"
          value={macros?.protein ?? 0}
          target={goals?.dailyProteinTarget}
          unit="g"
          color="rgba(147,197,253,0.85)"
        />
        <MacroBar
          label="Carbs"
          value={macros?.carbs ?? 0}
          target={goals?.dailyCarbsTarget}
          unit="g"
          color="rgba(110,231,183,0.70)"
        />
        <MacroBar
          label="Fat"
          value={macros?.fat ?? 0}
          target={goals?.dailyFatTarget}
          unit="g"
          color="rgba(196,181,253,0.70)"
        />
      </View>
    </View>
  );
}

const macroStyles = StyleSheet.create({
  card:      { marginTop: 8, gap: 6 },
  wrap:      { gap: 4 },
  topRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label:     { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', textTransform: 'uppercase', letterSpacing: 0.3 },
  value:     { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.85)' },
  track:     { height: 5, borderRadius: 3, flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(152,212,250,0.08)' },
  fill:      { height: 5, borderRadius: 3 },
  overText:  { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(252,165,165,0.70)' },
  empty:     { paddingVertical: 10, alignItems: 'center' },
  emptyText: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.38)', fontStyle: 'italic' },
});

function SectionRow({
  sectionKey,
  body,
  monthlyData,
  goals,
  trackedExpenses,
}: {
  sectionKey: string;
  body: string;
  monthlyData?: MonthlyData;
  goals?: UserGoals;
  trackedExpenses?: ExpenseEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedMealDayIdx, setSelectedMealDayIdx] = useState<number | null>(null);
  const meta = SECTION_LABELS[sectionKey];

  // For Meals: default body = last recorded meal day's actual summary; fall back to AI text
  const effectiveBody = (sectionKey === 'Meals' && monthlyData?.lastMealSummary)
    ? monthlyData.lastMealSummary
    : body;
  const datePrefix = (sectionKey === 'Meals' && monthlyData?.lastMealDate)
    ? new Date(monthlyData.lastMealDate + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' — '
    : '';

  const preview = firstSentence(effectiveBody);
  const hasMore = effectiveBody.trim().length > preview.length + 2;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(e => !e);
  };

  const renderInfographic = () => {
    switch (sectionKey) {

      case 'Emotional check-in':
        return monthlyData?.emotionCounts?.length
          ? <EmotionBars emotions={monthlyData.emotionCounts} />
          : null;

      case 'Movement': {
        const grid = monthlyData?.movementDays?.length
          ? <MovementGrid days={monthlyData.movementDays} />
          : null;
        const activeDays    = monthlyData?.movementDays?.filter(Boolean).length ?? 0;
        const weeksElapsed  = monthlyData?.movementDays?.length
          ? Math.max(1, Math.ceil(monthlyData.movementDays.length / 7))
          : 1;
        // Strength goal
        const strengthTarget = (goals?.strengthDaysPerWeek ?? goals?.workoutDaysPerWeek)
          ? ((goals?.strengthDaysPerWeek ?? goals?.workoutDaysPerWeek)! * weeksElapsed)
          : null;
        // Cardio goal
        const cardioTarget = goals?.cardioDaysPerWeek
          ? goals.cardioDaysPerWeek * weeksElapsed
          : null;
        // Combined total goal
        const totalTarget = (strengthTarget ?? 0) + (cardioTarget ?? 0);

        const bars = totalTarget > 0
          ? <>
              {strengthTarget && (
                <GoalProgressBar
                  label={`STRENGTH · ${goals?.strengthDaysPerWeek ?? goals?.workoutDaysPerWeek}×/week`}
                  current={Math.min(activeDays, strengthTarget)}
                  target={strengthTarget}
                  unit="sessions"
                  color="rgba(110,231,183,0.70)"
                />
              )}
              {cardioTarget && (
                <GoalProgressBar
                  label={`CARDIO · ${goals?.cardioDaysPerWeek}×/week`}
                  current={Math.max(0, activeDays - (strengthTarget ?? 0))}
                  target={cardioTarget}
                  unit="sessions"
                  color="rgba(147,197,253,0.70)"
                />
              )}
            </>
          : null;
        return grid || bars ? <>{grid}{bars}</> : null;
      }

      case 'Meditation':
        return monthlyData?.meditationDays?.length
          ? <MeditationGrid days={monthlyData.meditationDays} />
          : null;

      case 'Meals': {
        const macrosByDay = monthlyData?.mealMacrosByDay ?? [];
        const monthlyGrid = monthlyData?.mealDays?.length
          ? <MealDayGrid days={monthlyData.mealDays} mealMacrosByDay={macrosByDay} selectedDayIdx={null} onDayPress={() => {}} />
          : monthlyData?.mealWeeks?.length
            ? <MealWeekStrip weeks={monthlyData.mealWeeks as any} />
            : null;
        if (!monthlyGrid) return null;
        return <View style={{ marginTop: 6 }}>{monthlyGrid}</View>;
      }

      case 'Spending': {
        // Prefer real tracked expenses extracted from voice/manual notes.
        // Fall back to AI-estimated categories from the monthly insight.
        const hasTracked = (trackedExpenses?.length ?? 0) > 0;

        if (hasTracked) {
          const grouped   = groupByCategory(trackedExpenses!);
          const total     = trackedExpenses!.reduce((s, e) => s + e.amount, 0);
          const maxTotal  = grouped[0]?.total ?? 1;
          const budget    = goals?.monthlySpendBudget;

          return (
            <View style={{ gap: 10, marginTop: 6 }}>
              {/* Total spend row — always shown; becomes a progress bar if a budget goal is set */}
              {total > 0 && (
                budget
                  ? <GoalProgressBar
                      label="SPENT THIS MONTH"
                      current={total}
                      target={budget}
                      unit="₹"
                      color="rgba(74,222,128,0.70)"
                    />
                  : <View style={expStyles.totalRow}>
                      <Text style={expStyles.totalLabel}>TOTAL THIS MONTH</Text>
                      <Text style={expStyles.totalAmount}>{formatINR(total)}</Text>
                    </View>
              )}
              {/* Source label */}
              <View style={expStyles.sourceTag}>
                <Feather name="mic" size={9} color="rgba(147,197,253,0.70)" />
                <Text style={expStyles.sourceText}>tracked from your notes</Text>
              </View>
              {/* Per-category rows with actual amounts + bars */}
              {grouped.map(g => {
                const barFill = g.total / maxTotal;
                const isOver  = budget ? g.total > budget * 0.5 : false;
                const barColor = isOver
                  ? 'rgba(252,165,165,0.50)'
                  : 'rgba(74,222,128,0.40)';
                return (
                  <View key={g.category} style={infoStyles.catRow}>
                    <View style={infoStyles.catHeader}>
                      <Text style={infoStyles.catName}>{g.category}</Text>
                      <Text style={[infoStyles.catAmount, { color: 'rgba(224,242,254,0.85)' }]}>
                        {formatINR(g.total)}
                        <Text style={expStyles.txCount}> · {g.count} item{g.count !== 1 ? 's' : ''}</Text>
                      </Text>
                    </View>
                    <View style={infoStyles.spendTrack}>
                      <View style={[infoStyles.spendBar, { flex: barFill, backgroundColor: barColor }]} />
                      <View style={{ flex: 1 - barFill }} />
                    </View>
                    {/* Most recent entry in this category */}
                    {g.entries[g.entries.length - 1]?.description ? (
                      <Text style={infoStyles.catSummary}>
                        Last: {g.entries[g.entries.length - 1].description}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          );
        }

        // Fallback: AI-estimated categories from monthly insight
        const cats = monthlyData?.spendCategories ?? [];
        const total = cats.reduce((s, c) => s + (c.amount ?? 0), 0);
        const budget = goals?.monthlySpendBudget;
        const totalEl = total > 0
          ? budget
            ? <GoalProgressBar label="SPENT THIS MONTH" current={total} target={budget} unit="₹" color="rgba(74,222,128,0.70)" />
            : <View style={expStyles.totalRow}>
                <Text style={expStyles.totalLabel}>TOTAL THIS MONTH</Text>
                <Text style={expStyles.totalAmount}>{formatINR(total)}</Text>
              </View>
          : null;
        const catList = cats.length ? <SpendCategoryList categories={cats} /> : null;
        return totalEl || catList ? <>{totalEl}{catList}</> : null;
      }

      case 'Recurring thoughts':
        return monthlyData?.recurringTopics?.length
          ? <WordCloud topics={monthlyData.recurringTopics} />
          : null;

      case 'Learnings':
        return <LearningCount count={monthlyData?.learningCount ?? 0} />;

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
        {datePrefix}{expanded ? effectiveBody : preview}
      </Text>
    </TouchableOpacity>
  );
}

// ── Goals progress widgets ────────────────────────────────────────────────────

function GoalProgressBar({
  label, current, target, unit, color,
}: {
  label: string; current: number; target: number; unit: string; color: string;
}) {
  const pct     = Math.min(current / target, 1);
  const over    = current > target;
  const barColor = over
    ? 'rgba(252,165,165,0.70)'
    : pct >= 0.8
      ? 'rgba(251,191,36,0.70)'
      : color;

  return (
    <View style={gpStyles.wrap}>
      <View style={gpStyles.topRow}>
        <Text style={gpStyles.label}>{label}</Text>
        <Text style={[gpStyles.value, over && { color: 'rgba(252,165,165,0.90)' }]}>
          {unit === '₹'
            ? `₹${current >= 100000 ? (current/100000).toFixed(1)+'L' : current >= 1000 ? (current/1000).toFixed(1)+'k' : Math.round(current)} / ₹${target >= 100000 ? (target/100000).toFixed(1)+'L' : target >= 1000 ? (target/1000).toFixed(1)+'k' : target}`
            : `${current} / ${target} ${unit}`}
        </Text>
      </View>
      <View style={gpStyles.track}>
        <View style={[gpStyles.bar, { flex: pct, backgroundColor: barColor }]} />
        <View style={{ flex: 1 - pct }} />
      </View>
      {over && <Text style={gpStyles.overText}>↑ {Math.round((current / target - 1) * 100)}% over target</Text>}
    </View>
  );
}

const gpStyles = StyleSheet.create({
  wrap:     { marginTop: 8, gap: 5 },
  topRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label:    { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', letterSpacing: 0.3 },
  value:    { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.80)' },
  track:    { height: 5, borderRadius: 3, flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(152,212,250,0.08)' },
  bar:      { height: 5, borderRadius: 3 },
  overText: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(252,165,165,0.75)' },
});

// ── Spending Tracker Card — always shown first in carousel ────────────────────

function SpendingTrackerCard({
  expenses,
  budget,
  aiCategories,
}: {
  expenses: ExpenseEntry[];
  budget?: number;
  aiCategories?: SpendCategory[];
}) {
  const hasTracked = expenses.length > 0;
  const total      = hasTracked
    ? expenses.reduce((s, e) => s + e.amount, 0)
    : (aiCategories ?? []).reduce((s, c) => s + (c.amount ?? 0), 0);

  const grouped  = hasTracked ? groupByCategory(expenses) : [];
  const maxTotal = grouped[0]?.total ?? 1;

  // Days remaining in month
  const now       = new Date();
  const lastDay   = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft  = lastDay - now.getDate();
  const monthName = now.toLocaleDateString([], { month: 'long' });

  const pct      = budget && total > 0 ? Math.min(total / budget, 1) : 0;
  const over     = budget ? total > budget : false;
  const barColor = over
    ? 'rgba(252,165,165,0.70)'
    : pct >= 0.85
      ? 'rgba(251,191,36,0.70)'
      : 'rgba(74,222,128,0.65)';

  return (
    <View style={spendCardStyles.wrap}>
      {/* Header row */}
      <View style={spendCardStyles.headerRow}>
        <View style={spendCardStyles.headerLeft}>
          <Feather name="credit-card" size={11} color="rgba(152,212,250,0.60)" />
          <Text style={spendCardStyles.title}>SPENDING · {monthName.toUpperCase()}</Text>
        </View>
        <Text style={spendCardStyles.daysLeft}>{daysLeft}d left</Text>
      </View>

      {/* Budget vs total */}
      {budget ? (
        <>
          <View style={spendCardStyles.amountRow}>
            <Text style={[spendCardStyles.spent, over && { color: 'rgba(252,165,165,0.90)' }]}>
              {formatINR(total)}
            </Text>
            <Text style={spendCardStyles.slash}> / </Text>
            <Text style={spendCardStyles.goal}>{formatINR(budget)}</Text>
          </View>
          <View style={spendCardStyles.track}>
            <View style={[spendCardStyles.bar, { flex: pct, backgroundColor: barColor }]} />
            <View style={{ flex: Math.max(0, 1 - pct) }} />
          </View>
          <View style={spendCardStyles.subRow}>
            <Text style={[spendCardStyles.subText, over && { color: 'rgba(252,165,165,0.75)' }]}>
              {over
                ? `${formatINR(total - budget)} over budget`
                : `${formatINR(budget - total)} remaining`}
            </Text>
            <Text style={spendCardStyles.pctText}>{Math.round(pct * 100)}%</Text>
          </View>
        </>
      ) : total > 0 ? (
        <View style={spendCardStyles.amountRow}>
          <Text style={spendCardStyles.spent}>{formatINR(total)}</Text>
          <Text style={spendCardStyles.noGoalHint}> this month</Text>
        </View>
      ) : null}

      {/* ── Tracked categories (from voice/manual notes) ── */}
      {hasTracked && (
        <>
          <View style={spendCardStyles.sourceTag}>
            <Feather name="mic" size={9} color="rgba(147,197,253,0.70)" />
            <Text style={spendCardStyles.sourceText}>tracked from your notes</Text>
          </View>
          <View style={spendCardStyles.catList}>
            {grouped.map(g => {
              const fill     = g.total / maxTotal;
              const isOver   = budget ? g.total > budget * 0.5 : false;
              const catColor = isOver ? 'rgba(252,165,165,0.50)' : 'rgba(74,222,128,0.40)';
              const lastDesc = g.entries[g.entries.length - 1]?.description;
              return (
                <View key={g.category} style={spendCardStyles.detailCatWrap}>
                  <View style={infoStyles.catHeader}>
                    <Text style={infoStyles.catName}>{g.category}</Text>
                    <Text style={[infoStyles.catAmount, { color: 'rgba(224,242,254,0.85)' }]}>
                      {formatINR(g.total)}
                      <Text style={expStyles.txCount}> · {g.count} item{g.count !== 1 ? 's' : ''}</Text>
                    </Text>
                  </View>
                  <View style={infoStyles.spendTrack}>
                    <View style={[infoStyles.spendBar, { flex: fill, backgroundColor: catColor }]} />
                    <View style={{ flex: 1 - fill }} />
                  </View>
                  {lastDesc ? (
                    <Text style={infoStyles.catSummary}>Last: {lastDesc}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── AI-estimated categories (fallback when nothing tracked) ── */}
      {!hasTracked && (aiCategories ?? []).length > 0 && (
        <SpendCategoryList categories={aiCategories!} />
      )}

      {/* Empty state */}
      {!hasTracked && (aiCategories ?? []).length === 0 && (
        <Text style={spendCardStyles.emptyHint}>
          Mention purchases while journaling and they'll appear here.
        </Text>
      )}
    </View>
  );
}

const spendCardStyles = StyleSheet.create({
  wrap:       { gap: 8 },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title:      { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', letterSpacing: 0.5 },
  daysLeft:   { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)' },
  amountRow:  { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  spent:      { fontSize: 24, fontFamily: 'Baskerville', color: 'rgba(224,242,254,0.90)', fontWeight: '600' },
  slash:      { fontSize: 16, color: 'rgba(152,212,250,0.35)' },
  goal:       { fontSize: 16, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)' },
  noGoalHint: { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)' },
  track:      { height: 6, borderRadius: 3, flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(152,212,250,0.08)' },
  bar:        { height: 6, borderRadius: 3 },
  subRow:     { flexDirection: 'row', justifyContent: 'space-between' },
  subText:    { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)' },
  pctText:    { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)' },
  sourceTag:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  sourceText: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(147,197,253,0.65)' },
  catList:    { gap: 8, marginTop: 2 },
  detailCatWrap: { gap: 3 },
  catRow:     { flexDirection: 'row', alignItems: 'center', gap: 7 },
  catName:    { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.65)', width: 80 },
  catTrack:   { flex: 1, height: 4, borderRadius: 2, flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(152,212,250,0.08)' },
  catBar:     { height: 4, borderRadius: 2 },
  catAmt:     { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.70)', width: 44, textAlign: 'right' },
  emptyHint:  { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', fontStyle: 'italic', lineHeight: 16, marginTop: 4 },
});

// ── Main card ─────────────────────────────────────────────────────────────────

// ── Tracker → section key mapping ─────────────────────────────────────────────
const TRACKER_SECTION_MAP: Record<string, string> = {
  meals:      'Meals',
  workout:    'Movement',
  meditation: 'Meditation',
  spending:   'Spending',
};

// Sections that are always shown regardless of tracker settings
const ALWAYS_SHOWN_SECTIONS = new Set(['Emotional check-in', 'Recurring thoughts']);

export default function MonthlyInsightCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [insight,           setInsight]           = useState<MonthlyInsight | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [notEnoughData,     setNotEnoughData]     = useState(false);
  const [error,             setError]             = useState<string | null>(null);
  const [refreshing,        setRefreshing]        = useState(false);
  const [showPaywall,       setShowPaywall]       = useState(false);
  const [carouselPage,      setCarouselPage]      = useState(0);
  const [goals,             setGoals]             = useState<UserGoals | null>(null);
  const [showGoals,         setShowGoals]         = useState(false);
  const [trackedExpenses,   setTrackedExpenses]   = useState<ExpenseEntry[]>([]);
  const [enabledTrackers,   setEnabledTrackers]   = useState<Set<string>>(
    new Set(['meals', 'workout', 'meditation', 'spending']),
  );

  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loadInsight(false);
    StorageService.getGoals().then(g => setGoals(g));
    // Load real tracked expenses for the current month (use local date to match save keys)
    const _now = new Date();
    const yearMonth = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
    StorageService.getExpensesForMonth(yearMonth)
      .then(entries => setTrackedExpenses(entries))
      .catch(() => {});
    // Load tracker preferences
    StorageService.getSettings().then(s => {
      if (s?.enabledTrackers) {
        setEnabledTrackers(new Set(s.enabledTrackers));
      }
    }).catch(() => {});
  }, [refreshKey]);

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
    // If we already have data, keep it visible and show a spinner instead of
    // blanking the card with the skeleton loader.
    if (insight !== null || force) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await generateMonthlyInsight(force);
      setInsight(result);
    } catch (e: any) {
      if (e?.message === NOT_ENOUGH_DATA) setNotEnoughData(true);
      else setError(e?.message ?? 'Could not load monthly insight.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Soft gate: first monthly insight is free (auto-load). Manual refresh requires Pro.
  const gatedLoadInsight = async (force: boolean) => {
    if (force && insight !== null) {
      const allowed = await SubscriptionService.hasPro();
      if (!allowed) { setShowPaywall(true); return; }
    }
    loadInsight(force);
  };

  // Month label e.g. "March 2026"
  const monthLabel = insight
    ? new Date(insight.weekStart + 'T12:00:00').toLocaleDateString([], { month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString([], { month: 'long', year: 'numeric' });

  const allSections = insight ? parseSections(insight.insightText) : [];
  // Filter out tracker sections the user hasn't opted into
  const sections = allSections.filter(s => {
    if (ALWAYS_SHOWN_SECTIONS.has(s.key)) return true;
    const trackerKey = Object.entries(TRACKER_SECTION_MAP).find(([, v]) => v === s.key)?.[0];
    if (!trackerKey) return true;
    return enabledTrackers.has(trackerKey);
  });

  const TRACKER_SECTION_KEYS = new Set(Object.values(TRACKER_SECTION_MAP));
  // Exclude AI "Spending" from carousel — replaced by the always-present SpendingTrackerCard
  const trackerSections = sections.filter(s => TRACKER_SECTION_KEYS.has(s.key) && s.key !== 'Spending');
  const otherSections   = sections.filter(s => !TRACKER_SECTION_KEYS.has(s.key));
  const showSpendCard   = enabledTrackers.has('spending');

  return (
    <>
    <View style={styles.cardless}>
      {/* ── Heading ── */}
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.heading}>Monthly insights</Text>
          <Text style={styles.headingSub}>{monthLabel}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => setShowGoals(true)}
            style={[styles.refreshBtn, { borderColor: goals ? 'rgba(74,222,128,0.35)' : 'rgba(152,212,250,0.18)' }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="target" size={13} color={goals ? 'rgba(74,222,128,0.80)' : 'rgba(152,212,250,0.55)'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => gatedLoadInsight(true)}
            disabled={refreshing || loading}
            style={styles.refreshBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {refreshing
              ? <ActivityIndicator size="small" color="rgba(152,212,250,0.85)" />
              : <Feather name="refresh-cw" size={13} color="rgba(152,212,250,0.65)" />}
          </TouchableOpacity>
        </View>
      </View>

      <GoalsModal
        visible={showGoals}
        onClose={() => setShowGoals(false)}
        onSaved={g => setGoals(g)}
      />

      {/* ── Loading skeleton ── */}
      {loading && (
        <View style={{ gap: 8 }}>
          {(['92%', '78%', '65%'] as const).map((w, i) => (
            <Animated.View key={i} style={[styles.skeletonLine, { width: w, opacity: pulseAnim }]} />
          ))}
        </View>
      )}

      {/* ── Spending tracker — always shown when enabled, independent of monthly insight ── */}
      {!loading && showSpendCard && (
        (() => {
          const otherTrackerCount = insight ? trackerSections.length : 0;
          const totalPages = 1 + otherTrackerCount;
          const pageWidth  = Dimensions.get('window').width - 40;
          return (
            <View style={styles.trackerOuterCard}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.trackerScroll}
                style={styles.trackerScrollWrap}
                onMomentumScrollEnd={e => {
                  const page = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
                  setCarouselPage(page);
                }}
              >
                {/* Spending card — always first */}
                <View style={styles.trackerPage}>
                  <SpendingTrackerCard
                    expenses={trackedExpenses}
                    budget={goals?.monthlySpendBudget}
                    aiCategories={insight?.weeklyData?.spendCategories}
                  />
                </View>
                {/* Other tracker sections only when insight is loaded */}
                {insight && trackerSections.map(s => (
                  <View key={s.key} style={styles.trackerPage}>
                    <SectionRow
                      sectionKey={s.key}
                      body={s.body}
                      monthlyData={insight.weeklyData}
                      goals={goals ?? undefined}
                      trackedExpenses={undefined}
                    />
                  </View>
                ))}
              </ScrollView>
              {totalPages > 1 && (
                <View style={styles.carouselDots}>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <View key={i} style={[styles.carouselDot, i === carouselPage && styles.carouselDotActive]} />
                  ))}
                </View>
              )}
            </View>
          );
        })()
      )}

      {/* ── Not enough data ── */}
      {!loading && notEnoughData && !showSpendCard && (
        <Text style={styles.emptyText}>
          Keep journaling — monthly insights appear once you have at least one daily summary this month.
        </Text>
      )}

      {/* ── Error ── */}
      {!loading && error && <Text style={styles.errorText}>{error}</Text>}

      {/* ── Loaded ── */}
      {!loading && insight && (
        <>
          {/* Stats row — days active + entries */}
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

          {/* Other sections — vertical (Emotional check-in, Recurring thoughts, Learnings) */}
          {otherSections.length > 0 && (
            <View style={styles.sections}>
              {otherSections.map(s => (
                <SectionRow
                  key={s.key}
                  sectionKey={s.key}
                  body={s.body}
                  monthlyData={insight.weeklyData}
                  goals={goals ?? undefined}
                  trackedExpenses={undefined}
                />
              ))}
            </View>
          )}

          <Text style={styles.lastUpdated}>Updated {formatRelativeTime(insight.generatedAt)}</Text>
        </>
      )}
    </View>

    <PaywallModal
      visible={showPaywall}
      featureHint="Refresh your monthly insights as often as you like with Pro."
      onClose={() => setShowPaywall(false)}
      onSuccess={() => { setShowPaywall(false); loadInsight(true); }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20, padding: 16, marginBottom: 16, marginTop: 4,
    marginHorizontal: 20,
    backgroundColor: 'rgba(3, 18, 40, 0.65)',
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.12)',
    shadowColor: '#98D4FA', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10, shadowRadius: 18, elevation: 4,
  },

  cardless: {
    marginBottom: 16, marginTop: 24, marginHorizontal: 20,
  },

  headingRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 14,
  },
  heading: {
    fontSize: 19, fontWeight: '500',
    color: 'rgba(224,242,254,0.95)', fontFamily: 'Baskerville',
  },
  headingSub: {
    fontSize: 12, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.52)', marginTop: 3,
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
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)',
    paddingHorizontal: 18, paddingVertical: 14, marginBottom: 12,
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

  trackerOuterCard: {
    borderRadius: 20,
    backgroundColor: 'rgba(4,13,30,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.12)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  trackerScrollWrap: { },
  trackerScroll: { },
  trackerPage: { width: Dimensions.get('window').width - 40, padding: 16 },
  carouselDots: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 5, paddingBottom: 10,
  },
  carouselDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(152,212,250,0.20)',
  },
  carouselDotActive: {
    width: 14,
    backgroundColor: 'rgba(152,212,250,0.70)',
  },

  sections: { gap: 6 },
  sectionRow: {
    backgroundColor: 'rgba(152,212,250,0.04)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(152,212,250,0.10)',
    paddingHorizontal: 16, paddingVertical: 13,
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
