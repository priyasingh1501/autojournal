/**
 * PatternsScreen — the ff_patterns_tab UI.
 *
 * Replaces the Insights tab when the flag is on. Read-only surface over
 * PatternsService: shows the cached report if present, and regenerates on
 * pull-to-refresh or via the regenerate link. All classification-era tabs
 * (Who I Am, etc.) stay intact behind the flag — this is a parallel screen,
 * not a rewrite of InsightsScreen.
 *
 * Paywall: first generation is free (matches InsightsScreen's soft gate via
 * canGenerateInsight); subsequent regenerations require Pro.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import {
  AcrossTimeObservation,
  AcrossTimeType,
  DailySummary,
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
import { MINDS } from '../services/MindService';
import { curate, CurationResult } from '../services/PatternsCurator';
import { getActiveIntentions } from '../services/IntentionsService';
import {
  curate as mindCurate,
  CurationResult as MindCurationResult,
} from '../services/mindCuration';
import { buildCurationContext } from '../services/CurationContextBuilder';
import PaywallModal from '../components/PaywallModal';
import TalkScreen from './TalkScreenV2';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatArchiveStart(archiveDays: number): string {
  const start = new Date(Date.now() - Math.max(0, archiveDays - 1) * 86_400_000);
  return start.toLocaleDateString([], { month: 'long', day: 'numeric' });
}

/**
 * Synthesize a DailySummary whose insightText carries the pattern + evidence.
 * ConversationService.buildContextBlock uses `insightText ?? summary`, so the
 * context flows into Claude's opening message and mind persona without
 * needing any changes to TalkScreen.
 */
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
      <Text style={empty.title}>Come back after a few days</Text>
      <Text style={empty.sub}>
        Patterns needs a bit of your own writing to show you anything honest.
        Journal for a few days and the first observations will appear.
      </Text>
      <View style={empty.milestones}>
        <MilestoneLine days={14} label="what's been loud lately" />
        <MilestoneLine days={45} label="questions you keep returning to" />
        <MilestoneLine days={60} label="things you might be wondering about" />
      </View>
    </View>
  );
}

function MilestoneLine({ days, label }: { days: number; label: string }) {
  return (
    <View style={empty.milestoneRow}>
      <Text style={empty.milestoneDays}>{days} days</Text>
      <Text style={empty.milestoneLabel}>{label}</Text>
    </View>
  );
}

function YoungArchiveNudge({ archiveDays }: { archiveDays: number }) {
  const next = archiveDays < 14 ? 14 : archiveDays < 45 ? 45 : archiveDays < 60 ? 60 : null;
  if (next === null) return null;
  const daysAway = next - archiveDays;
  return (
    <View style={young.wrap}>
      <Feather name="clock" size={13} color="rgba(152,212,250,0.55)" />
      <Text style={young.text}>
        More will appear as you keep journaling — about {daysAway} day{daysAway !== 1 ? 's' : ''} from the next section.
      </Text>
    </View>
  );
}

// ── This month ───────────────────────────────────────────────────────────────

type EmotionFamily = 'calm' | 'tense' | 'low' | 'energized' | 'neutral';

function emotionFamily(emotion: string): EmotionFamily {
  const e = emotion.toLowerCase();
  if (/calm|content|hopeful|peaceful|grateful|relaxed/.test(e)) return 'calm';
  if (/anxious|stressed|overwhelmed|worried|frustrated|tense/.test(e)) return 'tense';
  if (/sad|lonely|grief|down|low|melanchol/.test(e)) return 'low';
  if (/excited|proud|motivated|energized|happy|joyful|inspired/.test(e)) return 'energized';
  return 'neutral';
}

const EMOTION_COLORS: Record<EmotionFamily, string> = {
  calm:      'rgba(99,211,174,0.85)',
  tense:     'rgba(251,191,36,0.85)',
  low:       'rgba(167,139,250,0.85)',
  energized: 'rgba(248,164,76,0.85)',
  neutral:   'rgba(152,212,250,0.60)',
};

