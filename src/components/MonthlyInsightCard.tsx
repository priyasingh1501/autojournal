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
import { MonthlyInsight, MonthlyData, SpendCategory, EmotionCount, UserGoals, DayMacros } from '../types';
import { generateMonthlyInsight, NOT_ENOUGH_DATA } from '../services/MonthlyInsightService';
import { StorageService } from '../services/StorageService';
import { SECTION_LABELS } from './InsightSections';
import GoalsModal from './GoalsModal';

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

/** Per-day meal quality grid — same layout as meditation, 3-state colour */
const MEAL_DAY_STYLE: Record<'good' | 'mixed' | 'poor', object> = {
  good:  { backgroundColor: 'rgba(110,231,183,0.20)', borderWidth: 1, borderColor: 'rgba(110,231,183,0.65)' },
  mixed: { backgroundColor: 'rgba(251,191,36,0.18)',  borderWidth: 1, borderColor: 'rgba(251,191,36,0.60)'  },
  poor:  { backgroundColor: 'rgba(252,165,165,0.20)', borderWidth: 1, borderColor: 'rgba(252,165,165,0.60)' },
};

function MealDayGrid({ days }: { days: ('good' | 'mixed' | 'poor' | null)[] }) {
  const rows: ('good' | 'mixed' | 'poor' | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
  return (
    <View style={{ gap: 5, marginTop: 7 }}>
      {rows.map((row, wi) => (
        <View key={wi} style={infoStyles.gridRow}>
          <Text style={infoStyles.weekLabel}>W{wi + 1}</Text>
          {row.map((quality, di) => (
            <View
              key={di}
              style={[infoStyles.gridDot, quality ? MEAL_DAY_STYLE[quality] : infoStyles.gridDotOff]}
            />
          ))}
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

const mealGridStyles = StyleSheet.create({
  legend:      { flexDirection: 'row', gap: 12, marginTop: 5 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', textTransform: 'lowercase' },
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

const mealGoalStyles = StyleSheet.create({
  panel:       { marginTop: 8, backgroundColor: 'rgba(251,191,36,0.04)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(251,191,36,0.12)', padding: 10, gap: 6 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nutriLabel:  { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)' },
  nutriTarget: { fontSize: 13, fontFamily: 'Baskerville', color: 'rgba(251,191,36,0.90)' },
  hint:        { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.38)', lineHeight: 14, marginTop: 2 },
});

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
}: {
  sectionKey: string;
  body: string;
  monthlyData?: MonthlyData;
  goals?: UserGoals;
}) {
  const [expanded, setExpanded] = useState(false);
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
        const monthlyGrid = monthlyData?.mealDays?.length
          ? <MealDayGrid days={monthlyData.mealDays} />
          : monthlyData?.mealWeeks?.length
            ? <MealWeekStrip weeks={monthlyData.mealWeeks as any} />
            : null;

        // Last day with macro data — default for daily view
        const lastMacros = monthlyData?.mealMacrosByDay?.length
          ? monthlyData.mealMacrosByDay[monthlyData.mealMacrosByDay.length - 1]
          : undefined;

        const hasAnyMealData = !!(monthlyGrid || lastMacros);
        if (!hasAnyMealData) return null;

        return (
          <View style={{ gap: 14, marginTop: 6 }}>
            <View style={{ gap: 6 }}>
              <Text style={mealSectionLabel.label}>DAY</Text>
              <DailyMacroView macros={lastMacros} goals={goals} />
            </View>
            {monthlyGrid && (
              <View style={{ gap: 6 }}>
                <Text style={mealSectionLabel.label}>MONTH</Text>
                {monthlyGrid}
              </View>
            )}
          </View>
        );
      }

      case 'Spending': {
        const catList = monthlyData?.spendCategories?.length
          ? <SpendCategoryList categories={monthlyData.spendCategories} />
          : null;
        // Goal: monthlySpendBudget
        const totalSpend = monthlyData?.spendCategories
          ?.filter(c => c.source === 'sms' && c.amount != null)
          .reduce((s, c) => s + (c.amount ?? 0), 0) ?? 0;
        const spendBar = goals?.monthlySpendBudget && totalSpend > 0
          ? <GoalProgressBar
              label="MONTHLY BUDGET"
              current={totalSpend}
              target={goals.monthlySpendBudget}
              unit="₹"
              color="rgba(74,222,128,0.70)"
            />
          : null;
        return catList || spendBar ? <>{catList}{spendBar}</> : null;
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

// ── Main card ─────────────────────────────────────────────────────────────────

export default function MonthlyInsightCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [insight,       setInsight]       = useState<MonthlyInsight | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [notEnoughData, setNotEnoughData] = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [refreshing,    setRefreshing]    = useState(false);
  const [goals,         setGoals]         = useState<UserGoals | null>(null);
  const [showGoals,     setShowGoals]     = useState(false);

  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loadInsight(false);
    StorageService.getGoals().then(g => setGoals(g));
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
    if (force) setRefreshing(true);
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
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => setShowGoals(true)}
            style={[styles.refreshBtn, { borderColor: goals ? 'rgba(74,222,128,0.35)' : 'rgba(152,212,250,0.18)' }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="target" size={13} color={goals ? 'rgba(74,222,128,0.80)' : 'rgba(152,212,250,0.55)'} />
          </TouchableOpacity>
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
                monthlyData={insight.weeklyData}
                goals={goals ?? undefined}
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
