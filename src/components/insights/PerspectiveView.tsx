import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Mind, MindPerspective } from '../../types';

interface Props {
  mind: Mind;
  perspective: MindPerspective;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onJumpToDate: (date: string) => void;
}

export default function PerspectiveView({
  mind, perspective, onBack, onRefresh, refreshing, onJumpToDate,
}: Props) {
  const accentBg     = mind.accent.replace(/[\d.]+\)$/, '0.08)');
  const accentBorder = mind.accent.replace(/[\d.]+\)$/, '0.22)');

  return (
    <View>
      {/* Back + refresh header */}
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.75}>
          <Feather name="arrow-left" size={14} color="rgba(152,212,250,0.70)" />
          <Text style={styles.backLabel}>All minds</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={onRefresh}
          disabled={refreshing}
          activeOpacity={0.75}
        >
          <Feather name="refresh-cw" size={13} color="rgba(152,212,250,0.55)" />
        </TouchableOpacity>
      </View>

      {/* Mind identity */}
      <View style={[styles.identityCard, { backgroundColor: accentBg, borderColor: accentBorder }]}>
        <Text style={styles.symbol}>{mind.symbol}</Text>
        <View style={styles.identityText}>
          <Text style={[styles.mindName, { color: mind.accent }]}>{mind.name}</Text>
          <Text style={styles.mindEra}>{mind.era}</Text>
        </View>
      </View>

      {/* Framing */}
      {!!perspective.framing && (
        <Text style={styles.framing}>"{perspective.framing}"</Text>
      )}

      {/* Highlights */}
      <View style={styles.highlights}>
        {perspective.highlights.map((h, i) => (
          <View key={i} style={[styles.highlightCard, { borderLeftColor: mind.accent.replace(/[\d.]+\)$/, '0.60)') }]}>
            {/* Passage */}
            <View style={styles.passageWrap}>
              <Feather name="bookmark" size={11} color={mind.accent.replace(/[\d.]+\)$/, '0.60)')} style={{ marginTop: 2 }} />
              <Text style={styles.passage}>"{h.passage}"</Text>
            </View>

            {/* Comment */}
            <Text style={styles.comment}>{h.comment}</Text>

            {/* Source date */}
            <TouchableOpacity
              style={styles.dateBadge}
              onPress={() => onJumpToDate(h.date)}
              activeOpacity={0.75}
            >
              <Feather name="calendar" size={10} color="rgba(152,212,250,0.45)" />
              <Text style={styles.dateText}>{h.date}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <Text style={styles.footer}>
        Based on your last {perspective.entryWindowDays} journal entries
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.18)',
    backgroundColor: 'rgba(152,212,250,0.05)',
  },
  backLabel: { fontSize: 13, color: 'rgba(152,212,250,0.70)', fontFamily: 'GillSans-Light' },
  refreshBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.18)',
    backgroundColor: 'rgba(152,212,250,0.05)',
  },

  identityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 18,
  },
  symbol: { fontSize: 30 },
  identityText: { flex: 1 },
  mindName: { fontSize: 18, fontFamily: 'Baskerville', fontWeight: '500' },
  mindEra: { fontSize: 11, color: 'rgba(152,212,250,0.55)', fontFamily: 'GillSans-Light', marginTop: 2 },

  framing: {
    fontSize: 15,
    fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.75)',
    lineHeight: 24,
    fontStyle: 'italic',
    marginBottom: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  highlights: { gap: 16, marginBottom: 12 },
  highlightCard: {
    backgroundColor: 'rgba(152,212,250,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.10)',
    borderLeftWidth: 3,
    padding: 16,
    gap: 12,
  },
  passageWrap: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
  },
  passage: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.85)',
    lineHeight: 21,
    fontStyle: 'italic',
  },
  comment: {
    fontSize: 14,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.72)',
    lineHeight: 22,
  },
  dateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.15)',
    backgroundColor: 'rgba(152,212,250,0.06)',
  },
  dateText: { fontSize: 11, color: 'rgba(152,212,250,0.50)', fontFamily: 'GillSans-Light' },

  footer: {
    fontSize: 11, color: 'rgba(152,212,250,0.35)',
    fontFamily: 'GillSans-Light', textAlign: 'center', marginTop: 8,
  },
});
