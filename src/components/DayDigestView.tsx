/**
 * DayDigestView — lightweight "today so far" view shown while the day is
 * still open. Factual, not reflective: counts, a 24-hour timeline strip,
 * dominant emotion chips, active intentions touched. No prose. No art.
 *
 * Replaces the summary card in today's slot while no summary has been
 * generated yet. When the user closes the day (or 23:59 hits), the normal
 * reflective summary replaces this view.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  DeviceEventEmitter,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { DayDigest, Intention } from '../types';
import { getDigest } from '../services/DigestService';
import { getActiveIntentions } from '../services/IntentionsService';
import {
  getPromptsForDate,
  type ResolvedPerspectivePrompt,
} from '../services/PerspectivePromptsService';
import PerspectiveCarousel from './PerspectiveCarousel';

interface Props {
  date: string;           // YYYY-MM-DD (rollover-aware — caller's responsibility)
  /** Optional CTA when there are zero entries — e.g. "Tap the mic on Home". */
  onOpenHome?: () => void;
  /** Force a reload (e.g. after adding an entry elsewhere). */
  refreshKey?: number;
  /** Called when the user taps "Generate summary". */
  onGenerate?: () => void;
  /** True while a summary is being generated. */
  generating?: boolean;
  /** Called when the user taps a perspective chip. */
  onPromptTap?: (prompt: ResolvedPerspectivePrompt) => void;
}

