import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, LayoutAnimation,
  Platform, UIManager,
} from 'react-native';
import { EmotionAnalysis, EmotionEntry } from '../../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const INTENSITY_DOTS: Record<string, number> = { low: 1, medium: 2, high: 3 };

function IntensityDots({ intensity, color }: { intensity: string; color: string }) {
  const filled = INTENSITY_DOTS[intensity] ?? 1;
  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={[
            styles.intensityDot,
            { backgroundColor: i < filled ? color : 'rgba(152,212,250,0.12)' },
          ]}
        />
      ))}
    </View>
  );
}

function EmotionChip({
  entry,
  onPressDate,
}: {
  entry: EmotionEntry;
  onPressDate: (date: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = entry.color ?? 'rgba(152,212,250,0.70)';

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(e => !e);
  };

  return (
    <TouchableOpacity
      style={[styles.chip, { borderColor: color + '55', backgroundColor: 'rgba(6,18,38,0.85)' }]}
      onPress={toggle}
      activeOpacity={0.8}
    >
      <View style={styles.chipHeader}>
        <Text style={[styles.chipName, { color }]}>{entry.name}</Text>
        <View style={styles.chipRight}>
          <IntensityDots intensity={entry.intensity} color={color} />
          <Text style={[styles.chipCount, { color: color }]}>{entry.occurrences}d</Text>
        </View>
      </View>

      {expanded && (
        <View style={styles.datesGrid}>
          {entry.dates.map(d => (
            <TouchableOpacity
              key={d}
              style={styles.dateBadge}
              onPress={() => onPressDate(d)}
            >
              <Text style={styles.dateBadgeText}>{d.slice(5)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

interface Props {
  data: EmotionAnalysis;
  onJumpToDate: (date: string) => void;
}

export default function EmotionTimeline({ data, onJumpToDate }: Props) {
  return (
    <View>
      <Text style={styles.narrative}>{data.narrative}</Text>
      <View style={styles.grid}>
        {data.emotions.map(e => (
          <EmotionChip key={e.name} entry={e} onPressDate={onJumpToDate} />
        ))}
      </View>
      <Text style={styles.hint}>Tap an emotion to see which days · tap a date to view that summary</Text>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  chip: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
    minWidth: '44%',
    flex: 1,
  },
  chipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipName: {
    fontSize: 14,
    fontFamily: 'Baskerville',
    textTransform: 'capitalize',
  },
  chipCount: { fontSize: 11, fontFamily: 'GillSans-Light' },
  dotsRow: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  intensityDot: { width: 6, height: 6, borderRadius: 3 },
  datesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  dateBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(152,212,250,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.20)',
  },
  dateBadgeText: { fontSize: 11, color: 'rgba(152,212,250,0.85)', fontFamily: 'GillSans-Light' },
  hint: {
    fontSize: 11,
    color: 'rgba(152,212,250,0.40)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
    marginTop: 4,
  },
});
