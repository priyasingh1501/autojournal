import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Mind } from '../../types';

interface Props {
  mind: Mind;
  onPress: () => void;
  loading?: boolean;
}

export default function MindCard({ mind, onPress, loading }: Props) {
  const bg   = mind.accent.replace(/[\d.]+\)$/, '0.08)');
  const border = mind.accent.replace(/[\d.]+\)$/, '0.25)');

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: bg, borderColor: border }]}
      onPress={onPress}
      activeOpacity={0.75}
      disabled={loading}
    >
      <Text style={styles.symbol}>{mind.symbol}</Text>
      <Text style={[styles.name, { color: mind.accent }]}>{mind.name}</Text>
      <Text style={styles.era}>{mind.era}</Text>
      <Text style={styles.philosophy} numberOfLines={2}>{mind.philosophy}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    minHeight: 140,
    gap: 5,
  },
  symbol: { fontSize: 26, marginBottom: 2 },
  name: {
    fontSize: 14,
    fontFamily: 'Baskerville',
    fontWeight: '500',
    lineHeight: 20,
  },
  era: {
    fontSize: 10,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.50)',
    lineHeight: 14,
  },
  philosophy: {
    fontSize: 11,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.60)',
    lineHeight: 16,
    marginTop: 2,
  },
});
