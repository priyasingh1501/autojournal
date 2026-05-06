import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SuggestedIntention } from '../../types';

interface Props {
  suggestion: SuggestedIntention | null;
  onAccept: (s: SuggestedIntention) => void;
  onDismiss: (s: SuggestedIntention) => void;
}

export default function IntentionsCard({ suggestion, onAccept, onDismiss }: Props) {
  if (!suggestion) return null;

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Feather name="target" size={12} color="rgba(152,212,250,0.70)" />
        <Text style={s.label}>INTENTION DETECTED</Text>
      </View>
      <Text style={s.text}>"{suggestion.text}"</Text>
      <View style={s.actions}>
        <TouchableOpacity style={s.dismissBtn} onPress={() => onDismiss(suggestion)} activeOpacity={0.75}>
          <Text style={s.dismissText}>Not quite</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.acceptBtn} onPress={() => onAccept(suggestion)} activeOpacity={0.75}>
          <Text style={s.acceptText}>Track it</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(2,6,14,0.90)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.18)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  label: {
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: '500',
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
  },

  text: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(224,242,254,0.88)',
    fontFamily: 'GillSans-Light',
  },

  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },

  dismissBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.20)',
    alignItems: 'center',
  },

  dismissText: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
  },

  acceptBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(9,41,173,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.28)',
    alignItems: 'center',
  },

  acceptText: {
    fontSize: 13,
    color: 'rgba(224,242,254,0.92)',
    fontFamily: 'GillSans-Light',
  },
});
