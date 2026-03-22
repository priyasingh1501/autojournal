import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, LayoutAnimation,
  Platform, UIManager,
} from 'react-native';
import { PersonalityAnalysis, BigFiveScores } from '../../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TRAITS: { key: keyof BigFiveScores; label: string; low: string; high: string }[] = [
  { key: 'openness',          label: 'Openness',          low: 'Conventional',  high: 'Inventive'   },
  { key: 'conscientiousness', label: 'Conscientiousness', low: 'Flexible',      high: 'Disciplined' },
  { key: 'extraversion',      label: 'Extraversion',      low: 'Introverted',   high: 'Extraverted' },
  { key: 'agreeableness',     label: 'Agreeableness',     low: 'Competitive',   high: 'Cooperative' },
  { key: 'neuroticism',       label: 'Neuroticism',       low: 'Resilient',     high: 'Sensitive'   },
];

function barColor(score: number): string {
  if (score >= 65) return 'rgba(152,212,250,0.90)';
  if (score >= 40) return 'rgba(152,212,250,0.55)';
  return 'rgba(152,212,250,0.30)';
}

function TraitRow({
  trait,
  score,
  narrative,
}: {
  trait: { key: keyof BigFiveScores; label: string; low: string; high: string };
  score: number;
  narrative: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(e => !e);
  };

  return (
    <TouchableOpacity style={styles.traitRow} onPress={toggle} activeOpacity={0.8}>
      <View style={styles.traitHeader}>
        <Text style={styles.traitLabel}>{trait.label}</Text>
        <Text style={styles.traitScore}>{score}</Text>
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${score}%`, backgroundColor: barColor(score) }]} />
        {/* Midpoint marker */}
        <View style={styles.midMarker} />
      </View>

      <View style={styles.traitScale}>
        <Text style={styles.scaleLabel}>{trait.low}</Text>
        <Text style={styles.scaleLabel}>{trait.high}</Text>
      </View>

      {expanded && narrative ? (
        <Text style={styles.traitNarrative}>{narrative}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

interface Props {
  data: PersonalityAnalysis;
}

export default function PersonalityRadar({ data }: Props) {
  const { scores, narrative, traitNarratives } = data;

  return (
    <View>
      <Text style={styles.narrative}>{narrative}</Text>

      <View style={styles.traits}>
        {TRAITS.map(t => (
          <TraitRow
            key={t.key}
            trait={t}
            score={scores[t.key]}
            narrative={traitNarratives?.[t.key] ?? ''}
          />
        ))}
      </View>

      <Text style={styles.footer}>
        Based on {data.windowDays} days of journal entries · tap a trait to learn more
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  narrative: {
    fontSize: 14,
    color: 'rgba(224,242,254,0.80)',
    lineHeight: 22,
    fontFamily: 'GillSans-Light',
    marginBottom: 20,
  },
  traits: { gap: 16, marginBottom: 12 },
  traitRow: {
    backgroundColor: 'rgba(152,212,250,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.10)',
    padding: 14,
  },
  traitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  traitLabel: {
    fontSize: 14,
    fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.90)',
  },
  traitScore: {
    fontSize: 20,
    fontFamily: 'Baskerville',
    color: 'rgba(152,212,250,0.85)',
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(152,212,250,0.10)',
    overflow: 'visible',
    position: 'relative',
    marginBottom: 6,
  },
  barFill: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    borderRadius: 3,
  },
  midMarker: {
    position: 'absolute',
    left: '50%',
    top: -3,
    width: 2,
    height: 12,
    borderRadius: 1,
    backgroundColor: 'rgba(152,212,250,0.25)',
  },
  traitScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleLabel: {
    fontSize: 10,
    color: 'rgba(152,212,250,0.40)',
    fontFamily: 'GillSans-Light',
  },
  traitNarrative: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152,212,250,0.08)',
    fontSize: 13,
    color: 'rgba(224,242,254,0.70)',
    lineHeight: 20,
    fontFamily: 'GillSans-Light',
    fontStyle: 'italic',
  },
  footer: {
    fontSize: 11,
    color: 'rgba(152,212,250,0.40)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
    marginTop: 4,
  },
});
