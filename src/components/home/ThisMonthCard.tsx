import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PatternsReport } from '../../types';

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  tm: PatternsReport['thisMonth'];
}

const FALLBACK_WEEKS = [1, 2, 3, 4];

export default function ThisMonthCard({ tm }: Props) {
  const hasThemes     = tm.whatsLoud && tm.whatsLoud.length > 0;
  const hasIntentions = tm.intentionsProgress && tm.intentionsProgress.length > 0;

  if (!hasThemes && !hasIntentions && !tm.emotionalArc) return null;

  const weekSlots = FALLBACK_WEEKS.map(n => ({
    week: n,
    active: !!tm.emotionalArc?.find(w => w.week === n),
  }));

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

      {/* Week bars */}
      <View style={s.barsRow}>
        {weekSlots.map(({ week, active }) => (
          <View key={week} style={s.barCol}>
            <View style={s.barTrack}>
              <View style={[s.bar, active && s.barActive]} />
            </View>
            <Text style={s.barWeekLabel}>W{week}</Text>
          </View>
        ))}
      </View>

      {/* Intentions progress pills */}
      {hasIntentions && (
        <View style={s.intentionsRow}>
          {tm.intentionsProgress!.slice(0, 4).map((ip, i) => (
            <View key={i} style={s.intentionPill}>
              <Text style={s.intentionPillText} numberOfLines={1}>
                {ip.intention}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(2, 6, 14, 0.90)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
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
    borderWidth: 1,
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
    height: 20,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    height: 20,
    borderRadius: 3,
    backgroundColor: 'rgba(152, 212, 250, 0.12)',
  },
  barActive: {
    backgroundColor: 'rgba(152, 212, 250, 0.28)',
  },
  barWeekLabel: {
    fontSize: 9,
    color: 'rgba(152, 212, 250, 0.40)',
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
    backgroundColor: 'rgba(152, 212, 250, 0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(152, 212, 250, 0.18)',
  },
  intentionPillText: {
    fontSize: 11,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.70)',
  },
});
