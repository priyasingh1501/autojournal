import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import PerspectiveCarousel from '../PerspectiveCarousel';
import type { ResolvedPerspectivePrompt } from '../../services/PerspectivePromptsService';

interface Props {
  /** Generic "open picker with no topic" tap. */
  onPerspective: () => void;
  /** Recent perspective prompts surfaced as chips. Empty = no carousel. */
  prompts?: ResolvedPerspectivePrompt[];
  /** Called when the user taps a specific chip. */
  onPromptTap?: (prompt: ResolvedPerspectivePrompt) => void;
}

export default function SecondaryActions({ onPerspective, prompts, onPromptTap }: Props) {
  const hasPrompts = !!(prompts && prompts.length > 0);

  return (
    <View style={s.card}>
      <TouchableOpacity
        onPress={onPerspective}
        style={s.header}
        activeOpacity={0.75}
      >
        <View style={s.body}>
          <Text style={s.heading}>Get a new perspective</Text>
          <Text style={s.sub}>
            {hasPrompts
              ? 'Pick a topic below, or tap through for the full picker.'
              : "Call or chat with a mind for a fresh take on what's on your mind."}
          </Text>
        </View>
        <Feather name="chevron-right" size={16} color="rgba(152,212,250,0.35)" />
      </TouchableOpacity>

      {hasPrompts && onPromptTap && (
        <View style={s.carouselWrap}>
          <PerspectiveCarousel
            prompts={prompts!}
            onTap={(p) => onPromptTap(p as ResolvedPerspectivePrompt)}
          />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(2,6,14,0.90)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.16)',
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  heading: {
    fontSize: 15,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.88)',
  },
  sub: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.55)',
  },
  carouselWrap: {
    marginTop: 2,
  },
});
