import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';

export interface TodayCardBucket {
  hour: number;  // 0–23
  count: number;
}

export interface TodayCardData {
  entryCount: number;
  dominantEmotions: string[];
  entriesByHour: TodayCardBucket[];  // always 24 entries, in hour order
  lastEntryAt: number | null;
}

interface Props {
  data: TodayCardData | null;
}

const { height: SCREEN_H } = Dimensions.get('window');

function entryLabel(n: number): string {
  if (n === 0) return 'No entries yet today';
  if (n === 1) return '1 entry today';
  return `${n} entries today`;
}

function relativeTime(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return '';
}

// ── 24-hour timeline strip ──────────────────────────────────────────────────
// Mirrors DayDigestView's HourlyStrip so Home and the Journal digest read
// visually the same.
function HourlyStrip({ buckets }: { buckets: TodayCardBucket[] }) {
  const maxCount = Math.max(1, ...buckets.map(b => b.count));
  return (
    <View style={strip.wrap}>
      <View style={strip.row}>
        {buckets.map(b => {
          const active = b.count > 0;
          const intensity = !active ? 0 : Math.min(3, Math.ceil((b.count / maxCount) * 3));
          return (
            <View
              key={b.hour}
              style={[strip.cell, strip[`cell${intensity}` as 'cell0' | 'cell1' | 'cell2' | 'cell3']]}
            />
          );
        })}
      </View>
      <View style={strip.legend}>
        <Text style={strip.legendText}>12am</Text>
        <Text style={strip.legendText}>6am</Text>
        <Text style={strip.legendText}>noon</Text>
        <Text style={strip.legendText}>6pm</Text>
        <Text style={strip.legendText}>11pm</Text>
      </View>
    </View>
  );
}

export default function TodayCard({ data }: Props) {
  const countScale = useRef(new Animated.Value(1)).current;
  const prevCount  = useRef<number | null>(null);

  useEffect(() => {
    if (data && prevCount.current !== null && data.entryCount > prevCount.current) {
      Animated.sequence([
        Animated.timing(countScale, { toValue: 1.08, duration: 140, useNativeDriver: true }),
        Animated.timing(countScale, { toValue: 1,    duration: 140, useNativeDriver: true }),
      ]).start();
    }
    prevCount.current = data?.entryCount ?? null;
  }, [data?.entryCount]);

  if (SCREEN_H < 700) return null;
  if (!data) return null;

  const timeStr = data.lastEntryAt ? relativeTime(data.lastEntryAt) : '';

  return (
    <View style={s.card}>
      <View style={s.inner}>

        <View style={s.topRow}>
          <Animated.Text style={[s.countText, { transform: [{ scale: countScale }] }]}>
            {entryLabel(data.entryCount)}
          </Animated.Text>
          {!!timeStr && <Text style={s.timeText}>{timeStr}</Text>}
        </View>

        <HourlyStrip buckets={data.entriesByHour} />

        {data.dominantEmotions.length > 0 && (
          <View style={s.block}>
            <Text style={s.blockLabel}>FEELING</Text>
            <View style={s.chipsRow}>
              {data.dominantEmotions.map(e => (
                <View key={e} style={s.chip}>
                  <Text style={s.chipText}>{e}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(2,6,14,0.90)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.16)',
  },

  inner: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 12,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  countText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.70)',
  },

  timeText: {
    fontSize: 11,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.40)',
  },

  block: { gap: 8 },

  blockLabel: {
    fontSize: 10,
    letterSpacing: 1.0,
    fontWeight: '500',
    color: 'rgba(152,212,250,0.50)',
    fontFamily: 'GillSans-Light',
  },

  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.28)',
    backgroundColor: 'rgba(9,41,173,0.18)',
  },

  chipText: {
    fontSize: 12,
    color: 'rgba(224,242,254,0.88)',
    fontFamily: 'GillSans-Light',
    textTransform: 'lowercase',
  },
});

const strip = StyleSheet.create({
  wrap: { marginTop: 2 },
  row: {
    flexDirection: 'row', gap: 2,
    height: 18,
    marginBottom: 6,
  },
  cell: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: 'rgba(9,41,173,0.10)',
  },
  cell0: { backgroundColor: 'rgba(9,41,173,0.10)' },
  cell1: { backgroundColor: 'rgba(152,212,250,0.30)' },
  cell2: { backgroundColor: 'rgba(152,212,250,0.55)' },
  cell3: { backgroundColor: 'rgba(152,212,250,0.85)' },
  legend: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  legendText: {
    fontSize: 9, letterSpacing: 0.3,
    color: 'rgba(152,212,250,0.50)',
    fontFamily: 'GillSans-Light',
    textTransform: 'uppercase',
  },
});
