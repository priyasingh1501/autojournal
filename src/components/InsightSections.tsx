import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DayMacros, UserGoals } from '../types';

export const SECTION_LABELS: Record<string, { iconName: string; color: string }> = {
  'Emotional check-in': { iconName: 'activity',     color: 'rgba(236, 72, 153, 0.90)'  },
  'Meals':              { iconName: 'coffee',        color: 'rgba(224, 242, 254, 0.90)' },
  'Movement':           { iconName: 'zap',           color: 'rgba(224, 242, 254, 0.90)' },
  'Meditation':         { iconName: 'moon',          color: 'rgba(196, 181, 253, 0.90)' },
  'Spending':           { iconName: 'credit-card',   color: 'rgba(224, 242, 254, 0.90)' },
  'Recurring thoughts': { iconName: 'repeat',        color: 'rgba(224, 242, 254, 0.90)' },
};

// Which section keys are controlled by tracker preferences
const TRACKER_SECTION_KEYS: Record<string, string> = {
  'Meals':      'meals',
  'Movement':   'workout',
  'Meditation': 'meditation',
  'Spending':   'spending',
};

// ── Macro progress bar ────────────────────────────────────────────────────────

function MacroBar({ label, value, target, unit, color }: {
  label: string; value: number; target?: number | null; unit: string; color: string;
}) {
  const pct = target ? Math.min(value / target, 1) : 1;
  const over = !!target && value > target * 1.1;
  const barColor = over
    ? 'rgba(252,165,165,0.75)'
    : target && pct >= 0.85 ? color
    : target && pct >= 0.5  ? 'rgba(251,191,36,0.65)'
    : color;
  return (
    <View style={macroStyles.wrap}>
      <View style={macroStyles.topRow}>
        <Text style={macroStyles.label}>{label}</Text>
        <Text style={[macroStyles.value, over && { color: 'rgba(252,165,165,0.90)' }]}>
          {Math.round(value)}{unit}{target ? ` / ${target}${unit}` : ''}
        </Text>
      </View>
      <View style={macroStyles.track}>
        <View style={[macroStyles.fill, { flex: pct, backgroundColor: barColor }]} />
        <View style={{ flex: 1 - pct }} />
      </View>
    </View>
  );
}

const macroStyles = StyleSheet.create({
  wrap:   { gap: 4, marginBottom: 6 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label:  { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', textTransform: 'uppercase', letterSpacing: 0.3 },
  value:  { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.80)' },
  track:  { height: 5, borderRadius: 3, flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(152,212,250,0.08)' },
  fill:   { height: 5, borderRadius: 3 },
  block:  { marginTop: 10 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  liveDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(110,231,183,0.80)' },
  liveText: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(110,231,183,0.70)', letterSpacing: 0.3 },
});

// ── Main renderer ─────────────────────────────────────────────────────────────

// When null, all sections are shown (default / no preference saved)
export function renderInsightSections(
  text: string,
  enabledTrackers?: Set<string> | null,
  macros?: DayMacros | null,
  goals?: UserGoals | null,
  isLive?: boolean,
): React.ReactNode {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const headingKey = Object.keys(SECTION_LABELS).find(
      k => line.toLowerCase().startsWith(k.toLowerCase()),
    );

    if (headingKey) {
      const meta = SECTION_LABELS[headingKey];
      const bodyLines: string[] = [];
      i++;
      while (
        i < lines.length &&
        !Object.keys(SECTION_LABELS).some(k =>
          lines[i].toLowerCase().startsWith(k.toLowerCase()),
        )
      ) {
        bodyLines.push(lines[i]);
        i++;
      }

      // Filter tracker-controlled sections if preferences exist
      if (enabledTrackers && TRACKER_SECTION_KEYS[headingKey]) {
        if (!enabledTrackers.has(TRACKER_SECTION_KEYS[headingKey])) {
          continue; // skip this section
        }
      }

      const inlineBody = line.replace(new RegExp(`^${headingKey}:?\\s*`, 'i'), '').trim();
      const body = inlineBody
        ? [inlineBody, ...bodyLines].join(' ')
        : bodyLines.join(' ');

      const isMeals = headingKey === 'Meals';
      const hasMacros = isMeals && macros && (
        macros.calories != null || macros.protein != null ||
        macros.carbs != null   || macros.fat != null
      );

      nodes.push(
        <View key={headingKey} style={sectionStyles.card}>
          <View style={sectionStyles.headingRow}>
            <Feather name={meta.iconName as any} size={12} color={meta.color} />
            <Text style={[sectionStyles.heading, { color: meta.color }]}>{'  '}{headingKey}</Text>
            {isMeals && isLive && (
              <View style={[macroStyles.livePill, { marginLeft: 'auto' }]}>
                <View style={macroStyles.liveDot} />
                <Text style={macroStyles.liveText}>running total</Text>
              </View>
            )}
          </View>
          {body.length > 0 && (
            <Text style={sectionStyles.body}>{body}</Text>
          )}
          {hasMacros && (
            <View style={macroStyles.block}>
              {macros!.calories != null && (
                <MacroBar label="Calories" value={macros!.calories!} target={goals?.dailyCalorieTarget} unit=" kcal" color="rgba(251,191,36,0.80)" />
              )}
              {macros!.protein != null && (
                <MacroBar label="Protein" value={macros!.protein!} target={goals?.dailyProteinTarget} unit="g" color="rgba(147,197,253,0.85)" />
              )}
              {macros!.carbs != null && (
                <MacroBar label="Carbs" value={macros!.carbs!} target={goals?.dailyCarbsTarget} unit="g" color="rgba(110,231,183,0.70)" />
              )}
              {macros!.fat != null && (
                <MacroBar label="Fat" value={macros!.fat!} target={goals?.dailyFatTarget} unit="g" color="rgba(196,181,253,0.70)" />
              )}
            </View>
          )}
        </View>,
      );
    } else {
      nodes.push(
        <Text key={`orphan-${i}`} style={sectionStyles.body}>{line}</Text>,
      );
      i++;
    }
  }

  return <View style={sectionStyles.wrapper}>{nodes}</View>;
}

const sectionStyles = StyleSheet.create({
  wrapper: { gap: 10 },
  card: {
    backgroundColor: 'rgba(152, 212, 250, 0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.10)',
    padding: 14,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  heading: { fontSize: 13, fontWeight: '500', letterSpacing: 0.2, fontFamily: 'Baskerville' },
  body: { fontSize: 14, color: 'rgba(224, 242, 254, 0.75)', lineHeight: 22, fontFamily: 'GillSans-Light' },
});
