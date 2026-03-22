import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

type Timeframe = 30 | 90 | 180;

interface Props {
  selected: Timeframe;
  onChange: (v: Timeframe) => void;
}

const OPTIONS: { value: Timeframe; label: string }[] = [
  { value: 30,  label: '30 days' },
  { value: 90,  label: '3 months' },
  { value: 180, label: '6 months' },
];

export default function TimeframeSelector({ selected, onChange }: Props) {
  return (
    <View style={styles.row}>
      {OPTIONS.map(o => (
        <TouchableOpacity
          key={o.value}
          style={[styles.pill, selected === o.value && styles.pillActive]}
          onPress={() => onChange(o.value)}
          activeOpacity={0.75}
        >
          <Text style={[styles.label, selected === o.value && styles.labelActive]}>
            {o.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
    backgroundColor: 'rgba(152, 212, 250, 0.05)',
  },
  pillActive: {
    backgroundColor: 'rgba(152, 212, 250, 0.18)',
    borderColor: 'rgba(152, 212, 250, 0.45)',
  },
  label: {
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.55)',
    letterSpacing: 0.2,
  },
  labelActive: { color: 'rgba(224, 242, 254, 0.95)' },
});
