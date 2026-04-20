import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PatternsReport } from '../../types';
import { EMOTION_COLORS } from '../../constants/colors';

// ── pill palette (rotates by index) ──────────────────────────────────────────

const PILL_PALETTE = [
  { bg: 'rgba(127, 119, 221, 0.15)', text: 'rgba(167, 157, 255, 0.85)' }, // purple
  { bg: 'rgba(93, 202, 165, 0.15)',  text: 'rgba(93, 202, 165, 0.85)'  }, // teal
  { bg: 'rgba(212, 83, 126, 0.15)',  text: 'rgba(220, 120, 165, 0.85)' }, // pink
  { bg: 'rgba(239, 159, 39, 0.15)',  text: 'rgba(239, 159, 39, 0.85)'  }, // amber
  { bg: 'rgba(55, 138, 221, 0.15)',  text: 'rgba(107, 168, 235, 0.85)' }, // blue
];

// ── emotion color resolution ──────────────────────────────────────────────────

function emotionColor(emotion: string): string {
  const lower = emotion.toLowerCase();
  for (const [key, color] of Object.entries(EMOTION_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return 'rgba(152, 212, 250, 0.55)';
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  tm: PatternsReport['thisMonth'];
}

const FALLBACK_WEEKS = [1, 2, 3, 4];
const FALLBACK_COLOR = 'rgba(152, 212, 250, 0.18)';

export default function ThisMonthCard({ tm }: Props) {
  const hasThemes     = tm.whatsLoud && tm.whatsLoud.length > 0;
  const hasIntentions = tm.intentionsProgress && tm.intentionsProgress.length > 0;

  if (!hasThemes && !hasIntentions && !tm.emotionalArc) return null;

  // Build the 4 week slots — use arc data when available, placeholder otherwise
  const weekSlots = FALLBACK_WEEKS.map(n => {
    const arcEntry = tm.emotionalArc?.find(w => w.week === n);
    return {
      week: n,
      color: arcEntry ? emotionColor(arcEntry.dominantEmotion) : FALLBACK_COLOR,
    };
  });

  return (
    <View style={s.wrap}>
      <Text style={s.sectionLabel}>THIS MONTH</Text>

      {/* Theme pills */}
      {hasThemes && (
        <View style={s.pillsCol}>
          {tm.whatsLoud!.map((theme, i) => (
            <View key={`${theme}-${i}`} style={s.pill}>
              <Text style={s.pillText}>{theme}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Week bars — always shown */}
      <View style={s.barsRow}>
        {weekSlots.map(({ week, color }) => (
          <View key={week} style={s.barCol}>
            <View style={s.barTrack}>
              <View style={[s.bar, { backgroundColor: color }]} />
            </View>
            <Text style={s.barWeekLabel}>W{week}</Text>
          </View>
        ))}
      </View>

      {/* Intentions progress pills */}
      {hasIntentions && (
        <View style={s.intentionsRow}>
          {tm.intentionsProgress!.slice(0, 4).map((ip, i) => {
            const colors = PILL_PALETTE[i % PILL_PALETTE.length];
            return (
              <View key={i} style={[s.intentionPill, { backgroundColor: colors.bg }]}>
                <Text style={[s.intentionPillText, { color: colors.text }]} numberOfLines={1}>
                  {ip.intention}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(3, 18, 40, 0.72)',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(152, 212, 250, 0.13)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: 'rgba(152, 212, 250, 0.50)',
    fontFamily: 'GillSans-Light',
    marginBottom: 10,
  },

  // theme pills
  pillsCol: {
    flexDirection: 'column',
    gap: 6,
    marginBottom: 4,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(152, 212, 250, 0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(152, 212, 250, 0.18)',
    alignSelf: 'flex-start',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.75)',
  },

  // week bars
  barsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
    alignItems: 'flex-end',
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barTrack: {
    width: '100%',
    height: 24,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    height: 20,
    borderRadius: 3,
    opacity: 0.80,
  },
  barWeekLabel: {
    fontSize: 9,
    color: 'rgba(152, 212, 250, 0.45)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
  },

  // intentions
  intentionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  intentionPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    maxWidth: 140,
  },
  intentionPillText: {
    fontSize: 11,
    fontFamily: 'GillSans-Light',
  },
});
