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
  Dimensions,
  FlatList,
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';

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
  getArchivedMonths,
  archiveCurrentMonth,
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
import MonthChapterCard from '../components/MonthChapterCard';

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

// ── Progress ladder ───────────────────────────────────────────────────────────

const LADDER_STEPS = [
  { at: 1,  label: 'Emotional texture',  hint: 'mood & tone from day one' },
  { at: 8,  label: 'Recurring themes',   hint: 'what keeps coming up' },
  { at: 20, label: 'Deeper patterns',    hint: 'who you are over time' },
] as const;

function ProgressLadder({ entryCount, compact }: { entryCount: number; compact?: boolean }) {
  const nextStep = LADDER_STEPS.find(s => entryCount < s.at);
  const remaining = nextStep ? nextStep.at - entryCount : 0;

  return (
    <View style={[ladder.wrap, compact && ladder.wrapCompact]}>
      {!compact && (
        <Text style={ladder.heading}>The more you journal, the more emerges</Text>
      )}
      <View style={ladder.track}>
        {LADDER_STEPS.map((step, i) => {
          const unlocked = entryCount >= step.at;
          const isNext = !unlocked && (i === 0 || entryCount >= LADDER_STEPS[i - 1].at);
          return (
            <React.Fragment key={step.at}>
              {i > 0 && (
                <View style={[ladder.connector, unlocked && ladder.connectorDone]} />
              )}
              <View style={ladder.node}>
                <View style={[
                  ladder.dot,
                  unlocked ? ladder.dotDone : ladder.dotLocked,
                  isNext && ladder.dotNext,
                ]} />
                <Text style={[ladder.nodeLabel, unlocked ? ladder.nodeLabelDone : ladder.nodeLabelLocked]}>
                  {step.label}
                </Text>
                <Text style={[ladder.nodeHint, unlocked ? ladder.nodeHintDone : ladder.nodeHintLocked]}>
                  {unlocked ? step.hint : `${step.at} entries`}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
      {compact && nextStep && (
        <Text style={ladder.nudge}>
          {remaining} more {remaining === 1 ? 'entry' : 'entries'} to unlock {nextStep.label.toLowerCase()}
        </Text>
      )}
    </View>
  );
}

// ── Empty / young-archive state ───────────────────────────────────────────────

function EmptyArchiveState({ entryCount }: { entryCount: number }) {
  return (
    <View style={empty.wrap}>
      <Text style={empty.title}>
        {entryCount === 0 ? 'Start your first entry' : 'Keep going'}
      </Text>
      <Text style={empty.sub}>
        {entryCount === 0
          ? 'Patterns surface from your very first entry and deepen as your archive grows.'
          : `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} in — patterns unlock as you go.`}
      </Text>
      <View style={{ marginTop: 28, width: '100%' }}>
        <ProgressLadder entryCount={entryCount} />
      </View>
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

// ── Past months carousel ──────────────────────────────────────────────────────

function PastMonthsCarousel({
  months,
}: {
  months: Array<{ month: string; report: PatternsReport }>;
}) {
  const SCREEN_W = Dimensions.get('window').width;
  const [currentIndex, setCurrentIndex] = useState(0);

  return (
    <View style={pastStyles.wrap}>
      <FlatList
        data={months}
        keyExtractor={item => item.month}
        renderItem={({ item }) => (
          <MonthChapterCard month={item.month} report={item.report} />
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: SCREEN_W,
          offset: SCREEN_W * index,
          index,
        })}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          setCurrentIndex(idx);
        }}
      />

      {months.length > 1 && (
        <View style={pastStyles.dots}>
          {months.map((_, i) => (
            <View
              key={i}
              style={[
                pastStyles.dot,
                i === currentIndex && pastStyles.dotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function PatternsScreen() {
  const navigation = useNavigation<any>();
  const [report, setReport]   = useState<PatternsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAnyArchive, setHasAnyArchive] = useState<boolean | null>(null);
  const [totalEntryCount, setTotalEntryCount] = useState(0);
  const [newEntriesSinceReport, setNewEntriesSinceReport] = useState(0);
  const [activeTab, setActiveTab] = useState<'this_month' | 'past_months'>('this_month');
  const [archivedMonths, setArchivedMonths] = useState<Array<{ month: string; report: PatternsReport }>>([]);

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
        let cached = await getCachedReport();

        // If the cached report is from a previous calendar month, archive it
        // so the screen starts a clean slate for the new month.
        if (cached) {
          const reportMonth = new Date(cached.generatedAt);
          const now = new Date();
          const isStale = reportMonth.getFullYear() !== now.getFullYear()
            || reportMonth.getMonth() !== now.getMonth();
          if (isStale) {
            await archiveCurrentMonth();
            cached = null;
            setReport(null);
            setCuration({ surfaced: [], additional: [] });
          }
        }

        setReport(cached);
        if (cached) runCuration(cached);

        const [summaryDates, transcriptDates, archived] = await Promise.all([
          StorageService.getSummaryDates(),
          StorageService.getTranscriptDates(),
          getArchivedMonths(),
        ]);
        const hasAny = transcriptDates.length > 0 || summaryDates.length > 0;
        setHasAnyArchive(hasAny);
        setArchivedMonths(archived);
        const entriesPerDate = await Promise.all(
          transcriptDates.map(d => StorageService.getTranscriptsForDate(d)),
        );
        const allEntries = entriesPerDate.flat();
        setTotalEntryCount(allEntries.length);
        if (cached) {
          const since = allEntries.filter(e => e.timestamp > cached.generatedAt).length;
          setNewEntriesSinceReport(since);
        } else {
          setNewEntriesSinceReport(0);
        }
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
      setNewEntriesSinceReport(0);
      await runCuration(fresh);
      await SubscriptionService.recordInsightGenerated('patterns');
      track('patterns_regenerated', { entry_count: fresh.entryCount });
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
    track('mind_selected', { mind_id: mindId ?? 'companion', source: 'patterns' });
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
          {report && activeTab === 'this_month' && (
            <>
              <Text style={styles.subtitle}>
                {(() => {
                  const n = report.entryCount;
                  const label = n === 1 ? 'entry' : 'entries';
                  if (n < 8)  return `${n} ${label} · patterns form early`;
                  if (n <= 20) return `${n} ${label} · patterns emerging`;
                  return `${n} ${label} · ${archiveDays} days`;
                })()}
              </Text>
              {newEntriesSinceReport > 0 && (
                <Text style={styles.subtitleHint}>
                  {newEntriesSinceReport} new {newEntriesSinceReport === 1 ? 'entry' : 'entries'} since last refresh · regenerate to update
                </Text>
              )}
            </>
          )}
        </View>
        <View style={styles.topRightCol}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Intentions')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.topLink}>Intentions</Text>
          </TouchableOpacity>
          {report && activeTab === 'this_month' && (
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
      </View>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'this_month' && styles.tabActive]}
          onPress={() => setActiveTab('this_month')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'this_month' && styles.tabTextActive]}>
            This month
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'past_months' && styles.tabActive]}
          onPress={() => setActiveTab('past_months')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'past_months' && styles.tabTextActive]}>
            Past months
          </Text>
          {archivedMonths.length > 0 && activeTab !== 'past_months' && (
            <View style={styles.tabBadge} />
          )}
        </TouchableOpacity>
      </View>

      {activeTab === 'past_months' ? (
        archivedMonths.length === 0 ? (
          <View style={styles.initialLoading}>
            <Text style={styles.initialLoadingText}>
              {(() => {
                const now = new Date();
                const monthName = now.toLocaleString('default', { month: 'long' });
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                const daysLeft = Math.max(
                  0,
                  Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
                );
                const dayWord = daysLeft === 1 ? 'day' : 'days';
                if (daysLeft === 0) {
                  return `Your monthly enneagram is in progress. ${monthName} wraps up tonight — check back tomorrow.`;
                }
                return `Your monthly enneagram is in progress. Check back in ${daysLeft} ${dayWord} when ${monthName} wraps up.`;
              })()}
            </Text>
          </View>
        ) : (
          <PastMonthsCarousel months={archivedMonths} />
        )
      ) : (
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
          <EmptyArchiveState entryCount={totalEntryCount} />
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

            {/* Progress ladder — shown while still building the archive */}
            {report.entryCount < 50 && (
              <ProgressLadder entryCount={report.entryCount} compact />
            )}

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
      )}

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
  subtitleHint: {
    fontSize: 12,
    color: 'rgba(253,230,138,0.75)',
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
  topRightCol: {
    alignItems: 'flex-end',
    gap: 6,
  },

  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.14)',
  },
  tabActive: {
    backgroundColor: 'rgba(152,212,250,0.12)',
    borderColor: 'rgba(152,212,250,0.30)',
  },
  tabText: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.45)',
  },
  tabTextActive: {
    color: 'rgba(224,242,254,0.90)',
    fontFamily: 'GillSans',
  },
  tabBadge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(152,212,250,0.70)',
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

// ── Progress ladder styles ────────────────────────────────────────────────────

const DOT = 12;

const ladder = StyleSheet.create({
  wrap: {
    paddingVertical: 24,
    paddingHorizontal: 4,
  },
  wrapCompact: {
    paddingVertical: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152,212,250,0.08)',
  },
  heading: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.65)',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.2,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  connector: {
    flex: 1,
    height: 1,
    marginTop: DOT / 2,
    backgroundColor: 'rgba(152,212,250,0.12)',
  },
  connectorDone: {
    backgroundColor: 'rgba(152,212,250,0.40)',
  },
  node: {
    alignItems: 'center',
    width: 90,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    marginBottom: 8,
  },
  dotDone: {
    backgroundColor: 'rgba(152,212,250,0.85)',
  },
  dotLocked: {
    backgroundColor: 'rgba(152,212,250,0.18)',
  },
  dotNext: {
    backgroundColor: 'rgba(152,212,250,0.40)',
    borderWidth: 1.5,
    borderColor: 'rgba(152,212,250,0.65)',
  },
  nodeLabel: {
    fontSize: 11.5,
    fontFamily: 'GillSans',
    textAlign: 'center',
    lineHeight: 16,
  },
  nodeLabelDone: {
    color: 'rgba(224,242,254,0.85)',
  },
  nodeLabelLocked: {
    color: 'rgba(152,212,250,0.35)',
  },
  nodeHint: {
    fontSize: 10.5,
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 14,
  },
  nodeHintDone: {
    color: 'rgba(152,212,250,0.55)',
  },
  nodeHintLocked: {
    color: 'rgba(152,212,250,0.28)',
  },
  nudge: {
    marginTop: 14,
    fontSize: 11.5,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.50)',
    textAlign: 'center',
    letterSpacing: 0.1,
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

// ── Tab switcher styles ───────────────────────────────────────────────────────

// (added to main styles block below — kept here for co-location)

// ── Past months carousel styles ───────────────────────────────────────────────

const pastStyles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(152,212,250,0.20)',
  },
  dotActive: {
    backgroundColor: 'rgba(152,212,250,0.85)',
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});

