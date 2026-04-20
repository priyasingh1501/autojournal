/**
 * SimpleHomeScreen — rendered when ff_simple_home is on.
 *
 * Layout: MicTile (ocean video + breathing orb) at the top, followed by
 * WarmLineCard and TodayCard, with SecondaryActions pinned at the bottom.
 * All recording, transcription, wellbeing, and widget logic is identical to
 * HomeScreen — only the visual shell differs.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Modal,
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';

import { audioRecorderService } from '../services/AudioRecorderService';
import { transcribePendingClips, BatchProgress, SummaryBannerStatus } from '../services/BatchTranscriptionService';
import { StorageService } from '../services/StorageService';
import { track } from '../services/AnalyticsService';
import {
  analyzeEntry,
  clearPendingReentry,
  recordFalsePositive,
  WellbeingAnalysis,
} from '../services/WellbeingService';
import { getWarmLine, WarmLine } from '../services/WarmLineService';
import {
  acceptSuggestion,
  dismissSuggestion,
  getPendingSuggestion,
  getActive,
} from '../services/IntentionsService';
import { FeatureFlagsService } from '../services/FeatureFlagsService';
import { curate, CurationResult } from '../services/mindCuration';
import { intentionTouchesEntry } from '../services/digestCompute';
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
import SecondaryActions from '../components/home/SecondaryActions';

export type MicState = 'idle' | 'recording' | 'processing';

function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function computeTodayData(): Promise<TodayCardData | null> {
  try {
    const today   = localDateStr();
    const entries = await StorageService.getTranscriptsForDate(today);

    const counts: Record<string, number> = {};
    for (const e of entries) {
      for (const tag of e.emotionTags ?? []) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    const dominantEmotions = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([tag]) => tag);

    const actives = await getActive();
    // Mirror digestCompute.ts: keyword-match each intention against today's entries.
    const intentionsMentioned = actives
      .filter(i => entries.some(e => e.text && intentionTouchesEntry(i, e.text)))
      .slice(0, 6)
      .map(i => ({
        id:         i.id,
        text:       i.text,
        shortLabel: i.shortLabel || i.text.slice(0, 14),
        category:   i.category ?? 'other',
      }));

    const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);

    return {
      entryCount: entries.length,
      dominantEmotions,
      intentionsMentioned,
      lastEntryAt: sorted[0]?.timestamp ?? null,
    };
  } catch {
    return null;
  }
}

export default function SimpleHomeScreen() {
  const navigation = useNavigation<any>();

  // ── Mic / recording state ────────────────────────────────────────────────────
  const [micState, setMicState]       = useState<MicState>('idle');
  const [audioLevel]                  = useState<number>(0); // AudioRecorderService doesn't expose metering
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [summaryBanner, setSummaryBanner] = useState<SummaryBannerStatus | null>(null);
  const summaryBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTranscribingRef     = useRef(false);
  const batchWellbeingFiredRef = useRef(false);

  // ── Video play state ─────────────────────────────────────────────────────────
  const [shouldPlay, setShouldPlay] = useState(true);

  // ── Warm line ────────────────────────────────────────────────────────────────
  const [warmLine, setWarmLine]         = useState<WarmLine | null>(null);
  const [warmLineLoading, setWarmLineLoading] = useState(true);

  // ── Today card ───────────────────────────────────────────────────────────────
  const [todayData, setTodayData] = useState<TodayCardData | null>(null);

  // ── Modals ───────────────────────────────────────────────────────────────────
  const [showCompose, setShowCompose]     = useState(false);
  const [showPerspective, setShowPerspective] = useState(false);
  const [callMindId, setCallMindId]       = useState<string | null | undefined>(undefined);
  const [perspectiveInitialMindId, setPerspectiveInitialMindId] = useState<string | null | undefined>(undefined);
  const [wellbeingAlert, setWellbeingAlert]   = useState<WellbeingAnalysis | null>(null);

  // ── ff_new_minds_system ──────────────────────────────────────────────────────
  const [newMindsOn, setNewMindsOn] = useState(false);
  const [curation, setCuration]     = useState<CurationResult | null>(null);
  const [curationWellbeing, setCurationWellbeing] =
    useState<import('../types').WellbeingState | undefined>(undefined);

  // ── On mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    FeatureFlagsService.getFlag('ff_new_minds_system').then(setNewMindsOn).catch(() => {});

    // Load warm line
    setWarmLineLoading(true);
    getWarmLine()
      .then(wl => { setWarmLine(wl); setWarmLineLoading(false); })
      .catch(() => { setWarmLine(null); setWarmLineLoading(false); });

    // Load today data
    computeTodayData().then(setTodayData).catch(() => {});
  }, []);

  // ── Recorder callbacks ───────────────────────────────────────────────────────
  useEffect(() => {
    audioRecorderService.setCallbacks({
      onStatus: (s) => {
        if (s === 'recording') {
          setMicState('recording');
        } else if (s === 'idle') {
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

  // ── Banner timer cleanup ─────────────────────────────────────────────────────
  useEffect(() => () => {
    if (summaryBannerTimerRef.current) clearTimeout(summaryBannerTimerRef.current);
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
        (s) => {
          setSummaryBanner(s);
          if (summaryBannerTimerRef.current) clearTimeout(summaryBannerTimerRef.current);
          if (s === 'ready') {
            summaryBannerTimerRef.current = setTimeout(() => setSummaryBanner(null), 8000);
          }
        },
      );
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

  // ── Warm-line tap ────────────────────────────────────────────────────────────
  const onWarmLineTap = async () => {
    if (!warmLine || warmLine.tapTarget === 'none') return;
    if (warmLine.tapTarget === 'reentry') {
      clearPendingReentry().catch(() => {});
      setWarmLine(null);
      setShowCompose(true);
      return;
    }
    if (warmLine.tapTarget === 'intention_suggest') {
      const pending = await getPendingSuggestion();
      if (!pending) { setWarmLine(null); return; }
      Alert.alert(
        'Track this?',
        `"${pending.text}"`,
        [
          {
            text: 'Not quite', style: 'cancel',
            onPress: async () => {
              await dismissSuggestion(pending).catch(() => {});
              getWarmLine().then(setWarmLine).catch(() => setWarmLine(null));
            },
          },
          {
            text: 'Yes, track it',
            onPress: async () => {
              await acceptSuggestion(pending).catch(() => {});
              getWarmLine().then(setWarmLine).catch(() => setWarmLine(null));
            },
          },
        ],
      );
      return;
    }
    if (warmLine.tapTarget === 'summary')         { navigation.navigate('Summary'); return; }
    if (warmLine.tapTarget === 'patterns')         { navigation.navigate('Insights'); return; }
    if (warmLine.tapTarget === 'intention_nudge')  { setShowCompose(true); return; }
  };

  // ── Navigation helpers ───────────────────────────────────────────────────────

  const handleCompose = () => setShowCompose(true);

  const handlePerspective = async () => {
    if (newMindsOn) {
      try {
        const ctx    = await buildCurationContext({ sourceSurface: 'home' });
        const result = curate(ctx);
        track('curation_rule_fired', {
          rule:             result.matchedRuleId,
          specialists:      result.specialists.map(s => s.id),
          source_surface:   'home',
        });
        setCuration(result);
        setCurationWellbeing(ctx.wellbeingState);
        return;
      } catch { /* fall through to legacy */ }
    }
    setPerspectiveInitialMindId(undefined);
    setShowPerspective(true);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const isTranscribing = batchProgress !== null;

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
            shouldPlay={shouldPlay}
            warmLine={warmLine}
            warmLineLoading={warmLineLoading}
          />

          {/* Transcription / summary banners */}
          {isTranscribing && (
            <View style={s.banner}>
              <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
              <Text style={s.bannerText}>Transcribing…</Text>
            </View>
          )}
          {summaryBanner && (
            <TouchableOpacity
              style={s.banner}
              activeOpacity={summaryBanner === 'ready' ? 0.75 : 1}
              onPress={() => {
                if (summaryBanner === 'ready') {
                  setSummaryBanner(null);
                  navigation.navigate('Summary');
                }
              }}
            >
              {summaryBanner === 'generating' ? (
                <>
                  <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
                  <Text style={s.bannerText}>Building your summary…</Text>
                </>
              ) : (
                <>
                  <Feather name="star" size={13} color="rgba(152,212,250,0.90)" />
                  <Text style={[s.bannerText, s.bannerReady]}>Your summary is ready</Text>
                  <Feather name="arrow-right" size={13} color="rgba(152,212,250,0.60)" />
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Today card */}
          <View style={s.cards}>
            <TodayCard data={todayData} />
          </View>
        </ScrollView>

        {/* Bottom actions — always visible, outside the scroll area */}
        <SecondaryActions
          onCompose={handleCompose}
          onPerspective={handlePerspective}
        />

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
            onClose={() => { setShowPerspective(false); setCallMindId(undefined); setPerspectiveInitialMindId(undefined); }}
            onCallRequested={(mindId) => setCallMindId(mindId ?? null)}
          />
        )}
        {showPerspective && callMindId !== undefined && (
          <TalkScreen
            initialMindId={callMindId}
            onClose={() => { setShowPerspective(false); setCallMindId(undefined); setPerspectiveInitialMindId(undefined); }}
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
    paddingBottom: 8,
  },
  cards: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },

  // Transcription / summary banners
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(9,41,173,0.18)',
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.20)',
  },
  bannerText: {
    fontSize: 12, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.80)',
  },
  bannerReady: { color: 'rgba(224,242,254,0.92)' },
});
