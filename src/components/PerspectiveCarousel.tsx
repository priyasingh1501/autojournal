/**
 * PerspectiveCarousel — horizontal chip strip of perspective prompts.
 *
 * Each chip represents a topic the user might usefully talk through — a
 * decision, a conflict, a loaded emotion, an unresolved question, something
 * they're avoiding, or a tension between stated values and actions.
 *
 * Tapping a chip fires `onTap(prompt)` — the caller wires this to open the
 * curated-mind picker seeded with the topic, so the opening line can
 * reference the specific thing rather than the day in general.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { PerspectivePromptCategory } from '../types';
import type { ResolvedPerspectivePrompt } from '../services/PerspectivePromptsService';

type ChipPrompt = ResolvedPerspectivePrompt | {
  topic: string;
  category: PerspectivePromptCategory;
  why?: string;
};

interface Props {
  prompts: ChipPrompt[];
  onTap: (prompt: ChipPrompt) => void;
  /** Header label above the chip row. Omit to render chips only. */
  label?: string;
}

// Category → Feather icon name. Picks visual cues that hint at the shape of
// the topic (question mark for unresolved wondering, flame for conflict, etc).
const CATEGORY_ICON: Record<PerspectivePromptCategory, keyof typeof Feather.glyphMap> = {
  decision:       'git-branch',
  conflict:       'alert-triangle',
  loaded_emotion: 'cloud-rain',
  question:       'help-circle',
  avoidance:      'clock',
  values_tension: 'compass',
};

export default function PerspectiveCarousel({ prompts, onTap, label }: Props) {
  if (prompts.length === 0) return null;

  return (
    <View style={s.wrap}>
      {label && <Text style={s.label}>{label}</Text>}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.row}
      >
        {prompts.map((p, i) => (
          <TouchableOpacity
            key={`${p.topic}-${i}`}
            style={s.chip}
            onPress={() => onTap(p)}
            activeOpacity={0.78}
          >
            <Feather
              name={CATEGORY_ICON[p.category]}
              size={12}
              color="rgba(152,212,250,0.75)"
            />
            <Text style={s.chipText} numberOfLines={1}>
              {p.topic}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.0,
    fontWeight: '500',
    color: 'rgba(152,212,250,0.50)',
    fontFamily: 'GillSans-Light',
  },
  row: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 240,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.28)',
    backgroundColor: 'rgba(9,41,173,0.18)',
  },
  chipText: {
    flexShrink: 1,
    fontSize: 12,
    color: 'rgba(224,242,254,0.88)',
    fontFamily: 'GillSans-Light',
  },
});
