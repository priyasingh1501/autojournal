/**
 * HomeScreen — capture tab.
 *
 * Layout: MicTile (ocean video + breathing orb) at the top, followed by
 * TodayCard, with SecondaryActions pinned at the bottom.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  Text,
  Modal,
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { audioRecorderService } from '../services/AudioRecorderService';
import { transcribePendingClips, BatchProgress } from '../services/BatchTranscriptionService';
import { StorageService } from '../services/StorageService';
import { track } from '../services/AnalyticsService';
import {
  analyzeEntry,
  recordFalsePositive,
  WellbeingAnalysis,
} from '../services/WellbeingService';
import { getWarmLine, WarmLine } from '../services/WarmLineService';
import {
  acceptSuggestion,
  dismissSuggestion,
  getPendingSuggestion,
} from '../services/IntentionsService';
import { curate, CurationResult } from '../services/mindCuration';
import {
  getRecentPerspectivePrompts,
  type ResolvedPerspectivePrompt,
} from '../services/PerspectivePromptsService';
import {
  promptSourceContext,
  type SourceContext,
} from '../services/openingLineSelector';
import { buildCurationContext } from '../services/CurationContextBuilder';
import { WIDGET_MONITORING_KEY } from '../widgets/widgetTaskHandler';
import ComposeModal from '../components/ComposeModal';
import WellbeingResponseModal from '../components/WellbeingResponseModal';
import CuratedMindPicker from '../components/CuratedMindPicker';
import TalkScreen from './TalkScreenV2';
import ChatScreen from './ChatScreen';
import { TranscriptEntry } from '../types';

import MicTile from '../components/home/MicTile';
import TodayCard, { TodayCardData } from '../components/home/TodayCard';
import IntentionsCard from '../components/home/IntentionsCard';
import SecondaryActions from '../components/home/SecondaryActions';
import { SuggestedIntention } from '../types';

export type MicState = 'idle' | 'recording' | 'processing';

function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dominantEmotionsFrom(entries: Awaited<ReturnType<typeof StorageService.getTranscriptsForDate>>): string[] {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    for (const tag of e.emotionTags ?? []) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([tag]) => tag);
}

async function computeTodayData(): Promise<TodayCardData | null> {
  try {
    const today = localDateStr();
    const entries = await StorageService.getTranscriptsForDate(today);

    const dominantEmotions = dominantEmotionsFrom(entries);

    // 24-hour buckets — always 24 entries so the timeline strip renders stably,
    // even on an empty day (all cells at intensity 0).
    const hourCounts: number[] = new Array(24).fill(0);
    for (const e of entries) {
      const h = new Date(e.timestamp).getHours();
      if (h >= 0 && h < 24) hourCounts[h]++;
    }
    const entriesByHour = hourCounts.map((count, hour) => ({ hour, count }));

    const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);

    return {
      entryCount: entries.length,
      dominantEmotions,
      entriesByHour,
      lastEntryAt: sorted[0]?.timestamp ?? null,
    };
  } catch {
    return null;
  }
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();

  // ── Mic / recording state ────────────────────────────────────────────────────
  const [micState, setMicState]       = useState<MicState>('idle');
  const [audioLevel]                  = useState<number>(0); // AudioRecorderService doesn't expose metering
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const elapsedTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTranscribingRef     = useRef(false);
  const batchWellbeingFiredRef = useRef(false);

  // ── Video play state ─────────────────────────────────────────────────────────
  const [shouldPlay, setShouldPlay] = useState(true);

  // ── Warm line ────────────────────────────────────────────────────────────────
  const [warmLine, setWarmLine]         = useState<WarmLine | null>(null);
  const [warmLineLoading, setWarmLineLoading] = useState(true);

  // ── Pending intention suggestion ─────────────────────────────────────────────
  const [pendingSuggestion, setPendingSuggestion] = useState<SuggestedIntention | null>(null);

  // ── Today card ───────────────────────────────────────────────────────────────
  const [todayData, setTodayData] = useState<TodayCardData | null>(null);

  // ── Perspective prompts (recent, for the Get-a-new-perspective carousel) ─────
  const [recentPrompts, setRecentPrompts] = useState<ResolvedPerspectivePrompt[]>([]);
  // Source context stashed when the user taps a chip — passed to ChatScreen
  // so the opener references the specific topic rather than the day in
  // general. Cleared when the curated picker / chat closes.
  const [chatSourceContext, setChatSourceContext] = useState<SourceContext | null>(null);

  // ── Modals ───────────────────────────────────────────────────────────────────
  const [showCompose, setShowCompose]     = useState(false);
  const [showPerspective, setShowPerspective] = useState(false);
  const [callMindId, setCallMindId]       = useState<string | null | undefined>(undefined);
  const [perspectiveInitialMindId, setPerspectiveInitialMindId] = useState<string | null | undefined>(undefined);
  const [wellbeingAlert, setWellbeingAlert]   = useState<WellbeingAnalysis | null>(null);

  // ── Mind curation ────────────────────────────────────────────────────────────
  const [curation, setCuration]     = useState<CurationResult | null>(null);
  const [curationWellbeing, setCurationWellbeing] =
    useState<import('../types').WellbeingState | undefined>(undefined);

  // ── On mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Load warm line
    setWarmLineLoading(true);
    getWarmLine()
      .then(wl => { setWarmLine(wl); setWarmLineLoading(false); })
      .catch(() => { setWarmLine(null); setWarmLineLoading(false); });

    // Load pending intention suggestion
    getPendingSuggestion().then(s => setPendingSuggestion(s ?? null)).catch(() => {});

    // Load today data
    computeTodayData().then(setTodayData).catch(() => {});

    // Load recent perspective prompts for the Get-a-new-perspective carousel.
    getRecentPerspectivePrompts().then(setRecentPrompts).catch(() => {});
  }, []);

  // Widget / notification deep link: { openCompose: true } opens the compose
  // modal when the Home tab comes into focus.
  useEffect(() => {
    if (route.params?.openCompose) {
      setShowCompose(true);
      navigation.setParams({ openCompose: undefined });
    }
  }, [route.params?.openCompose, navigation]);

  // ── Recorder callbacks ───────────────────────────────────────────────────────
  useEffect(() => {
    audioRecorderService.setCallbacks({
      onStatus: (s) => {
        if (s === 'recording') {
          setMicState('recording');
          setRecordingElapsed(0);
          if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
          elapsedTimerRef.current = setInterval(() => setRecordingElapsed(e => e + 1), 1000);
        } else if (s === 'idle') {
          if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
          setRecordingElapsed(0);
          // Only revert to idle if we're not about to enter processing
          if (!isTranscribingRef.current) {
            setMicState('idle');
          }
        }
      },
      onPendingClip: (clip) => {
        track('recording_completed', { duration_ms: clip.duration });
        handleTranscribeNow();
      },
      onError: (err) => {
        Alert.alert('Error', err);
        isTranscribingRef.current = false;
        setMicState('idle');
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── AppState: video pause + foreground recovery ──────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setShouldPlay(true);
        isTranscribingRef.current = false;
        StorageService.getPendingClips().then(clips => {
          if (clips.length > 0) handleTranscribeNow();
        }).catch(() => {});
        getWarmLine().then(setWarmLine).catch(() => {});
        getPendingSuggestion().then(s => setPendingSuggestion(s ?? null)).catch(() => {});
      } else if (state === 'background' || state === 'inactive') {
        setShouldPlay(false);
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Android widget sync ──────────────────────────────────────────────────────
  const syncWidgetMonitoringIntent = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const val        = await AsyncStorage.getItem(WIDGET_MONITORING_KEY);
      const liveStatus = audioRecorderService.getStatus();
      if (val === 'true' && liveStatus === 'idle') {
        await audioRecorderService.startMonitoring();
      } else if (val === 'false' && liveStatus !== 'idle') {
        await audioRecorderService.stopMonitoring();
      }
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') syncWidgetMonitoringIntent();
    });
    return () => sub.remove();
  }, [syncWidgetMonitoringIntent]);

  // ── On screen focus ──────────────────────────────────────────────────────────
  useFocusEffect(useCallback(() => {
    computeTodayData().then(setTodayData).catch(() => {});
    getPendingSuggestion().then(s => setPendingSuggestion(s ?? null)).catch(() => {});
    syncWidgetMonitoringIntent();
  }, [syncWidgetMonitoringIntent]));

  // ── Widget state helper ──────────────────────────────────────────────────────
  const updateWidgetState = async (monitoring: boolean) => {
    if (Platform.OS !== 'android') return;
    try {
      await AsyncStorage.setItem(WIDGET_MONITORING_KEY, monitoring ? 'true' : 'false');
      const { requestWidgetUpdate } = require('react-native-android-widget');
      const { MicWidget } = require('../widgets/MicWidget');
      await requestWidgetUpdate({
        widgetName:   'MicWidget',
        renderWidget: () => require('react').default.createElement(MicWidget, {}),
      });
    } catch { /* widget may not be placed yet */ }
  };

  // ── Mic press ────────────────────────────────────────────────────────────────
  const handleMicPress = async () => {
    if (micState === 'processing') return;
    if (micState === 'idle') {
      track('recording_started');
      await audioRecorderService.startMonitoring();
      await updateWidgetState(true);
    } else {
      await audioRecorderService.stopMonitoring();
      await updateWidgetState(false);
    }
  };

  // ── Transcription ────────────────────────────────────────────────────────────
  const checkWellbeing = async (entry: TranscriptEntry, batchGuard = false) => {
    if (batchGuard && batchWellbeingFiredRef.current) return;
    const date     = localDateStr(new Date(entry.timestamp));
    const analysis = await analyzeEntry(entry, date);
    if (analysis && analysis.tier >= 2) {
      if (batchGuard) batchWellbeingFiredRef.current = true;
      setWellbeingAlert(analysis);
    }
  };

  const handleTranscribeNow = async () => {
    if (isTranscribingRef.current) return;
    isTranscribingRef.current  = true;
    batchWellbeingFiredRef.current = false;
    setMicState('processing');
    setBatchProgress({ total: 0, completed: 0, failed: 0 });
    try {
      await transcribePendingClips(
        (p) => setBatchProgress(p),
        (entry) => checkWellbeing(entry, true).catch(() => {}),
      );
    } catch (err) {
      console.warn('[HomeScreen] transcribePendingClips error:', err);
    } finally {
      isTranscribingRef.current = false;
      setMicState('idle');
      setBatchProgress(null);
      computeTodayData().then(setTodayData).catch(() => {});
      getWarmLine().then(setWarmLine).catch(() => {});
      // Retry any clips that arrived during this batch
      StorageService.getPendingClips().then(remaining => {
        if (remaining.length > 0) handleTranscribeNow();
      }).catch(() => {});
    }
  };

  // ── Intention card handlers ──────────────────────────────────────────────────
  const handleAcceptSuggestion = async (s: SuggestedIntention) => {
    await acceptSuggestion(s).catch(() => {});
    setPendingSuggestion(null);
  };

  const handleDismissSuggestion = async (s: SuggestedIntention) => {
    await dismissSuggestion(s).catch(() => {});
    setPendingSuggestion(null);
  };

  // ── Navigation helpers ───────────────────────────────────────────────────────

  const handleCompose = () => setShowCompose(true);

  const handlePerspective = async () => {
    try {
      setChatSourceContext(null);
      const ctx    = await buildCurationContext({ sourceSurface: 'home' });
      const result = curate(ctx);
      track('curation_rule_fired', {
        rule:             result.matchedRuleId,
        specialists:      result.specialists.map(s => s.id),
        source_surface:   'home',
      });
      setCuration(result);
      setCurationWellbeing(ctx.wellbeingState);
    } catch {
      setPerspectiveInitialMindId(undefined);
      setShowPerspective(true);
    }
  };

  // Tapping a specific chip in the Get-a-new-perspective carousel: surface the
  // curated picker seeded with the topic so the Haiku opening-line adapter
  // references it directly (e.g. "You said you've been putting off X…").
  const handlePromptTap = async (prompt: ResolvedPerspectivePrompt) => {
    try {
      setChatSourceContext(promptSourceContext({
        topic:     prompt.topic,
        why:       prompt.why,
        entryText: prompt.entryText,
      }));
      const ctx = await buildCurationContext({
        sourceSurface: 'home',
        sourceContent: { type: 'prompt', data: prompt },
      });
      const result = curate(ctx);
      track('curation_rule_fired', {
        rule:            result.matchedRuleId,
        specialists:     result.specialists.map(s => s.id),
        source_surface:  'home_prompt',
      });
      setCuration(result);
      setCurationWellbeing(ctx.wellbeingState);
    } catch {
      setPerspectiveInitialMindId(undefined);
      setShowPerspective(true);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.content}>

        {/* Scrollable body — MicTile + cards all scroll together */}
        <ScrollView
          style={s.scrollArea}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Mic tile — ocean video + breathing orb + warm line */}
          <MicTile
            micState={micState}
            audioLevel={audioLevel}
            onMicPress={handleMicPress}
            onCompose={handleCompose}
            shouldPlay={shouldPlay}
            warmLine={warmLine}
            warmLineLoading={warmLineLoading}
            recordingElapsed={recordingElapsed}
          />

          {/* Perspective card */}
          <View style={s.cards}>
            <SecondaryActions
              onPerspective={handlePerspective}
              prompts={recentPrompts}
              onPromptTap={handlePromptTap}
            />
          </View>

          {/* Intentions card — pending suggestion */}
          {pendingSuggestion && (
            <View style={s.cards}>
              <IntentionsCard
                suggestion={pendingSuggestion}
                onAccept={handleAcceptSuggestion}
                onDismiss={handleDismissSuggestion}
              />
            </View>
          )}

          {/* Today card */}
          <View style={s.cards}>
            <TodayCard data={todayData} />
          </View>
        </ScrollView>

      </View>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <ComposeModal
        visible={showCompose}
        onClose={() => setShowCompose(false)}
        onSaved={(entry) => {
          setShowCompose(false);
          track('manual_note_created', { has_photo: !!entry.photoUri });
          computeTodayData().then(setTodayData).catch(() => {});
          setTimeout(() => checkWellbeing(entry).catch(() => {}), 600);
        }}
      />

      {wellbeingAlert && (
        <WellbeingResponseModal
          visible
          tier={wellbeingAlert.tier}
          onContinue={() => setWellbeingAlert(null)}
          onDismiss={() => setWellbeingAlert(null)}
          onFalsePositive={() => {
            recordFalsePositive().catch(() => {});
            setWellbeingAlert(null);
          }}
        />
      )}

      {/* Perspective: ChatScreen → optional TalkScreen */}
      <Modal
        visible={showPerspective}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => { setShowPerspective(false); setCallMindId(undefined); }}
      >
        {showPerspective && callMindId === undefined && (
          <ChatScreen
            initialMindId={perspectiveInitialMindId}
            sourceContext={chatSourceContext ?? undefined}
            onClose={() => {
              setShowPerspective(false);
              setCallMindId(undefined);
              setPerspectiveInitialMindId(undefined);
              setChatSourceContext(null);
            }}
            onCallRequested={(mindId) => setCallMindId(mindId ?? null)}
          />
        )}
        {showPerspective && callMindId !== undefined && (
          <TalkScreen
            initialMindId={callMindId}
            onClose={() => {
              setShowPerspective(false);
              setCallMindId(undefined);
              setPerspectiveInitialMindId(undefined);
              setChatSourceContext(null);
            }}
          />
        )}
      </Modal>

      <CuratedMindPicker
        visible={!!curation}
        result={curation}
        wellbeingState={curationWellbeing}
        onPick={(mindId) => {
          setCuration(null);
          setCurationWellbeing(undefined);
          setPerspectiveInitialMindId(mindId ?? null);
          setShowPerspective(true);
        }}
        onClose={() => {
          setCuration(null);
          setCurationWellbeing(undefined);
          setChatSourceContext(null);
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02060E',
  },
  content: {
    flex: 1,
    flexDirection: 'column',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  cards: {
    paddingHorizontal: 16,
  },

});