function EmotionalArcRow({ arc }: { arc: NonNullable<PatternsReport['thisMonth']['emotionalArc']> }) {
  return (
    <View style={arc.length > 0 ? tms.arcWrap : undefined}>
      <Text style={tms.arcLabel}>EMOTIONAL ARC</Text>
      <View style={tms.arcRow}>
        {arc.map(w => {
          const color = EMOTION_COLORS[emotionFamily(w.dominantEmotion)];
          return (
            <View key={w.week} style={tms.arcWeek}>
              <View style={[tms.arcDot, { backgroundColor: color }]} />
              <Text style={tms.arcWeekLabel}>W{w.week}</Text>
              <Text style={[tms.arcEmotion, { color }]} numberOfLines={1}>
                {w.dominantEmotion}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ThisMonthSection({ tm }: { tm: PatternsReport['thisMonth'] }) {
  const hasAny =
    !!tm.reflection ||
    (tm.whatsLoud && tm.whatsLoud.length > 0) ||
    (tm.intentionsProgress && tm.intentionsProgress.length > 0) ||
    (tm.emotionalArc && tm.emotionalArc.length > 0);

  if (!hasAny) return null;

  return (
    <View style={tms.wrap}>
      <Text style={tms.label}>THIS MONTH</Text>
      {tm.reflection ? <Text style={tms.reflection}>{tm.reflection}</Text> : null}
      {tm.whatsLoud && tm.whatsLoud.length > 0 && (
        <View style={tms.chipsRow}>
          {tm.whatsLoud.map((w, i) => (
            <View key={`${w}-${i}`} style={tms.chip}>
              <Text style={tms.chipText}>{w}</Text>
            </View>
          ))}
        </View>
      )}
      {tm.intentionsProgress && tm.intentionsProgress.length > 0 && (
        <View style={tms.intentions}>
          {tm.intentionsProgress.map((ip, i) => (
            <View key={i} style={tms.intentionRow}>
              <Text style={tms.intentionLabel}>{ip.intention}</Text>
              <Text style={tms.intentionNote}>{ip.note}</Text>
            </View>
          ))}
        </View>
      )}
      {tm.emotionalArc && tm.emotionalArc.length >= 2 && (
        <EmotionalArcRow arc={tm.emotionalArc} />
      )}
    </View>
  );
}

// ── Observation card ─────────────────────────────────────────────────────────

function ObservationCard({
  obs,
  hidden,
  muted,
  onSitWith,
  onDismiss,
  onExpandSection,
}: {
  obs: AcrossTimeObservation;
  hidden: boolean;
  muted?: boolean;
  onSitWith: (obs: AcrossTimeObservation) => void;
  onDismiss: (obs: AcrossTimeObservation) => void;
  onExpandSection: (section: AcrossTimeType) => void;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  if (hidden) return null;

  const toggleEvidence = () => {
    const next = !evidenceOpen;
    setEvidenceOpen(next);
    if (next) onExpandSection(obs.type);
  };

  return (
    <View style={[card.wrap, muted && card.wrapMuted]}>
      <Text style={card.title}>{obs.title}</Text>
      <Text style={card.body}>{obs.body}</Text>

      <TouchableOpacity style={card.evidenceToggle} onPress={toggleEvidence} activeOpacity={0.7}>
        <Feather
          name={evidenceOpen ? 'chevron-up' : 'chevron-down'}
          size={13}
          color="rgba(152,212,250,0.70)"
        />
        <Text style={card.evidenceToggleText}>
          {evidenceOpen
            ? 'Hide evidence'
            : `From your entries (${obs.evidence.length})`}
        </Text>
      </TouchableOpacity>

      {evidenceOpen && (
        <View style={card.evidenceList}>
          {obs.evidence.map((e, i) => (
            <View key={i} style={card.evidenceItem}>
              <Text style={card.evidenceDate}>{formatDate(e.date)}</Text>
              <Text style={card.evidenceExcerpt}>“{e.excerpt}”</Text>
            </View>
          ))}
        </View>
      )}

      <View style={card.actionsRow}>
        <TouchableOpacity
          style={card.sitWithBtn}
          onPress={() => onSitWith(obs)}
          activeOpacity={0.85}
        >
          <Feather name="compass" size={13} color="rgba(224,242,254,0.92)" />
          <Text style={card.sitWithText}>Sit with this</Text>
        </TouchableOpacity>
        {obs.dismissible && (
          <TouchableOpacity
            style={card.dismissBtn}
            onPress={() => onDismiss(obs)}
            activeOpacity={0.7}
          >
            <Text style={card.dismissText}>Not quite</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={card.window}>{obs.window}</Text>
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

  // Build a unified entry list from mindCuration result when available,
  // or fall back to the static patternMindMap.
  type PickerEntry = { id: string | null; name: string; sub: string; imageSource?: any };
  const entries: PickerEntry[] = curationResult
    ? [
        { id: null,  name: 'Companion', sub: curationResult.companion.copy },
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

          <TouchableOpacity
            style={picker.option}
            onPress={() => onPick('not_quite')}
            activeOpacity={0.8}
          >
            <View style={[picker.avatar, picker.reasonAvatar]}>
              <Feather name="x" size={16} color="rgba(224,242,254,0.90)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={picker.optionName}>Not quite me</Text>
              <Text style={picker.optionSub}>The observation doesn't match how I see it.</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={picker.option}
            onPress={() => onPick('too_soft')}
            activeOpacity={0.8}
          >
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

  // Curated split — recomputed whenever report changes
  const [curation, setCuration] = useState<CurationResult>({ surfaced: [], additional: [] });
  const [moreExpanded, setMoreExpanded] = useState(false);

  // Optimistic hide after a dismiss; survives until next generation refreshes.
  const [locallyHidden, setLocallyHidden] = useState<Set<string>>(new Set());

  // Sheets
  const [sitWithObs,       setSitWithObs]       = useState<AcrossTimeObservation | null>(null);
  const [sitWithCuration,  setSitWithCuration]  = useState<MindCurationResult | null>(null);
  const [dismissObs,       setDismissObs]       = useState<AcrossTimeObservation | null>(null);
  const [talkSummary, setTalkSummary] = useState<DailySummary | null>(null);
  const [talkMindId,  setTalkMindId]  = useState<string | null>(null);
  const [talkSourceContext, setTalkSourceContext] =
    useState<import('../services/openingLineSelector').SourceContext | null>(null);

  // Paywall
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallHint, setPaywallHint] = useState<string | undefined>();

  const runCuration = useCallback(async (r: PatternsReport) => {
    const [dismissed, history, intentions] = await Promise.all([
      getDismissed(),
      getReportHistory(),
      getActiveIntentions().catch(() => []),
    ]);
    const previousReport = history.length > 0 ? history[history.length - 1] : null;
    const result = curate(
      r,
      previousReport,
      dismissed.map(d => d.fingerprint),
      intentions.map(i => i.text),
    );
    setCuration(result);
    setMoreExpanded(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      track('patterns_tab_viewed');
      (async () => {
        const cached = await getCachedReport();
        setReport(cached);
        if (cached) runCuration(cached);
        const dates = await StorageService.getSummaryDates();
        setHasAnyArchive(dates.length > 0);
        // Auto-generate first report when we have an archive and nothing cached.
        if (!cached && dates.length >= 3) {
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
      setLocallyHidden(new Set()); // fresh report supersedes local hides
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
      const ctx = await buildCurationContext({
        sourceSurface: 'patterns',
        sourceContent: { type: 'pattern', data: obs, patternType: obs.type },
      });
      mindCuration = mindCurate(ctx);
      track('curation_rule_fired', {
        rule: mindCuration.matchedRuleId,
        specialists: mindCuration.specialists.map(s => s.id),
        source_surface: 'patterns',
        pattern_type: obs.type,
      });
    } catch { /* sheet falls back to patternMindMap */ }
    setSitWithCuration(mindCuration);
    setSitWithObs(obs);
  };

  const pickMind = (mindId: MindCandidate) => {
    if (!sitWithObs) return;
    track('sit_with_this_opened', {
      source: 'patterns',
      mind_id: mindId ?? 'companion',
    });
    const summary = buildPatternSummary(sitWithObs);
    setTalkSummary(summary);
    setTalkMindId(mindId);
    // Thread pattern source context for the V2 opener — picks from
    // openingLinesWithContext + runs the Haiku adaptation pass.
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
    track('patterns_observation_dismissed', {
      section: obs.type,
      reason,
    });
    await addDismissal({ type: obs.type, title: obs.title, reason });
    // Optimistic hide — stays hidden until next generate overwrites locallyHidden.
    setLocallyHidden(prev => new Set(prev).add(obs.title));
  };

  // ── Section-expand telemetry ───────────────────────────────────────────────
  const onExpandSection = (section: AcrossTimeType) => {
    track('patterns_section_viewed', { section });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // Still resolving whether the user has *any* archive at all
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Patterns</Text>
        {report && (
          <TouchableOpacity onPress={onRegeneratePress} disabled={loading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
            ? <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="rgba(152,212,250,0.70)"
              />
            : undefined
        }
      >
        {/* Subtitle */}
        {report ? (
          <Text style={styles.subtitle}>
            What I'm seeing in your last {archiveDays} day{archiveDays !== 1 ? 's' : ''} of entries
          </Text>
        ) : null}

        {/* TODO(Phase 6): Letter banner slot — leave space, don't render yet */}

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
            <ThisMonthSection tm={report.thisMonth} />

            {curation.surfaced.length > 0 ? (
              <View style={styles.acrossTimeWrap}>
                <Text style={styles.sectionLabel}>ACROSS TIME</Text>
                {curation.surfaced.map((obs, i) => (
                  <ObservationCard
                    key={`${obs.type}-${i}`}
                    obs={obs}
                    hidden={locallyHidden.has(obs.title)}
                    onSitWith={openSitWith}
                    onDismiss={openDismiss}
                    onExpandSection={onExpandSection}
                  />
                ))}

                {curation.additional.length > 0 && (
                  <>
                    <TouchableOpacity
                      style={styles.moreBtn}
                      onPress={() => {
                        setMoreExpanded(e => !e);
                        if (!moreExpanded) track('patterns_more_expanded');
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather
                        name={moreExpanded ? 'chevron-up' : 'chevron-down'}
                        size={13}
                        color="rgba(152,212,250,0.65)"
                      />
                      <Text style={styles.moreBtnText}>
                        {moreExpanded
                          ? 'Show less'
                          : `${curation.additional.filter(o => !locallyHidden.has(o.title)).length} more pattern${curation.additional.filter(o => !locallyHidden.has(o.title)).length !== 1 ? 's' : ''}`}
                      </Text>
                    </TouchableOpacity>

                    {moreExpanded && curation.additional.map((obs, i) => (
                      <ObservationCard
                        key={`additional-${obs.type}-${i}`}
                        obs={obs}
                        hidden={locallyHidden.has(obs.title)}
                        muted
                        onSitWith={openSitWith}
                        onDismiss={openDismiss}
                        onExpandSection={onExpandSection}
                      />
                    ))}
                  </>
                )}
              </View>
            ) : report.acrossTime.length === 0 ? (
              <YoungArchiveNudge archiveDays={archiveDays} />
            ) : null}

            {/* Footer */}
            <Text style={styles.footer}>
              Updated weekly. Based on {report.entryCount} entr{report.entryCount === 1 ? 'y' : 'ies'} since{' '}
              {formatArchiveStart(archiveDays)}. These are observations, not conclusions.
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

      {/* Talk modal — launched after mind pick */}
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

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4,
  },
  screenTitle: {
    fontSize: 22, fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)', fontFamily: 'Baskerville',
  },
  topLink: {
    fontSize: 14, color: 'rgba(152, 212, 250, 0.80)',
    fontFamily: 'GillSans-Light', letterSpacing: 0.2,
  },

  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },
  subtitle: {
    fontSize: 13, color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
    marginTop: 2, marginBottom: 18,
  },

  initialLoading: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 48, gap: 12,
  },
  initialLoadingText: {
    fontSize: 13, color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
  },

  sectionLabel: {
    fontSize: 10, letterSpacing: 0.8, fontWeight: '500',
    color: 'rgba(152, 212, 250, 0.60)',
    fontFamily: 'GillSans-Light',
    marginBottom: 10, marginTop: 6,
  },
  acrossTimeWrap: { marginTop: 18 },

  moreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 4,
    alignSelf: 'flex-start',
    marginTop: 2, marginBottom: 4,
  },
  moreBtnText: {
    fontSize: 13, letterSpacing: 0.2,
    color: 'rgba(152,212,250,0.72)',
    fontFamily: 'GillSans-Light',
  },

  footer: {
    marginTop: 24,
    fontSize: 12, lineHeight: 19,
    color: 'rgba(152,212,250,0.48)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
    paddingHorizontal: 10,
  },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 16, padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(252,165,165,0.08)',
    borderWidth: 1, borderColor: 'rgba(252,165,165,0.25)',
  },
  errorText: {
    flex: 1, fontSize: 12,
    color: 'rgba(252,165,165,0.80)',
    fontFamily: 'GillSans-Light',
  },
});

// ── This month styles ────────────────────────────────────────────────────────

const tms = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(3, 18, 40, 0.72)',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.13)',
    marginTop: 4,
  },
  label: {
    fontSize: 10, letterSpacing: 0.8, fontWeight: '500',
    color: 'rgba(152, 212, 250, 0.60)',
    fontFamily: 'GillSans-Light',
    marginBottom: 10,
  },
  reflection: {
    fontSize: 15, lineHeight: 23,
    color: 'rgba(224, 242, 254, 0.90)',
    fontFamily: 'Baskerville',
    marginBottom: 12,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.28)',
    backgroundColor: 'rgba(9, 41, 173, 0.18)',
  },
  chipText: {
    fontSize: 12,
    color: 'rgba(224,242,254,0.88)',
    fontFamily: 'GillSans-Light',
  },
  intentions: { marginTop: 14, gap: 8 },
  intentionRow: { gap: 2 },
  intentionLabel: {
    fontSize: 12, letterSpacing: 0.3,
    color: 'rgba(224,242,254,0.90)',
    fontFamily: 'GillSans-Light',
  },
  intentionNote: {
    fontSize: 13, lineHeight: 20,
    color: 'rgba(152,212,250,0.75)',
    fontFamily: 'GillSans-Light',
  },

  arcWrap: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152,212,250,0.10)',
  },
  arcLabel: {
    fontSize: 10, letterSpacing: 0.8, fontWeight: '500',
    color: 'rgba(152,212,250,0.50)',
    fontFamily: 'GillSans-Light',
    marginBottom: 10,
  },
  arcRow: {
    flexDirection: 'row',
    gap: 0,
    justifyContent: 'space-between',
  },
  arcWeek: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  arcDot: {
    width: 8, height: 8,
    borderRadius: 4,
  },
  arcWeekLabel: {
    fontSize: 10, letterSpacing: 0.5,
    color: 'rgba(152,212,250,0.45)',
    fontFamily: 'GillSans-Light',
  },
  arcEmotion: {
    fontSize: 11, letterSpacing: 0.1,
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
  },
});

// ── Observation card styles ──────────────────────────────────────────────────

const card = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(3, 18, 40, 0.60)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.12)',
  },
  wrapMuted: {
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(152,212,250,0.22)',
    opacity: 0.82,
  },
  title: {
    fontSize: 15, fontFamily: 'Baskerville',
    color: 'rgba(224, 242, 254, 0.92)',
    marginBottom: 6,
  },
  body: {
    fontSize: 14, lineHeight: 21,
    color: 'rgba(224, 242, 254, 0.82)',
    fontFamily: 'GillSans-Light',
    marginBottom: 10,
  },

  evidenceToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  evidenceToggleText: {
    fontSize: 12, letterSpacing: 0.2,
    color: 'rgba(152,212,250,0.75)',
    fontFamily: 'GillSans-Light',
  },
  evidenceList: {
    marginTop: 4, marginBottom: 4,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(152,212,250,0.22)',
    gap: 8,
  },
  evidenceItem: { gap: 2 },
  evidenceDate: {
    fontSize: 10, letterSpacing: 0.5,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    textTransform: 'uppercase',
  },
  evidenceExcerpt: {
    fontSize: 13, lineHeight: 20,
    color: 'rgba(224,242,254,0.80)',
    fontFamily: 'GillSans-Light',
    fontStyle: 'italic',
  },

  actionsRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, marginTop: 12,
  },
  sitWithBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: 'rgba(9,41,173,0.45)',
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.28)',
  },
  sitWithText: {
    fontSize: 13, letterSpacing: 0.2,
    color: 'rgba(224,242,254,0.92)',
    fontFamily: 'GillSans-Light',
  },
  dismissBtn: {
    paddingHorizontal: 10, paddingVertical: 8,
  },
  dismissText: {
    fontSize: 12,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
  },
  window: {
    marginTop: 10,
    fontSize: 10, letterSpacing: 0.5,
    color: 'rgba(152,212,250,0.40)',
    fontFamily: 'GillSans-Light',
    textTransform: 'uppercase',
  },
});

