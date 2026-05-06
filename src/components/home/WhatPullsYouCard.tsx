/**
 * WhatPullsYouCard — renders the whats_pulling_you observation as two
 * stacked sections (Toward, then Away), each listing short-phrase items
 * with a detail sentence and mention count. Full-width rows for
 * readability; colored accent line distinguishes toward from away.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AcrossTimeObservation, PullItem } from '../../types';

const TOWARD_ACCENT = 'rgba(134, 239, 172, 0.85)';
const AWAY_ACCENT   = 'rgba(248, 113, 113, 0.85)';

interface Props {
  obs: AcrossTimeObservation;
}

export default function WhatPullsYouCard({ obs }: Props) {
  const toward = obs.toward ?? [];
  const away   = obs.away ?? [];
  if (toward.length === 0 && away.length === 0) return null;

  return (
    <View style={s.wrap}>
      <Text style={s.sectionLabel}>WHAT PULLS YOU</Text>

      {toward.length > 0 && (
        <View style={s.block}>
          <Text style={[s.blockLabel, { color: TOWARD_ACCENT }]}>Toward</Text>
          {toward.map((item, i) => (
            <PullRow key={`toward-${i}`} item={item} accent={TOWARD_ACCENT} />
          ))}
        </View>
      )}

      {away.length > 0 && (
        <View style={s.block}>
          <Text style={[s.blockLabel, { color: AWAY_ACCENT }]}>Away from</Text>
          {away.map((item, i) => (
            <PullRow key={`away-${i}`} item={item} accent={AWAY_ACCENT} />
          ))}
        </View>
      )}
    </View>
  );
}

function PullRow({ item, accent }: { item: PullItem; accent: string }) {
  return (
    <View style={s.row}>
      <View style={[s.accentBar, { backgroundColor: accent }]} />
      <View style={s.rowContent}>
        <Text style={s.theme}>{item.theme}</Text>
        <Text style={s.detail}>{item.detail}</Text>
        <Text style={s.mentions}>
          mentioned in {item.mentions} {item.mentions === 1 ? 'entry' : 'entries'}
        </Text>
      </View>
    </View>
  );
}

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
    marginBottom: 12,
  },
  block: {
    marginBottom: 6,
  },
  blockLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    fontFamily: 'GillSans-Light',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  accentBar: {
    width: 2,
    borderRadius: 1,
    marginRight: 10,
  },
  rowContent: {
    flex: 1,
  },
  theme: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.92)',
    marginBottom: 3,
  },
  detail: {
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(224, 242, 254, 0.78)',
    fontFamily: 'GillSans-Light',
  },
  mentions: {
    fontSize: 10,
    letterSpacing: 0.3,
    color: 'rgba(152, 212, 250, 0.50)',
    fontFamily: 'GillSans-Light',
    marginTop: 4,
  },
});
