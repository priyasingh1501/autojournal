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
  rising:  { name: 'trending-up',   color: 'rgba(110,231,183,0.90)' },
  stable:  { name: 'minus',         color: 'rgba(152,212,250,0.55)' },
  falling: { name: 'trending-down', color: 'rgba(251,191, 36,0.90)' },
};

function ThemeRow({
  theme,
  rank,
  onPressDate,
}: {
  theme: ThemeEntry;
  rank: number;
  onPressDate: (date: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const trend = TREND_ICON[theme.trend] ?? TREND_ICON.stable;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(e => !e);
  };

  return (
    <TouchableOpacity style={styles.row} onPress={toggle} activeOpacity={0.8}>
      <View style={styles.rowHeader}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{rank}</Text>
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.themeLabel}>{theme.theme}</Text>
          <Text style={styles.excerpt} numberOfLines={expanded ? undefined : 1}>
            {theme.excerpt}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Feather name={trend.name} size={14} color={trend.color} />
          <Text style={styles.freqText}>{theme.frequency}d</Text>
        </View>
      </View>

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
    </TouchableOpacity>
  );
}

interface Props {
  data: ThoughtPatternAnalysis;
  onJumpToDate: (date: string) => void;
}

export default function ThoughtPatternList({ data, onJumpToDate }: Props) {
  return (
    <View>
      <Text style={styles.narrative}>{data.narrative}</Text>
      <View style={styles.list}>
        {data.themes.map((t, i) => (
          <ThemeRow key={t.theme} theme={t} rank={i + 1} onPressDate={onJumpToDate} />
        ))}
      </View>
      <Text style={styles.hint}>Tap a pattern to see dates · tap a date to view that summary</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  narrative: {
    fontSize: 14,
    color: 'rgba(224, 242, 254, 0.80)',
    lineHeight: 22,
    fontFamily: 'GillSans-Light',
    marginBottom: 20,
  },
  list: { gap: 8, marginBottom: 12 },
  row: {
    backgroundColor: 'rgba(152,212,250,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.10)',
    padding: 14,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rankBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(152,212,250,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  rankText: { fontSize: 11, color: 'rgba(152,212,250,0.70)', fontFamily: 'GillSans-Light' },
  rowMain: { flex: 1, gap: 3 },
  themeLabel: {
    fontSize: 15,
    fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.92)',
  },
  excerpt: {
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.60)',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  freqText: { fontSize: 11, color: 'rgba(152,212,250,0.55)', fontFamily: 'GillSans-Light' },
  datesSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(152,212,250,0.08)' },
  datesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dateBadge: {
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(152,212,250,0.08)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.18)',
  },
  dateBadgeText: { fontSize: 11, color: 'rgba(152,212,250,0.80)', fontFamily: 'GillSans-Light' },
  hint: {
    fontSize: 11,
    color: 'rgba(152,212,250,0.40)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
    marginTop: 4,
  },
});