// ── Empty / young archive styles ─────────────────────────────────────────────

const empty = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 36, paddingHorizontal: 10,
    marginTop: 24,
  },
  title: {
    fontSize: 18, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.90)',
    marginBottom: 10,
  },
  sub: {
    fontSize: 14, lineHeight: 22,
    color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
    marginBottom: 24,
  },
  milestones: {
    gap: 8,
    alignSelf: 'stretch',
    paddingHorizontal: 14,
  },
  milestoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 6,
  },
  milestoneDays: {
    fontSize: 12, letterSpacing: 0.5,
    color: 'rgba(152,212,250,0.75)',
    fontFamily: 'GillSans-Light',
    textTransform: 'uppercase',
    width: 64,
  },
  milestoneLabel: {
    flex: 1,
    fontSize: 13, lineHeight: 20,
    color: 'rgba(224,242,254,0.78)',
    fontFamily: 'GillSans-Light',
  },
});

const young = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 14,
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.14)',
    backgroundColor: 'rgba(9,41,173,0.08)',
  },
  text: {
    flex: 1,
    fontSize: 12, lineHeight: 18,
    color: 'rgba(152,212,250,0.70)',
    fontFamily: 'GillSans-Light',
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
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 22, paddingBottom: 32,
    borderTopWidth: 1, borderTopColor: 'rgba(152,212,250,0.18)',
  },
  title: {
    fontSize: 17, fontFamily: 'Baskerville',
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(9,41,173,0.10)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.14)',
    marginBottom: 8,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  companionAvatar: { backgroundColor: 'rgba(9,41,173,0.45)' },
  reasonAvatar: { backgroundColor: 'rgba(9,41,173,0.45)' },
  optionName: {
    fontSize: 14, letterSpacing: 0.2,
    color: 'rgba(224,242,254,0.92)',
    fontFamily: 'GillSans-Light',
    marginBottom: 1,
  },
  optionSub: {
    fontSize: 12, lineHeight: 17,
    color: 'rgba(152,212,250,0.60)',
    fontFamily: 'GillSans-Light',
  },
  cancel: {
    paddingVertical: 12, alignItems: 'center',
    marginTop: 6,
  },
  cancelText: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
  },
});
