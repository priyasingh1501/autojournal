import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GrowthTipsAnalysis, GrowthTip } from '../../types';

const CATEGORY_CONFIG: Record<GrowthTip['category'], { color: string; bg: string; icon: string }> = {
  emotion:       { color: 'rgba(196,181,253,0.90)', bg: 'rgba(196,181,253,0.10)', icon: 'heart'        },
  habits:        { color: 'rgba(110,231,183,0.90)', bg: 'rgba(110,231,183,0.10)', icon: 'repeat'       },
  relationships: { color: 'rgba(251,191, 36,0.90)', bg: 'rgba(251,191, 36,0.10)', icon: 'users'        },
  mindset:       { color: 'rgba(152,212,250,0.90)', bg: 'rgba(152,212,250,0.10)', icon: 'compass'      },
  productivity:  { color: 'rgba(248,113,113,0.90)', bg: 'rgba(248,113,113,0.10)', icon: 'zap'          },
};

function TipCard({ tip }: { tip: GrowthTip }) {
  const cfg = CATEGORY_CONFIG[tip.category] ?? CATEGORY_CONFIG.mindset;
  return (
    <View style={[styles.card, { borderColor: cfg.color + '33' }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.categoryBadge, { backgroundColor: cfg.bg, borderColor: cfg.color + '44' }]}>
          <Feather name={cfg.icon as any} size={11} color={cfg.color} />
          <Text style={[styles.categoryLabel, { color: cfg.color }]}>
            {tip.category.charAt(0).toUpperCase() + tip.category.slice(1)}
          </Text>
        </View>
      </View>
      <Text style={styles.tipTitle}>{tip.title}</Text>
      <Text style={styles.tipBody}>{tip.body}</Text>
    </View>
  );
}

interface Props {
  data: GrowthTipsAnalysis;
  onRefresh: () => void;
  refreshing: boolean;
}

export default function GrowthTipsList({ data, onRefresh, refreshing }: Props) {
  return (
    <View>
      <Text style={styles.narrative}>{data.narrative}</Text>
      <View style={styles.list}>
        {data.tips.map(tip => (
          <TipCard key={tip.id} tip={tip} />
        ))}
      </View>
      <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} disabled={refreshing} activeOpacity={0.75}>
        <Feather name="refresh-cw" size={13} color="rgba(152,212,250,0.65)" />
        <Text style={styles.refreshLabel}>{refreshing ? 'Generating…' : 'Regenerate tips'}</Text>
      </TouchableOpacity>
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
  list: { gap: 12, marginBottom: 16 },
  card: {
    backgroundColor: 'rgba(152,212,250,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: { marginBottom: 10 },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  categoryLabel: { fontSize: 11, fontFamily: 'GillSans-Light', letterSpacing: 0.2 },
  tipTitle: {
    fontSize: 16,
    fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.95)',
    marginBottom: 8,
  },
  tipBody: {
    fontSize: 14,
    color: 'rgba(224,242,254,0.70)',
    lineHeight: 22,
    fontFamily: 'GillSans-Light',
  },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.18)',
    backgroundColor: 'rgba(152,212,250,0.05)',
  },
  refreshLabel: { fontSize: 13, color: 'rgba(152,212,250,0.65)', fontFamily: 'GillSans-Light' },
});
