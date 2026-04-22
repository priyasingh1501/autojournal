import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export interface TodayCardData {
  entryCount: number;
  dominantEmotions: string[];
  yesterdayEmotions: string[];
  intentionsMentioned: Array<{ id: string; text: string; shortLabel: string; category: string }>;
  activeIntentions: Array<{ id: string; text: string; shortLabel: string; category: string }>;
  lastEntryAt: number | null;
}

interface Props {
  data: TodayCardData | null;
}

const { height: SCREEN_H } = Dimensions.get('window');

function entryLabel(n: number): string {
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

  if (data.entryCount === 0) {
    return (
      <View style={s.card}>
        <View style={s.inner}>

          {data.activeIntentions.length > 0 && (
            <View style={s.block}>
              <Text style={s.nudgeText}>Did you touch on any of your intentions?</Text>
              {data.activeIntentions.map(i => (
                <View key={i.id} style={s.intentionRow}>
                  <Feather name="target" size={11} color="rgba(152,212,250,0.35)" />
                  <Text style={[s.intentionText, s.intentionTextDim]} numberOfLines={1}>{i.text}</Text>
                </View>
              ))}
            </View>
          )}

        </View>
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.inner}>

        <View style={s.topRow}>
          <Animated.Text style={[s.countText, { transform: [{ scale: countScale }] }]}>
            {entryLabel(data.entryCount)}
          </Animated.Text>
          {!!timeStr && <Text style={s.timeText}>{timeStr}</Text>}
        </View>

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

        {data.intentionsMentioned.length > 0 && (
          <View style={s.block}>
            <Text style={s.blockLabel}>INTENTIONS TOUCHED</Text>
            {data.intentionsMentioned.map(i => (
              <View key={i.id} style={s.intentionRow}>
                <Feather name="target" size={11} color="rgba(152,212,250,0.65)" />
                <Text style={s.intentionText} numberOfLines={1}>{i.text}</Text>
              </View>
            ))}
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

  divider: {
    height: 1,
    backgroundColor: 'rgba(152,212,250,0.10)',
  },

  // ── Empty state ──────────────────────────────────────────────────────────────

  emptyHeading: {
    fontSize: 17,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.88)',
    letterSpacing: -0.2,
  },

  yesterdayLabel: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.55)',
  },

  yesterdayEmotions: {
    color: 'rgba(224,242,254,0.65)',
  },

  nudgeText: {
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.60)',
    letterSpacing: 0.1,
    marginBottom: 2,
  },

  // ── Active state ─────────────────────────────────────────────────────────────

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

  intentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 3,
  },

  intentionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(224,242,254,0.85)',
    fontFamily: 'GillSans-Light',
  },

  intentionTextDim: {
    color: 'rgba(224,242,254,0.50)',
  },
});
