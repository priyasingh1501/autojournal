import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

export const SECTION_LABELS: Record<string, { iconName: string; color: string }> = {
  'Emotional check-in': { iconName: 'activity',     color: '#48cae4' },
  'Meals':              { iconName: 'coffee',        color: '#06d6a0' },
  'Movement':           { iconName: 'zap',           color: '#f4a261' },
  'Spending':           { iconName: 'credit-card',   color: '#00b4d8' },
  'Recurring thoughts': { iconName: 'repeat',        color: '#90e0ef' },
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
        <View key={headingKey} style={sectionStyles.section}>
          <View style={sectionStyles.headingRow}>
            <Feather name={meta.iconName as any} size={12} color={meta.color} />
            <Text style={[sectionStyles.heading, { color: meta.color }]}>  {headingKey}</Text>
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
  wrapper: { marginBottom: 4 },
  section: { marginBottom: 14 },
  headingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  heading: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2, fontFamily: 'Avenir' },
  body: { fontSize: 14, color: 'rgba(147, 210, 232, 0.75)', lineHeight: 22, fontFamily: 'Avenir' },
});
