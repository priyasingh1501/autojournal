import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PatternsReport } from '../../types';

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  tm: PatternsReport['thisMonth'];
}

const FALLBACK_WEEKS = [1, 2, 3, 4];

export default function ThisMonthCard({ tm }: Props) {
  const hasReflection = !!tm.reflection && tm.reflection.trim().length > 0;
  const hasThemes     = tm.whatsLoud && tm.whatsLoud.length > 0;
  const hasArc        = !!tm.emotionalArc && tm.emotionalArc.length > 0;
  const hasIntentions = tm.intentionsProgress && tm.intentionsProgress.length > 0;

  if (!hasReflection && !hasThemes && !hasArc && !hasIntentions) return null;

  const weekSlots = FALLBACK_WEEKS.map(n => {
    const match = tm.emotionalArc?.find(w => w.week === n);
    return {
      week: n,
      active: !!match,
      emotion: match?.dominantEmotion ?? '',
    };
  });

  return (
    <View style={s.wrap}>
      <Text style={s.sectionLabel}>THIS MONTH</Text>

      {/* Reflection prose */}
      {hasReflection && (
        <Text style={s.reflection}>{tm.reflection.trim()}</Text>
      )}

      {/* Emotional arc (week bars) */}
      {hasArc && (
        <View style={s.arcBlock}>
          <Text style={s.subLabel}>Emotional arc</Text>
          <View style={s.barsRow}>
            {weekSlots.map(({ week, active, emotion }) => (
              <View key={week} style={s.barCol}>
                <View style={s.barTrack}>
                  <View style={[s.bar, active && s.barActive]} />
                </View>
                <Text style={s.barWeekLabel}>W{week}</Text>
                {active && emotion ? (
                  <Text style={s.barEmotionLabel} numberOfLines={1}>{emotion}</Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Intentions — all active intentions, each with mention count + note */}
      {hasIntentions && (
        <View style={s.intentionsBlock}>
          <Text style={s.subLabel}>Intentions</Text>
          {tm.intentionsProgress!.map((ip, i) => (
            <View key={i} style={s.intentionRow}>
              <View style={s.intentionHeader}>
                <Text style={s.intentionText} numberOfLines={2}>{ip.intention}</Text>
                <Text style={s.intentionMentions}>
                  {ip.mentions === 0
                    ? 'not touched'
                    : `${ip.mentions}× last 4 wks`}
                </Text>
              </View>
              {ip.note ? (
                <Text style={s.intentionNote}>{ip.note}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {/* Recurring themes — where your focus has kept returning this month */}
      {hasThemes && (
        <View style={s.themesBlock}>
          <Text style={s.subLabel}>Recurring themes</Text>
          {tm.whatsLoud!.map((theme, i) => (
            <Text key={`${theme}-${i}`} style={s.themeLine}>
              {theme}
            </Text>
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
  subLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.0,
    color: 'rgba(152, 212, 250, 0.45)',
    fontFamily: 'GillSans-Light',
    marginBottom: 8,
    textTransform: 'uppercase',
  },

  // reflection prose
  reflection: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(224, 242, 254, 0.82)',
    fontFamily: 'GillSans-Light',
    marginBottom: 14,
  },

  // emotional arc
  arcBlock: {
    marginTop: 4,
    marginBottom: 14,
  },
  barsRow: {
    flexDirection: 'row',
    gap: 6,
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
  barEmotionLabel: {
    fontSize: 10,
    color: 'rgba(224, 242, 254, 0.72)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
    marginTop: 1,
  },

  // intentions
  intentionsBlock: {
    marginTop: 4,
    marginBottom: 14,
  },
  intentionRow: {
    marginBottom: 10,
  },
  intentionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  intentionText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.90)',
  },
  intentionMentions: {
    fontSize: 10,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.55)',
    letterSpacing: 0.3,
  },
  intentionNote: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.62)',
    marginTop: 3,
  },

  // recurring themes
  themesBlock: {
    marginTop: 4,
  },
  themeLine: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.78)',
    marginBottom: 8,
  },
});
