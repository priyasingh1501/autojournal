import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

export const SECTION_LABELS: Record<string, { iconName: string; color: string }> = {
  'Emotional check-in': { iconName: 'activity',     color: 'rgba(224, 242, 254, 0.90)' },
  'Meals':              { iconName: 'coffee',        color: 'rgba(224, 242, 254, 0.90)' },
  'Movement':           { iconName: 'zap',           color: 'rgba(224, 242, 254, 0.90)' },
  'Meditation':         { iconName: 'moon',          color: 'rgba(196, 181, 253, 0.90)' },
  'Spending':           { iconName: 'credit-card',   color: 'rgba(224, 242, 254, 0.90)' },
  'Recurring thoughts': { iconName: 'repeat',        color: 'rgba(224, 242, 254, 0.90)' },
  'Learnings':          { iconName: 'book-open',     color: 'rgba(224, 242, 254, 0.90)' },
};

export function renderInsightSections(text: string): React.ReactNode {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const headingKey = Object.keys(SECTION_LABELS).find(
      k => line.toLowerCase().startsWith(k.toLowerCase()),
    );

    if (headingKey) {
      const meta = SECTION_LABELS[headingKey];
      const bodyLines: string[] = [];
      i++;
      while (
        i < lines.length &&
        !Object.keys(SECTION_LABELS).some(k =>
          lines[i].toLowerCase().startsWith(k.toLowerCase()),
        )
      ) {
        bodyLines.push(lines[i]);
        i++;
      }
      const inlineBody = line.replace(new RegExp(`^${headingKey}:?\\s*`, 'i'), '').trim();
      const body = inlineBody
        ? [inlineBody, ...bodyLines].join(' ')
        : bodyLines.join(' ');

      nodes.push(
        <View key={headingKey} style={sectionStyles.card}>
          <View style={sectionStyles.headingRow}>
            <Feather name={meta.iconName as any} size={12} color={meta.color} />
            <Text style={[sectionStyles.heading, { color: meta.color }]}>{'  '}{headingKey}</Text>
          </View>
          {body.length > 0 && (
            <Text style={sectionStyles.body}>{body}</Text>
          )}
        </View>,
      );
    } else {
      nodes.push(
        <Text key={`orphan-${i}`} style={sectionStyles.body}>{line}</Text>,
      );
      i++;
    }
  }

  return <View style={sectionStyles.wrapper}>{nodes}</View>;
}

const sectionStyles = StyleSheet.create({
  wrapper: { gap: 10 },
  card: {
    backgroundColor: 'rgba(152, 212, 250, 0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.10)',
    padding: 14,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  heading: { fontSize: 13, fontWeight: '500', letterSpacing: 0.2, fontFamily: 'Baskerville' },
  body: { fontSize: 14, color: 'rgba(224, 242, 254, 0.75)', lineHeight: 22, fontFamily: 'GillSans-Light' },
});
