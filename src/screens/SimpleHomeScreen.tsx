/**
 * SimpleHomeScreen — the ff_simple_home capture-first Home.
 *
 * Contents, in order:
 *   1. A single tappable "warm line" at the top (WarmLineService)
 *   2. A large mic button, visually dominant
 *   3. A small FAB cluster bottom-right: compose + "new perspective"
 *
 * Audio / transcription / widget / wellbeing plumbing is identical to
 * HomeScreen — only the UI shell is thinner. Per the non-goals: mic
 * recording logic and VAD are unchanged.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  ActivityIndicator,
  ImageBackground,
  Modal,
  Platform,
  AppState,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { audioRecorderService, RecordingStatus } from '../services/AudioRecorderService';
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
} from '../services/IntentionsService';
import { FeatureFlagsService } from '../services/FeatureFlagsService';
import CuratedMindPicker from '../components/CuratedMindPicker';
import { curate, CurationResult } from '../services/mindCuration';
import { buildCurationContext } from '../services/CurationContextBuilder';
import { WIDGET_MONITORING_KEY } from '../widgets/widgetTaskHandler';
import ComposeModal from '../components/ComposeModal';
import WellbeingResponseModal from '../components/WellbeingResponseModal';
import TalkScreen from './TalkScreenV2';
import ChatScreen from './ChatScreen';
import { TranscriptEntry } from '../types';

function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function SimpleHomeScreen() {
  const navigation = useNavigation<any>();

  // Mic state
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [summaryBanner, setSummaryBanner] = useState<SummaryBannerStatus | null>(null);
  const summaryBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));

  // Warm line
  const [warmLine, setWarmLine] = useState<WarmLine | null>(null);

  // Modals
  const [showCompose, setShowCompose] = useState(false);
  const [showPerspective, setShowPerspective] = useState(false);
  const [callMindId, setCallMindId] = useState<string | null | undefined>(undefined);
  const [wellbeingAlert, setWellbeingAlert] = useState<WellbeingAnalysis | null>(null);

  // ff_new_minds_system — route "new perspective" through the curated picker.
  const [newMindsOn, setNewMindsOn] = useState(false);
  const [curation, setCuration]     = useState<CurationResult | null>(null);
  const [curationWellbeing, setCurationWellbeing] =
    useState<import('../types').WellbeingState | undefined>(undefined);
  const [initialMindId, setInitialMindId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    FeatureFlagsService.getFlag('ff_new_minds_system').then(setNewMindsOn).catch(() => {});
  }, []);

  const isTranscribingRef = useRef(false);
  const batchWellbeingFiredRef = useRef(false);

  // ── Recorder callbacks (same contract as HomeScreen) ────────────────────────
  useEffect(() => {
    audioRecorderService.setCallbacks({
      onStatus: (s) => setStatus(s),
      onPendingClip: (clip) => {
        track('recording_completed', { duration_ms: clip.duration });
        handleTranscribeNow();
      },
      onError: (err) => Alert.alert('Error', err),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mic button pulse ────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === 'recording') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => { anim.stop(); pulseAnim.setValue(1); };
    }
    pulseAnim.setValue(1);
  }, [status, pulseAnim]);

  // ── Warm line: refresh on focus ─────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      getWarmLine().then(setWarmLine).catch(() => setWarmLine(null));
    }, []),
  );

  // Retry interrupted batches on foreground (preserves HomeScreen's behavior)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        isTranscribingRef.current = false;
        StorageService.getPendingClips().then(clips => {
          if (clips.length > 0) handleTranscribeNow();
        }).catch(() => {});
        // Re-resolve the warm line — reentry or a new summary may have appeared
        getWarmLine().then(setWarmLine).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Clear banner timer on unmount
  useEffect(() => () => {
    if (summaryBannerTimerRef.current) clearTimeout(summaryBannerTimerRef.current);
  }, []);

  // ── Widget ↔ app sync (android only, unchanged from HomeScreen) ─────────────
  const updateWidgetState = async (monitoring: boolean) => {
    if (Platform.OS !== 'android') return;
    try {
      await AsyncStorage.setItem(WIDGET_MONITORING_KEY, monitoring ? 'true' : 'false');
      const { requestWidgetUpdate } = require('react-native-android-widget');
      const { MicWidget } = require('../widgets/MicWidget');
      await requestWidgetUpdate({
        widgetName: 'MicWidget',
        renderWidget: () => require('react').default.createElement(MicWidget, {}),
      });
    } catch { /* widget may not be placed yet */ }
  };

  const syncWidgetMonitoringIntent = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const val = await AsyncStorage.getItem(WIDGET_MONITORING_KEY);
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
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncWidgetMonitoringIntent();
    });
    return () => sub.remove();
  }, [syncWidgetMonitoringIntent]);

  useFocusEffect(useCallback(() => { syncWidgetMonitoringIntent(); }, [syncWidgetMonitoringIntent]));

  // ── Actions ─────────────────────────────────────────────────────────────────
  const toggleMonitoring = async () => {
    if (status === 'idle') {
      track('recording_started');
      await audioRecorderService.startMonitoring();
      await updateWidgetState(true);
    } else {
      await audioRecorderService.stopMonitoring();
      await updateWidgetState(false);
    }
  };

  const checkWellbeing = async (entry: TranscriptEntry, batchGuard = false) => {
    if (batchGuard && batchWellbeingFiredRef.current) return;
    const date = localDateStr(new Date(entry.timestamp));
    const analysis = await analyzeEntry(entry, date);
    if (analysis && analysis.tier >= 2) {
      if (batchGuard) batchWellbeingFiredRef.current = true;
      setWellbeingAlert(analysis);
    }
  };

  const handleTranscribeNow = async () => {
    if (isTranscribingRef.current) return;
    isTranscribingRef.current = true;
    batchWellbeingFiredRef.current = false;
    setBatchProgress({ total: 0, completed: 0, failed: 0 });
    try {
      await transcribePendingClips(
        (p) => setBatchProgress(p),
        (entry) => { checkWellbeing(entry, true).catch(() => {}); },
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
      setBatchProgress(null);
    }
  };

  // ── Warm-line tap ───────────────────────────────────────────────────────────
  const onWarmLineTap = async () => {
    if (!warmLine || warmLine.tapTarget === 'none') return;
    if (warmLine.tapTarget === 'reentry') {
      // Accept the gentle call-back: clear the pending re-entry and open
      // the compose modal so the user can write about it.
      clearPendingReentry().catch(() => {});
      setWarmLine(null);
      setShowCompose(true);
      return;
    }
    if (warmLine.tapTarget === 'intention_suggest') {
      // Tap opens a yes/no Alert. "Yes" saves it as an active intention;
      // "Not quite" dismisses into the 30-day blocklist.
      const pending = await getPendingSuggestion();
      if (!pending) { setWarmLine(null); return; }
      Alert.alert(
        'Track this?',
        `"${pending.text}"`,
        [
          {
            text: 'Not quite',
            style: 'cancel',
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
    if (warmLine.tapTarget === 'summary') {
      navigation.navigate('Summary');
      return;
    }
    if (warmLine.tapTarget === 'patterns') {
      // Route name stays "Insights" even under ff_patterns_tab — see App.tsx.
      navigation.navigate('Insights');
      return;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const isActive = status !== 'idle';
  const isTranscribing = batchProgress !== null;

  const statusLine =
    status === 'recording' ? 'Listening…'
    : status === 'monitoring' ? 'Ready when you are'
    : isTranscribing ? 'Transcribing…'
    : '';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Warm line — inside a card */}
      {warmLine && (
        <TouchableOpacity
          style={styles.warmLineCard}
          onPress={onWarmLineTap}
          disabled={warmLine.tapTarget === 'none'}
          activeOpacity={warmLine.tapTarget === 'none' ? 1 : 0.7}
        >
          <Text
            style={[
              styles.warmLineText,
              warmLine.tapTarget === 'none' && styles.warmLineTextMuted,
            ]}
          >
            {warmLine.text}
          </Text>
          {warmLine.tapTarget !== 'none' && (
            <Feather
              name="arrow-right"
              size={13}
              color="rgba(152,212,250,0.55)"
              style={{ marginLeft: 8 }}
            />
          )}
        </TouchableOpacity>
      )}

      {/* Mic — visually dominant */}
      <View style={styles.micStage}>
        <ImageBackground
          source={require('../../assets/jellyfish.jpg')}
          style={styles.micBg}
          imageStyle={styles.micBgImage}
          resizeMode="cover"
        >
          <View style={styles.micOverlay} />
          <View style={styles.micCenter}>
            <View style={[styles.glowRing, isActive && styles.glowRingActive]}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                  style={[styles.micButton, isActive && styles.micButtonActive]}
                  onPress={toggleMonitoring}
                  activeOpacity={0.8}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                >
                  <Feather
                    name={status === 'recording' ? 'square' : 'mic'}
                    size={36}
                    color={isActive ? 'rgba(224, 242, 254, 0.95)' : '#98D4FA'}
                  />
                </TouchableOpacity>
              </Animated.View>
            </View>
            {!!statusLine && <Text style={styles.statusText}>{statusLine}</Text>}
          </View>
        </ImageBackground>
      </View>

      {/* Transcription + summary banners */}
      {isTranscribing && (
        <View style={styles.banner}>
          <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
          <Text style={styles.bannerText}>Transcribing…</Text>
        </View>
      )}
      {summaryBanner && (
        <TouchableOpacity
          style={styles.banner}
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
              <Text style={styles.bannerText}>Building your summary…</Text>
            </>
          ) : (
            <>
              <Feather name="star" size={13} color="rgba(152,212,250,0.90)" />
              <Text style={[styles.bannerText, styles.bannerTextReady]}>
                Your summary is ready
              </Text>
              <Feather name="arrow-right" size={13} color="rgba(152,212,250,0.60)" />
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Action tiles — add entry + get perspective */}
      <View style={styles.tilesRow}>
        <TouchableOpacity
          style={styles.tile}
          onPress={() => setShowCompose(true)}
          activeOpacity={0.85}
        >
          <Feather name="edit-2" size={20} color="rgba(152, 212, 250, 0.80)" />
          <Text style={styles.tileLabel}>Add a manual entry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tile}
          onPress={async () => {
            if (newMindsOn) {
              try {
                const ctx = await buildCurationContext({ sourceSurface: 'home' });
                const result = curate(ctx);
                track('curation_rule_fired', {
                  rule: result.matchedRuleId,
                  specialists: result.specialists.map(s => s.id),
                  source_surface: 'home',
                });
                setCuration(result);
                setCurationWellbeing(ctx.wellbeingState);
                return;
              } catch { /* fall back to legacy below */ }
            }
            setShowPerspective(true);
          }}
          activeOpacity={0.85}
        >
          <Feather name="compass" size={20} color="rgba(152, 212, 250, 0.80)" />
          <Text style={styles.tileLabel}>Get a new perspective</Text>
        </TouchableOpacity>
      </View>

      <ComposeModal
        visible={showCompose}
        onClose={() => setShowCompose(false)}
        onSaved={(entry) => {
          setShowCompose(false);
          track('manual_note_created', { has_photo: !!entry.photoUri });
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

      {/* Perspective modal — ChatScreen picker → optional TalkScreen */}
      <Modal
        visible={showPerspective}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => { setShowPerspective(false); setCallMindId(undefined); }}
      >
        {showPerspective && callMindId === undefined && (
          <ChatScreen
            onClose={() => { setShowPerspective(false); setCallMindId(undefined); }}
            onCallRequested={(mindId) => setCallMindId(mindId ?? null)}
          />
        )}
        {showPerspective && callMindId !== undefined && (
          <TalkScreen
            initialMindId={callMindId}
            onClose={() => { setShowPerspective(false); setCallMindId(undefined); }}
          />
        )}
      </Modal>

      {/* Curated picker flow — goes straight to TalkScreen with a chosen mind */}
      <Modal
        visible={initialMindId !== undefined}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setInitialMindId(undefined)}
      >
        {initialMindId !== undefined && (
          <TalkScreen
            initialMindId={initialMindId}
            onClose={() => setInitialMindId(undefined)}
          />
        )}
      </Modal>

      {/* Curated mind picker — ff_new_minds_system */}
      <CuratedMindPicker
        visible={!!curation}
        result={curation}
        wellbeingState={curationWellbeing}
        onPick={(mindId) => {
          setCuration(null);
          setCurationWellbeing(undefined);
          setInitialMindId(mindId);
        }}
        onClose={() => {
          setCuration(null);
          setCurationWellbeing(undefined);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },

  // Warm line — inside a card
  warmLineCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 14,
    paddingHorizontal: 18, paddingVertical: 14,
    backgroundColor: 'rgba(3, 18, 40, 0.80)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.16)',
  },
  warmLineText: {
    flex: 1,
    fontSize: 14, lineHeight: 21,
    color: 'rgba(224, 242, 254, 0.85)',
    fontFamily: 'Baskerville',
  },
  warmLineTextMuted: {
    color: 'rgba(152,212,250,0.60)',
  },

  // Action tiles
  tilesRow: {
    flexDirection: 'row',
    marginHorizontal: 16, marginBottom: 14,
    gap: 10,
    height: 88,
  },
  tile: {
    flex: 1,
    backgroundColor: 'rgba(3, 18, 40, 0.82)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tileLabel: {
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.75)',
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  // Mic stage — fills the middle
  micStage: {
    flex: 1,
    marginHorizontal: 16, marginTop: 10, marginBottom: 10,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#02060E',
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.13)',
  },
  micBg: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  micBgImage: { opacity: 0.90 },
  micOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,14,0.28)',
  },
  micCenter: { alignItems: 'center', justifyContent: 'center', gap: 22 },

  glowRing: {
    width: 188, height: 188, borderRadius: 94,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(2,6,14,0.35)',
    borderWidth: 1.5, borderColor: 'rgba(152,212,250,0.35)',
    shadowColor: '#98D4FA',
    shadowOpacity: 0.55, shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  glowRingActive: {
    borderColor: 'rgba(152,212,250,0.75)',
    shadowOpacity: 0.85, shadowRadius: 40,
  },
  micButton: {
    width: 148, height: 148, borderRadius: 74,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(9, 41, 173, 0.50)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.45)',
  },
  micButtonActive: {
    backgroundColor: 'rgba(9, 41, 173, 0.75)',
  },

  statusText: {
    fontSize: 13, letterSpacing: 0.4,
    color: 'rgba(224, 242, 254, 0.78)',
    fontFamily: 'GillSans-Light',
    textTransform: 'lowercase',
  },

  // Banners (transcribing / summary-ready)
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(9,41,173,0.18)',
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.20)',
  },
  bannerText: {
    fontSize: 12, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.80)',
  },
  bannerTextReady: { color: 'rgba(224,242,254,0.92)' },

});
