import React, { useState, useEffect, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { WeeklyInsight } from '../types';
import { generateWeeklyInsight, NOT_ENOUGH_DATA } from '../services/WeeklyInsightService';
import { SECTION_LABELS } from './InsightSections';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/** Parse the plain-text insight into structured { key, body } sections */
function parseSections(text: string): Array<{ key: string; body: string }> {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sectionKeys = Object.keys(SECTION_LABELS);
  const sections: Array<{ key: string; body: string }> = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const headingKey = sectionKeys.find(k =>
      line.toLowerCase().startsWith(k.toLowerCase()),
    );
    if (headingKey) {
      const inlineBody = line.replace(new RegExp(`^${headingKey}:?\\s*`, 'i'), '').trim();
      const bodyLines: string[] = [];
      i++;
      while (
        i < lines.length &&
        !sectionKeys.some(k => lines[i].toLowerCase().startsWith(k.toLowerCase()))
      ) {
        bodyLines.push(lines[i]);
        i++;
      }
      const body = inlineBody ? [inlineBody, ...bodyLines].join(' ') : bodyLines.join(' ');
      sections.push({ key: headingKey, body });
    } else {
      i++;
    }
  }
  return sections;
}

/** First sentence of a body string */
function firstSentence(body: string): string {
  return body.match(/[^.!?]+[.!?]+/)?.[0]?.trim() ?? body;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DayDots({ active, total = 7 }: { active: number; total?: number }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[dotStyles.dot, i < active ? dotStyles.dotOn : dotStyles.dotOff]}
        />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOn:  { backgroundColor: 'rgba(152, 212, 250, 0.85)' },
  dotOff: { backgroundColor: 'rgba(152, 212, 250, 0.18)' },
});

function SectionRow({ sectionKey, body }: { sectionKey: string; body: string }) {
  const [expanded, setExpanded] = useState(false);
  const meta = SECTION_LABELS[sectionKey];
  const preview = firstSentence(body);
  const hasMore = body.trim().length > preview.length + 2;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(e => !e);
  };

  return (
    <TouchableOpacity
      style={styles.sectionRow}
      onPress={hasMore ? toggle : undefined}
      activeOpacity={hasMore ? 0.75 : 1}
    >
      {/* Icon + label row */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionLeft}>
          <Feather name={meta.iconName as any} size={12} color="rgba(152, 212, 250, 0.70)" />
          <Text style={styles.sectionLabel}>{sectionKey}</Text>
        </View>
        {hasMore && (
          <Feather
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={13}
            color="rgba(152, 212, 250, 0.35)"
          />
        )}
      </View>

      {/* Body — preview or full */}
      <Text style={styles.sectionBody}>
        {expanded ? body : preview}
      </Text>
    </TouchableOpacity>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export default function WeeklyInsightCard() {
  const [insight,       setInsight]       = useState<WeeklyInsight | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [notEnoughData, setNotEnoughData] = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [refreshing,    setRefreshing]    = useState(false);

  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => { loadInsight(false); }, []);

  useEffect(() => {
    if (loading) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.9, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(0.4);
    }
  }, [loading]);

  const loadInsight = async (force: boolean) => {
    setError(null);
    setNotEnoughData(false);
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await generateWeeklyInsight(force);
      setInsight(result);
    } catch (e: any) {
      if (e?.message === NOT_ENOUGH_DATA) setNotEnoughData(true);
      else setError(e?.message ?? 'Could not load weekly insight.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const sections = insight ? parseSections(insight.insightText) : [];

  return (
    <View style={styles.card}>
      {/* ── Heading ── */}
      <View style={styles.headingRow}>
        <Text style={styles.heading}>This week</Text>
        <TouchableOpacity
          onPress={() => loadInsight(true)}
          disabled={refreshing || loading}
          style={styles.refreshBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {refreshing
            ? <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.85)" />
            : <Feather name="refresh-cw" size={13} color="rgba(152, 212, 250, 0.65)" />}
        </TouchableOpacity>
      </View>

      {/* ── Loading skeleton ── */}
      {loading && (
        <View style={{ gap: 8 }}>
          {(['92%', '78%', '65%'] as const).map((w, i) => (
            <Animated.View key={i} style={[styles.skeletonLine, { width: w, opacity: pulseAnim }]} />
          ))}
        </View>
      )}

      {/* ── Not enough data ── */}
      {!loading && notEnoughData && (
        <Text style={styles.emptyText}>
          Keep journaling — weekly insights appear once you have a summary for at least one day this week.
        </Text>
      )}

      {/* ── Error ── */}
      {!loading && error && <Text style={styles.errorText}>{error}</Text>}

      {/* ── Loaded ── */}
      {!loading && insight && (
        <>
          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statNum}>{insight.daysActive}</Text>
              <Text style={styles.statLabel}>days active</Text>
            </View>

            <DayDots active={insight.daysActive} />

            <View style={styles.statBlock}>
              <Text style={styles.statNum}>{insight.totalEntries}</Text>
              <Text style={styles.statLabel}>entries</Text>
            </View>
          </View>

          {/* Section accordion */}
          <View style={styles.sections}>
            {sections.map(s => (
              <SectionRow key={s.key} sectionKey={s.key} body={s.body} />
            ))}
          </View>

          <Text style={styles.lastUpdated}>Updated {formatRelativeTime(insight.generatedAt)}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    backgroundColor: 'transparent',
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heading: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'Baskerville',
  },
  refreshBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(6, 26, 55, 0.55)',
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.18)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Stats ──────────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(152, 212, 250, 0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.10)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  statBlock: { alignItems: 'center' },
  statNum: {
    fontSize: 20,
    fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.90)',
    fontFamily: 'Baskerville',
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(152, 212, 250, 0.55)',
    fontFamily: 'GillSans-Light',
    marginTop: 1,
    letterSpacing: 0.3,
  },

  // ── Sections ───────────────────────────────────────────────────────────────
  sections: { gap: 6 },
  sectionRow: {
    backgroundColor: 'rgba(152, 212, 250, 0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.09)',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(152, 212, 250, 0.70)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectionBody: {
    fontSize: 13,
    color: 'rgba(224, 242, 254, 0.75)',
    lineHeight: 20,
    fontFamily: 'GillSans-Light',
  },

  // ── Footer ─────────────────────────────────────────────────────────────────
  lastUpdated: {
    fontSize: 11,
    color: 'rgba(152, 212, 250, 0.45)',
    marginTop: 10,
    textAlign: 'right',
    fontFamily: 'GillSans-Light',
  },

  // ── Skeleton ───────────────────────────────────────────────────────────────
  skeletonLine: {
    height: 13,
    backgroundColor: 'rgba(9, 41, 173, 0.08)',
    borderRadius: 7,
  },
  emptyText: {
    fontSize: 14, color: 'rgba(152, 212, 250, 0.60)', lineHeight: 22,
    textAlign: 'center', paddingVertical: 8, fontStyle: 'italic',
    fontFamily: 'GillSans-Light',
  },
  errorText: { fontSize: 14, color: '#e63946', lineHeight: 22, fontFamily: 'GillSans-Light' },
});
