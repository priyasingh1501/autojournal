/**
 * PatternsScreen — the Patterns tab UI.
 *
 * Replaces the Insights tab when the flag is on. Read-only surface over
 * PatternsService: shows the cached report if present, and regenerates on
 * pull-to-refresh or via the regenerate link. All classification-era tabs
 * (Who I Am, etc.) stay intact behind the flag — this is a parallel screen,
 * not a rewrite of the older insights tab.
 *
 * Paywall: first generation is free (soft gate via
 * canGenerateInsight); subsequent regenerations require Pro.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import {
  AcrossTimeObservation,
  AcrossTimeType,
  DailySummary,
  Intention,
  IntentionCategory,
  PatternsReport,
} from '../types';
import {
  generate as generatePatterns,
  getCachedReport,
  getReportHistory,
  NOT_ENOUGH_DATA,
} from '../services/PatternsService';
import { StorageService } from '../services/StorageService';
import { SubscriptionService } from '../services/SubscriptionService';
import { track } from '../services/AnalyticsService';
import { mindsFor, MindCandidate } from '../services/patternMindMap';
import { addDismissal, DismissReason, getDismissed } from '../services/patternsDismiss';
import { MINDS_V2 as MINDS } from '../services/mindsConfigV2';
import { curate, CurationResult } from '../services/PatternsCurator';
import { getActiveIntentions } from '../services/IntentionsService';
import {
  curate as mindCurate,
  CurationResult as MindCurationResult,
} from '../services/mindCuration';
import { buildCurationContext } from '../services/CurationContextBuilder';
import PaywallModal from '../components/PaywallModal';
import TalkScreen from './TalkScreenV2';
import ObservationCard from '../components/home/ObservationCard';
import WhoShowsUpCard from '../components/home/WhoShowsUpCard';
import WhatPullsYouCard from '../components/home/WhatPullsYouCard';
import ThisMonthCard from '../components/home/ThisMonthCard';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatArchiveStart(archiveDays: number): string {
  const start = new Date(Date.now() - Math.max(0, archiveDays - 1) * 86_400_000);
  return start.toLocaleDateString([], { month: 'long', day: 'numeric' });
}

function buildPatternSummary(obs: AcrossTimeObservation): DailySummary {
  const body = [
    `The user is thinking about this pattern: "${obs.body}"`,
    ``,
    `Evidence from their own entries:`,
    ...obs.evidence.map(e => `  - [${e.date}] "${e.excerpt}"`),
    ``,
    `Instruction: Start by reflecting this pattern back to them, not analyzing it.`,
    `Use tentative, observational language. Do not diagnose or prescribe.`,
  ].join('\n');
  return {
    date: new Date().toISOString().slice(0, 10),
    summary: body,
    insightText: body,
    transcriptCount: 0,
    createdAt: Date.now(),
  };
}

// ── Empty / young-archive states ─────────────────────────────────────────────

function EmptyArchiveState() {
  return (
    <View style={empty.wrap}>
      <Feather name="feather" size={36} color="rgba(152,212,250,0.35)" style={{ marginBottom: 16 }} />
      <Text style={empty.title}>Start your first entry</Text>
      <Text style={empty.sub}>
        Patterns shows up from your very first entry — a texture read, then deeper
        observations as your archive grows.
      </Text>
    </View>
  );
}

// ── Mind picker sheet ────────────────────────────────────────────────────────

function MindPickerSheet({
  visible,
  observation,
  curationResult,
  onPick,
  onCancel,
}: {
  visible: boolean;
  observation: AcrossTimeObservation | null;
  curationResult: MindCurationResult | null;
  onPick: (mindId: MindCandidate) => void;
  onCancel: () => void;
}) {
  if (!observation) return null;

  type PickerEntry = { id: string | null; name: string; sub: string; imageSource?: any };
  const entries: PickerEntry[] = curationResult
    ? [
        { id: null, name: 'Companion', sub: curationResult.companion.copy },
        ...curationResult.specialists.map(s => {
          const mind = MINDS.find(m => m.id === s.id);
          return { id: s.id, name: s.displayName, sub: s.copy, imageSource: mind?.image };
        }),
      ]
    : mindsFor(observation.type).map(c => {
        const mind = c === null ? null : MINDS.find(m => m.id === c);
        return {
          id: c,
          name: mind?.name ?? 'Companion',
          sub: mind?.philosophy ?? 'A warm listener, no persona.',
          imageSource: mind?.image,
        };
      });

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <TouchableOpacity style={picker.backdrop} activeOpacity={1} onPress={onCancel}>
        <View style={picker.sheet}>
          <Text style={picker.title}>Sit with this — with whom?</Text>
          <Text style={picker.sub}>{observation.title}</Text>

          {entries.map((e, i) => (
            <TouchableOpacity
              key={`${e.id ?? 'companion'}-${i}`}
              style={picker.option}
              onPress={() => onPick(e.id)}
              activeOpacity={0.8}
            >
              {e.imageSource ? (
                <Image source={e.imageSource} style={picker.avatar} />
              ) : (
                <View style={[picker.avatar, picker.companionAvatar]}>
                  <Feather name="heart" size={18} color="rgba(224,242,254,0.90)" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={picker.optionName}>{e.name}</Text>
                <Text style={picker.optionSub} numberOfLines={2}>{e.sub}</Text>
              </View>
              <Feather name="chevron-right" size={16} color="rgba(152,212,250,0.55)" />
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={picker.cancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={picker.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Dismiss reason sheet ─────────────────────────────────────────────────────

function DismissSheet({
  visible,
  observation,
  onPick,
  onCancel,
}: {
  visible: boolean;
  observation: AcrossTimeObservation | null;
  onPick: (reason: DismissReason) => void;
  onCancel: () => void;
}) {
  if (!observation) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <TouchableOpacity style={picker.backdrop} activeOpacity={1} onPress={onCancel}>
        <View style={picker.sheet}>
          <Text style={picker.title}>What didn't fit?</Text>
          <Text style={picker.sub}>
            It won't show up again. Your feedback shapes the next report.
          </Text>

          <TouchableOpacity style={picker.option} onPress={() => onPick('not_quite')} activeOpacity={0.8}>
            <View style={[picker.avatar, picker.reasonAvatar]}>
              <Feather name="x" size={16} color="rgba(224,242,254,0.90)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={picker.optionName}>Not quite me</Text>
              <Text style={picker.optionSub}>The observation doesn't match how I see it.</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={picker.option} onPress={() => onPick('too_soft')} activeOpacity={0.8}>
            <View style={[picker.avatar, picker.reasonAvatar]}>
              <Feather name="cloud" size={16} color="rgba(224,242,254,0.90)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={picker.optionName}>Too soft</Text>
              <Text style={picker.optionSub}>It's too vague or tentative to land.</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={picker.cancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={picker.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function PatternsScreen() {
  const [report, setReport]   = useState<PatternsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAnyArchive, setHasAnyArchive] = useState<boolean | null>(null);

  const [curation, setCuration] = useState<CurationResult>({ surfaced: [], additional: [] });
  const [moreExpanded, setMoreExpanded] = useState(false);
  const moreOpacity = useRef(new Animated.Value(0)).current;
  const [activeIntentions, setActiveIntentions] = useState<Intention[]>([]);

  const [locallyHidden, setLocallyHidden] = useState<Set<string>>(new Set());

  const [sitWithObs,      setSitWithObs]      = useState<AcrossTimeObservation | null>(null);
  const [sitWithCuration, setSitWithCuration] = useState<MindCurationResult | null>(null);
  const [dismissObs,      setDismissObs]      = useState<AcrossTimeObservation | null>(null);
  const [talkSummary,     setTalkSummary]     = useState<DailySummary | null>(null);
  const [talkMindId,      setTalkMindId]      = useState<string | null>(null);
  const [talkSourceContext, setTalkSourceContext] =
    useState<import('../services/openingLineSelector').SourceContext | null>(null);

  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallHint, setPaywallHint] = useState<string | undefined>();

  const runCuration = useCallback(async (r: PatternsReport) => {
    const [dismissed, history, intentions] = await Promise.all([
      getDismissed(),
      getReportHistory(),
      getActiveIntentions().catch(() => []),
    ]);
    const previousReport = history.length > 0 ? history[history.length - 1] : null;
    const result = curate(r, previousReport, dismissed.map(d => d.fingerprint), intentions);
    setCuration(result);
    setActiveIntentions(intentions);
    setMoreExpanded(false);
    moreOpacity.setValue(0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      track('patterns_tab_viewed');
      (async () => {
        const cached = await getCachedReport();
        setReport(cached);
        if (cached) runCuration(cached);
        const [summaryDates, transcriptDates] = await Promise.all([
          StorageService.getSummaryDates(),
          StorageService.getTranscriptDates(),
        ]);
        const hasAny = transcriptDates.length > 0 || summaryDates.length > 0;
        setHasAnyArchive(hasAny);
        if (!cached && hasAny) {
          runGenerate(true).catch(() => {});
        }
      })();
    }, []),
  );

  const runGenerate = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const { report: fresh } = await generatePatterns();
      setReport(fresh);
      setLocallyHidden(new Set());
      await runCuration(fresh);
      await SubscriptionService.recordInsightGenerated('patterns');
    } catch (e: any) {
      if (e?.message === NOT_ENOUGH_DATA) {
        setError(NOT_ENOUGH_DATA);
      } else {
        setError(e?.message ?? 'Could not generate patterns.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRegeneratePress = async () => {
    const allowed = await SubscriptionService.canGenerateInsight('patterns');
    if (!allowed) {
      setPaywallHint('Regenerating Patterns is a Pro feature. Your first report is always free.');
      setShowPaywall(true);
      return;
    }
    runGenerate();
  };

  const onRefresh = async () => {
    const allowed = await SubscriptionService.canGenerateInsight('patterns');
    if (!allowed) {
      setRefreshing(false);
      setPaywallHint('Regenerating Patterns is a Pro feature. Your first report is always free.');
      setShowPaywall(true);
      return;
    }
    setRefreshing(true);
    runGenerate();
  };

  // ── Sit with this flow ─────────────────────────────────────────────────────

  const openSitWith = async (obs: AcrossTimeObservation) => {
    let mindCuration: MindCurationResult | null = null;
    try {
      const bodyLower = obs.body.toLowerCase();
      const referencedIntention = activeIntentions.find(i =>
        bodyLower.includes(i.text.toLowerCase()) ||
        (i.shortLabel && bodyLower.includes(i.shortLabel.toLowerCase())),
      );
      const intentionCategory = referencedIntention?.category;

      const ctx = await buildCurationContext({
        sourceSurface: 'patterns',
        sourceContent: { type: 'pattern', data: obs, patternType: obs.type },
        intentionCategory,
      });
      mindCuration = mindCurate(ctx);
      track('curation_rule_fired', {
        rule: mindCuration.matchedRuleId,
        specialists: mindCuration.specialists.map(s => s.id),
        source_surface: 'patterns',
        pattern_type: obs.type,
        ...(intentionCategory ? { intention_category: intentionCategory } : {}),
      });
    } catch { /* sheet falls back to patternMindMap */ }
    setSitWithCuration(mindCuration);
    setSitWithObs(obs);
  };

  const pickMind = (mindId: MindCandidate) => {
    if (!sitWithObs) return;
    track('sit_with_this_opened', { source: 'patterns', mind_id: mindId ?? 'companion' });
    const summary = buildPatternSummary(sitWithObs);
    setTalkSummary(summary);
    setTalkMindId(mindId);
    const { patternSourceContext } = require('../services/openingLineSelector');
    setTalkSourceContext(patternSourceContext({ body: sitWithObs.body }));
    setSitWithObs(null);
    setSitWithCuration(null);
  };

  // ── Dismiss flow ───────────────────────────────────────────────────────────

  const openDismiss = (obs: AcrossTimeObservation) => setDismissObs(obs);

  const confirmDismiss = async (reason: DismissReason) => {
    const obs = dismissObs;
    setDismissObs(null);
    if (!obs) return;
    track('patterns_observation_dismissed', { section: obs.type, reason });
    await addDismissal({ type: obs.type, title: obs.title, reason });
    setLocallyHidden(prev => new Set(prev).add(obs.title));
  };

  // ── Section-expand telemetry ───────────────────────────────────────────────

  const onExpandSection = (section: AcrossTimeType) => {
    track('patterns_section_viewed', { section });
  };

  // ── More expander ──────────────────────────────────────────────────────────

  const toggleMore = () => {
    if (moreExpanded) {
      Animated.timing(moreOpacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
        setMoreExpanded(false),
      );
    } else {
      setMoreExpanded(true);
      track('patterns_more_expanded');
      Animated.timing(moreOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (hasAnyArchive === null) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
        </View>
      </SafeAreaView>
    );
  }

  const archiveDays = report?.archiveDays ?? 0;
  const visibleAdditional = curation.additional.filter(o => !locallyHidden.has(o.title));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.screenTitle}>Patterns</Text>
          {report && (
            <Text style={styles.subtitle}>
              {(() => {
                const n = report.entryCount;
                const label = n === 1 ? 'entry' : 'entries';
                if (n < 8)  return `${n} ${label} · patterns form early`;
                if (n <= 20) return `${n} ${label} · patterns emerging`;
                return `${n} ${label} · ${archiveDays} days`;
              })()}
            </Text>
          )}
        </View>
        {report && (
          <TouchableOpacity
            onPress={onRegeneratePress}
            disabled={loading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {loading
              ? <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
              : <Text style={styles.topLink}>Regenerate</Text>}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          report
            ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="rgba(152,212,250,0.70)" />
            : undefined
        }
      >
        {/* Body */}
        {!hasAnyArchive || error === NOT_ENOUGH_DATA ? (
          <EmptyArchiveState />
        ) : !report ? (
          <View style={styles.initialLoading}>
            <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
            <Text style={styles.initialLoadingText}>Reading your archive…</Text>
          </View>
        ) : (
          <>
            {/* This month card */}
            <ThisMonthCard tm={report.thisMonth} />

            {/* Surfaced observations */}
            {curation.surfaced.length > 0 ? (
              <>
                {curation.surfaced.map((obs, i) => {
                  if (obs.type === 'recurring_cast' && obs.people && obs.people.length > 0) {
                    return <WhoShowsUpCard key={`${obs.type}-${i}`} obs={obs} />;
                  }
                  if (obs.type === 'whats_pulling_you' &&
                      ((obs.toward && obs.toward.length > 0) || (obs.away && obs.away.length > 0))) {
                    return <WhatPullsYouCard key={`${obs.type}-${i}`} obs={obs} />;
                  }
                  return (
                    <ObservationCard
                      key={`${obs.type}-${i}`}
                      obs={obs}
                      hidden={locallyHidden.has(obs.title)}
                      onSitWith={openSitWith}
                      onDismiss={openDismiss}
                      onSeeEntries={() => onExpandSection(obs.type)}
                    />
                  );
                })}

                {/* More patterns expander */}
                {visibleAdditional.length > 0 && (
                  <>
                    <TouchableOpacity
                      style={styles.moreBtn}
                      onPress={toggleMore}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.moreBtnText}>
                        {moreExpanded
                          ? 'Show less'
                          : `${visibleAdditional.length} more pattern${visibleAdditional.length !== 1 ? 's' : ''} ↓`}
                      </Text>
                    </TouchableOpacity>

                    {moreExpanded && (
                      <Animated.View style={{ opacity: moreOpacity }}>
                        {curation.additional.map((obs, i) => {
                          if (obs.type === 'recurring_cast' && obs.people && obs.people.length > 0) {
                            return <WhoShowsUpCard key={`additional-${obs.type}-${i}`} obs={obs} />;
                          }
                          if (obs.type === 'whats_pulling_you' &&
                              ((obs.toward && obs.toward.length > 0) || (obs.away && obs.away.length > 0))) {
                            return <WhatPullsYouCard key={`additional-${obs.type}-${i}`} obs={obs} />;
                          }
                          return (
                            <ObservationCard
                              key={`additional-${obs.type}-${i}`}
                              obs={obs}
                              hidden={locallyHidden.has(obs.title)}
                              onSitWith={openSitWith}
                              onDismiss={openDismiss}
                              onSeeEntries={() => onExpandSection(obs.type)}
                            />
                          );
                        })}
                      </Animated.View>
                    )}
                  </>
                )}
              </>
            ) : null}

            {/* Footer */}
            <Text style={styles.footer}>
              Updated weekly · since {formatArchiveStart(archiveDays)}
            </Text>
          </>
        )}

        {error && error !== NOT_ENOUGH_DATA && (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={13} color="rgba(252,165,165,0.80)" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Sheets */}
      <MindPickerSheet
        visible={!!sitWithObs}
        observation={sitWithObs}
        curationResult={sitWithCuration}
        onPick={pickMind}
        onCancel={() => { setSitWithObs(null); setSitWithCuration(null); }}
      />
      <DismissSheet
        visible={!!dismissObs}
        observation={dismissObs}
        onPick={confirmDismiss}
        onCancel={() => setDismissObs(null)}
      />

      {/* Talk modal */}
      <Modal
        visible={!!talkSummary}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => { setTalkSummary(null); setTalkMindId(null); setTalkSourceContext(null); }}
      >
        {talkSummary && (
          <TalkScreen
            summary={talkSummary}
            initialMindId={talkMindId}
            sourceContext={talkSourceContext}
            onClose={() => { setTalkSummary(null); setTalkMindId(null); setTalkSourceContext(null); }}
          />
        )}
      </Modal>

      <PaywallModal
        visible={showPaywall}
        featureHint={paywallHint}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false);
          runGenerate();
        }}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#02060E' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'Baskerville',
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(152,212,250,0.50)',
    fontFamily: 'GillSans-Light',
    marginTop: 2,
  },
  topLink: {
    fontSize: 14,
    color: 'rgba(152, 212, 250, 0.80)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.2,
    marginTop: 4,
  },

  scrollContent: { paddingHorizontal: 20, paddingBottom: 48 },

  initialLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  initialLoadingText: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
  },

  moreBtn: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
    marginBottom: 4,
  },
  moreBtnText: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.2,
  },

  footer: {
    marginTop: 24,
    fontSize: 11,
    lineHeight: 18,
    color: 'rgba(152,212,250,0.38)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(252,165,165,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.25)',
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(252,165,165,0.80)',
    fontFamily: 'GillSans-Light',
  },
});

// ── Empty / young archive styles ─────────────────────────────────────────────

const empty = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 10,
    marginTop: 24,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.90)',
    marginBottom: 10,
  },
  sub: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
  },
});

// ── Picker / sheet styles (shared) ───────────────────────────────────────────

const picker = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,14,0.82)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#02060E',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 22,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152,212,250,0.18)',
  },
  title: {
    fontSize: 17,
    fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.92)',
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
    marginBottom: 18,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(9,41,173,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.14)',
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companionAvatar: { backgroundColor: 'rgba(9,41,173,0.45)' },
  reasonAvatar:    { backgroundColor: 'rgba(9,41,173,0.45)' },
  optionName: {
    fontSize: 14,
    letterSpacing: 0.2,
    color: 'rgba(224,242,254,0.92)',
    fontFamily: 'GillSans-Light',
    marginBottom: 1,
  },
  optionSub: {
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(152,212,250,0.60)',
    fontFamily: 'GillSans-Light',
  },
  cancel: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  cancelText: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
  },
});
