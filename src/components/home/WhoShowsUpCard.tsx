/**
 * WhoShowsUpCard — renders the recurring_cast observation as a stack of
 * gradient-backed visual cards, one per person/role. Styled after the
 * WisdomShort aesthetic (full-bleed gradient, glass panel with text),
 * but without any image generation — cheap and always available.
 */

import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AcrossTimeObservation, RecurringCastRole } from '../../types';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - 32; // match horizontal padding used by siblings

// ── Gradient palette by role ──────────────────────────────────────────────────

const ROLE_GRADIENT: Record<RecurringCastRole, [string, string, string]> = {
  support:    ['#0f2a1e', '#1d4b35', '#081711'],
  friction:   ['#2a0f14', '#4b1d26', '#170710'],
  aspiration: ['#1e0f2a', '#352049', '#110818'],
  obligation: ['#2a2010', '#4b3a1d', '#171108'],
};

const ROLE_LABEL: Record<RecurringCastRole, string> = {
  support:    'support',
  friction:   'friction',
  aspiration: 'aspiration',
  obligation: 'obligation',
};

const ROLE_ACCENT: Record<RecurringCastRole, string> = {
  support:    'rgba(134, 239, 172, 0.85)',
  friction:   'rgba(248, 113, 113, 0.85)',
  aspiration: 'rgba(196, 181, 253, 0.85)',
  obligation: 'rgba(253, 186, 116, 0.85)',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  obs: AcrossTimeObservation;
}

export default function WhoShowsUpCard({ obs }: Props) {
  const people = obs.people ?? [];
  if (people.length === 0) return null;

  return (
    <View style={s.wrap}>
      <Text style={s.sectionLabel}>WHO SHOWS UP</Text>
      {people.map((p, i) => (
        <View key={`${p.name}-${i}`} style={s.card}>
          <LinearGradient
            colors={ROLE_GRADIENT[p.role]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.cardContent}>
            <View style={s.header}>
              <Text style={s.name} numberOfLines={1}>{p.name}</Text>
              <Text style={[s.roleTag, { color: ROLE_ACCENT[p.role] }]}>
                {ROLE_LABEL[p.role]}
              </Text>
            </View>
            <Text style={s.appearance}>{p.appearance}</Text>
            <Text style={s.mentions}>
              mentioned in {p.mentions} {p.mentions === 1 ? 'entry' : 'entries'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrap: {
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: 'rgba(152, 212, 250, 0.50)',
    fontFamily: 'GillSans-Light',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  card: {
    width: CARD_W,
    minHeight: 110,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.14)',
    marginBottom: 10,
    justifyContent: 'flex-end',
  },
  cardContent: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(2, 6, 14, 0.55)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'GillSans-Light',
  },
  roleTag: {
    fontSize: 10,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    fontFamily: 'GillSans-Light',
  },
  appearance: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.80)',
  },
  mentions: {
    fontSize: 10,
    letterSpacing: 0.5,
    color: 'rgba(152, 212, 250, 0.55)',
    fontFamily: 'GillSans-Light',
    marginTop: 6,
  },
});