export default function DayDigestView({ date, onOpenHome, refreshKey, onGenerate, generating, onPromptTap }: Props) {
  const [digest, setDigest]         = useState<DayDigest | null>(null);
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [prompts, setPrompts]       = useState<ResolvedPerspectivePrompt[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [d, ints, ps] = await Promise.all([
        getDigest(date).catch(() => null),
        getActiveIntentions().catch(() => []),
        getPromptsForDate(date).catch(() => []),
      ]);
      if (cancelled) return;
      setDigest(d);
      setIntentions(ints);
      setPrompts(ps);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [date, refreshKey]);

  // Reload prompts when extraction completes for this date (no need to reload
  // the full digest — only the prompts section changed).
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('perspectivePromptsUpdated', (payload: { date?: string }) => {
      if (payload?.date && payload.date !== date) return;
      getPromptsForDate(date).then(setPrompts).catch(() => {});
    });
    return () => sub.remove();
  }, [date]);

  const touchedIntentions = useMemo(() => {
    if (!digest) return [];
    const byId = new Map(intentions.map(i => [i.id, i]));
    return digest.intentionsMentioned.map(id => byId.get(id)).filter(Boolean) as Intention[];
  }, [digest, intentions]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
      </View>
    );
  }

  if (!digest || digest.entryCount === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Feather name="mic" size={28} color="rgba(152,212,250,0.35)" style={{ marginBottom: 12 }} />
        <Text style={styles.emptyTitle}>Nothing captured yet today</Text>
        <Text style={styles.emptyBody}>
          Your reflection will be ready tonight at midnight, once there's
          something to reflect on.
        </Text>
        {onOpenHome && (
          <TouchableOpacity style={styles.ctaBtn} onPress={onOpenHome} activeOpacity={0.85}>
            <Feather name="arrow-right" size={13} color="rgba(224,242,254,0.90)" />
            <Text style={styles.ctaText}>Go to Home</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.header}>Today so far</Text>
      <Text style={styles.subheader}>
        {digest.entryCount} entr{digest.entryCount === 1 ? 'y' : 'ies'} captured.
      </Text>

      {/* 24-hour timeline strip */}
      <HourlyStrip buckets={digest.entriesByHour} />

      {/* Dominant emotions */}
      {digest.dominantEmotions.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>FEELING</Text>
          <View style={styles.chipsRow}>
            {digest.dominantEmotions.map(e => (
              <View key={e} style={styles.chip}>
                <Text style={styles.chipText}>{e}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Perspective prompts — tappable chips that route into the curated picker */}
      {prompts.length > 0 && onPromptTap && (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>WORTH TALKING ABOUT</Text>
          <PerspectiveCarousel
            prompts={prompts}
            onTap={(p) => onPromptTap(p as ResolvedPerspectivePrompt)}
          />
        </View>
      )}

      {/* Intentions touched */}
      {touchedIntentions.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>INTENTIONS TOUCHED</Text>
          {touchedIntentions.map(i => (
            <View key={i.id} style={styles.intentionRow}>
              <Feather name="target" size={12} color="rgba(152,212,250,0.70)" />
              <Text style={styles.intentionText}>{i.text}</Text>
            </View>
          ))}
        </View>
      )}

      {generating ? (
        <View style={styles.footerRow}>
          <ActivityIndicator size="small" color="rgba(152,212,250,0.55)" style={{ marginRight: 8 }} />
          <Text style={styles.footer}>Generating…</Text>
        </View>
      ) : (
        <Text style={styles.footer}>
          Your reflection will be ready tonight at midnight.
          {onGenerate ? (
            <Text onPress={onGenerate} style={styles.footerLink}> Generate now</Text>
          ) : null}
          {onGenerate ? ' if you want to read it right away.' : null}
        </Text>
      )}
    </View>
  );
}

// ── Hourly strip ─────────────────────────────────────────────────────────────

function HourlyStrip({ buckets }: { buckets: { hour: number; count: number }[] }) {
  const maxCount = Math.max(1, ...buckets.map(b => b.count));
  return (
    <View style={strip.wrap}>
      <View style={strip.row}>
        {buckets.map(b => {
          const active = b.count > 0;
          // 4 intensity levels: 0, light, mid, strong
          const intensity = !active ? 0 : Math.min(3, Math.ceil((b.count / maxCount) * 3));
          return (
            <View
              key={b.hour}
              style={[strip.cell, strip[`cell${intensity}` as 'cell0' | 'cell1' | 'cell2' | 'cell3']]}
            />
          );
        })}
      </View>
      <View style={strip.legend}>
        <Text style={strip.legendText}>12am</Text>
        <Text style={strip.legendText}>6am</Text>
        <Text style={strip.legendText}>noon</Text>
        <Text style={strip.legendText}>6pm</Text>
        <Text style={strip.legendText}>11pm</Text>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 40 },

  wrap: { padding: 22 },
  header: {
    fontSize: 20, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.95)',
    marginBottom: 4,
  },
  subheader: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.70)',
    fontFamily: 'GillSans-Light',
    marginBottom: 20,
  },

  block: { marginTop: 18 },
  blockLabel: {
    fontSize: 10, letterSpacing: 0.8, fontWeight: '500',
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    marginBottom: 8,
  },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.28)',
    backgroundColor: 'rgba(9,41,173,0.18)',
  },
  chipText: {
    fontSize: 12,
    color: 'rgba(224,242,254,0.88)',
    fontFamily: 'GillSans-Light',
    textTransform: 'lowercase',
  },

  intentionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 4,
  },
  intentionText: {
    flex: 1,
    fontSize: 13, lineHeight: 19,
    color: 'rgba(224,242,254,0.85)',
    fontFamily: 'GillSans-Light',
  },

  footer: {
    marginTop: 24,
    fontSize: 12, lineHeight: 18,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 24, justifyContent: 'center',
  },
  footerLink: {
    color: 'rgba(152,212,250,0.85)',
    textDecorationLine: 'underline',
  },

  // Empty state
  emptyWrap: { alignItems: 'center', padding: 40 },
  emptyTitle: {
    fontSize: 16, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.92)',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 13, lineHeight: 20,
    color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  ctaBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(9,41,173,0.45)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.28)',
  },
  ctaText: {
    fontSize: 13, color: 'rgba(224,242,254,0.92)',
    fontFamily: 'GillSans-Light',
  },
});

const strip = StyleSheet.create({
  wrap: { marginTop: 8 },
  row: {
    flexDirection: 'row', gap: 2,
    height: 18,
    marginBottom: 6,
  },
  cell: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: 'rgba(9,41,173,0.10)',
  },
  cell0: { backgroundColor: 'rgba(9,41,173,0.10)' },
  cell1: { backgroundColor: 'rgba(152,212,250,0.30)' },
  cell2: { backgroundColor: 'rgba(152,212,250,0.55)' },
  cell3: { backgroundColor: 'rgba(152,212,250,0.85)' },
  legend: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  legendText: {
    fontSize: 9, letterSpacing: 0.3,
    color: 'rgba(152,212,250,0.50)',
    fontFamily: 'GillSans-Light',
    textTransform: 'uppercase',
  },
});
