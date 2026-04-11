import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, LayoutAnimation,
  Platform, UIManager,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ThoughtPatternAnalysis, ThemeEntry } from '../../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TREND_ICON: Record<string, any> = {
  rising:  { name: 'trending-up',   color: 'rgba(110,231,183,0.85)' },
  stable:  { name: 'minus',         color: 'rgba(152,212,250,0.45)' },
  falling: { name: 'trending-down', color: 'rgba(251,191, 36,0.85)' },
};

const MAX_FREQ = 1; // computed per-render from themes array

function ThemeRow({
  theme,
  rank,
  ratio,
  onPressDate,
}: {
  theme: ThemeEntry;
  rank: number;
  ratio: number;
  onPressDate: (date: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const trend = TREND_ICON[theme.trend] ?? TREND_ICON.stable;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(e => !e);
  };

  const textOpacity  = 0.40 + ratio * 0.60;   // 0.40 → 1.0
  const barOpacity   = 0.20 + ratio * 0.75;   // 0.20 → 0.95
  const barWidth     = Math.round(3 + ratio * 2); // 3–5 px
  const rankOpacity  = 0.25 + ratio * 0.40;   // fades with rank

  return (
    <TouchableOpacity onPress={toggle} activeOpacity={0.75} style={styles.row}>
      {/* Left accent bar */}
      <View style={[styles.bar, { width: barWidth, opacity: barOpacity }]} />

      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          {/* Rank number */}
          <Text style={[styles.rank, { opacity: rankOpacity }]}>
            {String(rank).padStart(2, '0')}
          </Text>

          {/* Theme label */}
          <Text style={[styles.themeLabel, { opacity: textOpacity }]} numberOfLines={1}>
            {theme.theme}
          </Text>

          {/* Right — trend icon + frequency */}
          <View style={styles.rowRight}>
            <Feather name={trend.name} size={12} color={trend.color} />
            <Text style={[styles.freqText, { opacity: barOpacity }]}>{theme.frequency}d</Text>
          </View>
        </View>

        {/* Excerpt — always shown, 1 line collapsed */}
        <Text style={styles.excerpt} numberOfLines={expanded ? undefined : 1}>
          {theme.excerpt}
        </Text>

        {/* Expanded dates */}
        {expanded && theme.dates.length > 0 && (
          <View style={styles.datesSection}>
            <View style={styles.datesGrid}>
              {theme.dates.map(d => (
                <TouchableOpacity
                  key={d}
                  style={styles.dateBadge}
                  onPress={() => onPressDate(d)}
                >
                  <Text style={styles.dateBadgeText}>{d.slice(5)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

interface Props {
  data: ThoughtPatternAnalysis;
  onJumpToDate: (date: string) => void;
}

export default function ThoughtPatternList({ data, onJumpToDate }: Props) {
  const maxFreq = Math.max(...data.themes.map(t => t.frequency), 1);

  return (
    <View>
      <Text style={styles.narrative}>{data.narrative}</Text>
      <View style={styles.list}>
        {data.themes.map((t, i) => (
          <ThemeRow
            key={t.theme}
            theme={t}
            rank={i + 1}
            ratio={t.frequency / maxFreq}
            onPressDate={onJumpToDate}
          />
        ))}
      </View>
      <Text style={styles.hint}>Tap a pattern to expand · tap a date to view that summary</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  narrative: {
    fontSize: 14,
    color: 'rgba(224,242,254,0.78)',
    lineHeight: 22,
    fontFamily: 'GillSans-Light',
    marginBottom: 18,
  },
  list: { gap: 2, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 8,
    gap: 12,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(152,212,250,1)',
    minHeight: 18,
  },
  rowBody: { flex: 1, gap: 3 },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rank: {
    fontSize: 10,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.90)',
    letterSpacing: 0.5,
    width: 20,
  },
  themeLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,1)',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  freqText: {
    fontSize: 11,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.90)',
  },
  excerpt: {
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.55)',
    lineHeight: 18,
    paddingLeft: 28, // aligns under theme label (rank width + gap)
  },
  datesSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152,212,250,0.08)',
    paddingLeft: 28,
  },
  datesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dateBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(152,212,250,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.18)',
  },
  dateBadgeText: {
    fontSize: 11,
    color: 'rgba(152,212,250,0.80)',
    fontFamily: 'GillSans-Light',
  },
  hint: {
    fontSize: 11,
    color: 'rgba(152,212,250,0.38)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
    marginTop: 4,
  },
});
