/**
 * IntentionsScreen — list of active intentions with passive tracking
 * (mention sparkline, last-mentioned) and an opt-in commitment layer
 * (cadence + manual check-ins, "on track this week" signal).
 *
 * Two visual densities per row:
 *   • Plain intention  → sparkline + Commit button
 *   • Committed        → sparkline + cadence + check-in button + on-track pill
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

import {
  getActive,
  getWeekKey,
  promoteToCommitment,
  demoteFromCommitment,
  recordCheckIn,
  markReleased,
} from '../services/IntentionsService';
import { Intention, IntentionCadence } from '../types';
import CommitPromptModal from '../components/CommitPromptModal';

type Cadence = Exclude<IntentionCadence, null>;

const DAY_MS = 86_400_000;

function formatLastMentioned(ts: number | null): string {
  if (!ts) return 'not yet mentioned';
  const days = Math.floor((Date.now() - ts) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function buildSparkBars(weeklyMentionCounts: Array<{ weekKey: string; count: number }>): number[] {
  const map = new Map(weeklyMentionCounts.map(w => [w.weekKey, w.count]));
  const now = Date.now();
  const bars: number[] = [];
  for (let i = 11; i >= 0; i--) {
    const weekTs = now - i * 7 * DAY_MS;
    bars.push(map.get(getWeekKey(weekTs)) ?? 0);
  }
  return bars;
}

function checkInsThisWeek(intention: Intention): number {
  const weekKey = getWeekKey(Date.now());
  return (intention.checkIns ?? []).filter(c => getWeekKey(c.timestamp) === weekKey).length;
}

function isOnTrackThisWeek(intention: Intention): boolean {
  if (!intention.cadence) return false;
  const checkIns = checkInsThisWeek(intention);
  // Also count auto-mentions for this week
  const weekKey = getWeekKey(Date.now());
  const mentions = intention.weeklyMentionCounts.find(w => w.weekKey === weekKey)?.count ?? 0;
  const total = checkIns + mentions;
  if (intention.cadence === 'daily')  return total >= 5;
  if (intention.cadence === 'weekly') return total >= 1;
  return total >= 1; // 'loose' — any activity counts
}

// ── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <View style={s.sparkRow}>
      {counts.map((c, i) => {
        const h = c === 0 ? 2 : Math.max(3, Math.round((c / max) * 22));
        const opacity = c === 0 ? 0.20 : 0.55 + (c / max) * 0.40;
        return (
          <View
            key={i}
            style={[
              s.sparkBar,
              { height: h, backgroundColor: `rgba(152, 212, 250, ${opacity})` },
            ]}
          />
        );
      })}
    </View>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

interface RowProps {
  intention: Intention;
  onCommitTap:    (i: Intention) => void;
  onCheckInTap:   (i: Intention) => void;
  onMoreTap:      (i: Intention) => void;
}

function IntentionRow({ intention, onCommitTap, onCheckInTap, onMoreTap }: RowProps) {
  const isCommitted = intention.isCommitted === true;
  const bars = buildSparkBars(intention.weeklyMentionCounts ?? []);
  const lastMentioned = formatLastMentioned(intention.lastMentionedAt);
  const onTrack = isCommitted && isOnTrackThisWeek(intention);
  const checkInsWeek = checkInsThisWeek(intention);

  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={s.cardTitleCol}>
          {isCommitted && (
            <View style={s.committedBadge}>
              <Feather name="target" size={10} color="rgba(152,212,250,0.85)" />
              <Text style={s.committedBadgeText}>{intention.cadence ?? 'committed'}</Text>
            </View>
          )}
          <Text style={s.title} numberOfLines={2}>{intention.text}</Text>
        </View>
        <TouchableOpacity onPress={() => onMoreTap(intention)} style={s.moreBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="more-horizontal" size={16} color="rgba(152,212,250,0.45)" />
        </TouchableOpacity>
      </View>

      <View style={s.metaRow}>
        <Sparkline counts={bars} />
        <View style={s.metaCol}>
          <Text style={s.metaLine}>{intention.mentionCount}× mentioned</Text>
          <Text style={s.metaSub}>last {lastMentioned}</Text>
        </View>
      </View>

      {isCommitted ? (
        <View style={s.commitFooter}>
          <View style={[s.trackPill, onTrack ? s.trackPillOn : s.trackPillOff]}>
            <Text style={[s.trackPillText, onTrack ? s.trackPillTextOn : s.trackPillTextOff]}>
              {onTrack ? 'on track this week' : 'behind this week'}
            </Text>
          </View>
          <TouchableOpacity style={s.checkInBtn} onPress={() => onCheckInTap(intention)} activeOpacity={0.75}>
            <Feather name="check" size={13} color="rgba(224,242,254,0.95)" />
            <Text style={s.checkInBtnText}>Did it{checkInsWeek > 0 ? ` (${checkInsWeek})` : ''}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={s.commitBtn} onPress={() => onCommitTap(intention)} activeOpacity={0.75}>
          <Feather name="target" size={12} color="rgba(152,212,250,0.85)" />
          <Text style={s.commitBtnText}>Commit to a cadence</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function IntentionsScreen({ navigation }: any) {
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [committing, setCommitting] = useState<Intention | null>(null);

  const load = useCallback(async () => {
    const list = await getActive();
    list.sort((a, b) => {
      // committed first, then by last-mentioned recency
      if (a.isCommitted !== b.isCommitted) return a.isCommitted ? -1 : 1;
      return (b.lastMentionedAt ?? 0) - (a.lastMentionedAt ?? 0);
    });
    setIntentions(list);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleCommitConfirm = async (cadence: Cadence, why: string) => {
    if (!committing) return;
    await promoteToCommitment(committing.id, cadence, why || undefined);
    setCommitting(null);
    await load();
  };

  const handleCheckIn = async (i: Intention) => {
    await recordCheckIn(i.id);
    await load();
  };

  const handleMore = (i: Intention) => {
    const isCommitted = i.isCommitted === true;
    const options: Array<{ label: string; action: () => Promise<void> | void; destructive?: boolean }> = [];
    if (isCommitted) {
      options.push({
        label: 'Stop tracking (keep as intention)',
        action: async () => { await demoteFromCommitment(i.id); await load(); },
      });
    } else {
      options.push({
        label: 'Commit to a cadence',
        action: () => setCommitting(i),
      });
    }
    options.push({
      label: 'Release this intention',
      destructive: true,
      action: async () => { await markReleased(i.id); await load(); },
    });

    Alert.alert(
      i.shortLabel || i.text,
      undefined,
      [
        ...options.map(o => ({
          text: o.label,
          style: (o.destructive ? 'destructive' : 'default') as 'destructive' | 'default',
          onPress: () => { o.action(); },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="chevron-left" size={22} color="rgba(152, 212, 250, 0.80)" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Intentions</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="rgba(152,212,250,0.5)" />}
      >
        {intentions.length === 0 ? (
          <View style={s.empty}>
            <Feather name="target" size={28} color="rgba(152,212,250,0.30)" />
            <Text style={s.emptyText}>
              No active intentions yet. As you journal, the app will surface things you've been coming back to — accept one to start tracking it here.
            </Text>
          </View>
        ) : (
          intentions.map(i => (
            <IntentionRow
              key={i.id}
              intention={i}
              onCommitTap={setCommitting}
              onCheckInTap={handleCheckIn}
              onMoreTap={handleMore}
            />
          ))
        )}
      </ScrollView>

      <CommitPromptModal
        intention={committing}
        visible={committing !== null}
        onClose={() => setCommitting(null)}
        onConfirm={handleCommitConfirm}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(152,212,250,0.08)',
  },
  backBtn: { padding: 4, width: 32, alignItems: 'center' },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Baskerville',
    color: 'rgba(224, 242, 254, 0.95)',
    fontWeight: '500',
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
    gap: 12,
  },

  empty: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 60,
    gap: 14,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
  },

  card: {
    backgroundColor: 'rgba(2,6,14,0.90)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.16)',
    padding: 14,
    gap: 12,
  },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitleCol: { flex: 1, gap: 6 },
  moreBtn: { padding: 2 },

  committedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(9,41,173,0.32)',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  committedBadgeText: {
    fontSize: 10,
    letterSpacing: 0.5,
    color: 'rgba(152,212,250,0.85)',
    fontFamily: 'GillSans-Light',
    textTransform: 'lowercase',
  },

  title: {
    fontSize: 15,
    lineHeight: 21,
    color: 'rgba(224,242,254,0.92)',
    fontFamily: 'GillSans-Light',
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  sparkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 24,
    flex: 1,
  },
  sparkBar: {
    flex: 1,
    borderRadius: 2,
    minHeight: 2,
  },
  metaCol: { alignItems: 'flex-end' },
  metaLine: {
    fontSize: 11,
    color: 'rgba(224,242,254,0.75)',
    fontFamily: 'GillSans-Light',
  },
  metaSub: {
    fontSize: 10,
    color: 'rgba(152,212,250,0.50)',
    fontFamily: 'GillSans-Light',
  },

  commitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.22)',
    backgroundColor: 'rgba(152,212,250,0.04)',
  },
  commitBtnText: {
    fontSize: 13,
    color: 'rgba(224,242,254,0.85)',
    fontFamily: 'GillSans-Light',
  },

  commitFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  trackPillOn: {
    backgroundColor: 'rgba(74, 222, 128, 0.10)',
    borderColor: 'rgba(74, 222, 128, 0.35)',
  },
  trackPillOff: {
    backgroundColor: 'rgba(252, 165, 165, 0.08)',
    borderColor: 'rgba(252, 165, 165, 0.25)',
  },
  trackPillText: {
    fontSize: 11,
    fontFamily: 'GillSans-Light',
  },
  trackPillTextOn:  { color: 'rgba(187, 247, 208, 0.85)' },
  trackPillTextOff: { color: 'rgba(252, 165, 165, 0.75)' },

  checkInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 'auto',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(9,41,173,0.40)',
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.32)',
  },
  checkInBtnText: {
    fontSize: 12,
    color: 'rgba(224,242,254,0.95)',
    fontFamily: 'GillSans-Light',
  },
});
