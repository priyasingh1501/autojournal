import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface Props {
  onPerspective: () => void;
}

export default function SecondaryActions({ onPerspective }: Props) {
  return (
    <TouchableOpacity onPress={onPerspective} style={s.card} activeOpacity={0.75}>
      <View style={s.body}>
        <Text style={s.heading}>Get a new perspective</Text>
        <Text style={s.sub}>Call or chat with a mind for a fresh take on what's on your mind.</Text>
      </View>
      <Feather name="chevron-right" size={16} color="rgba(152,212,250,0.35)" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(2,6,14,0.90)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.16)',
    paddingVertical: 16,
    paddingHorizontal: 18,
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
});
