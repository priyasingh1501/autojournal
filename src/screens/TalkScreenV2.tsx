/**
 * TalkScreenV2 — voice call screen backed by ElevenLabs Conversational AI.
 *
 * Replaces the manual record → Whisper → Claude → TTS pipeline with a single
 * ElevenLabs WebSocket session.  Latency drops from ~3-7 s to ~1.5-2 s.
 *
 * Architecture:
 *  1. User picks a mind (same MindPicker UI as before).
 *  2. startBoot() builds the system prompt + opening line, fetches a signed
 *     URL from our Supabase edge function, then calls conversation.startSession().
 *  3. ElevenLabs handles VAD, STT, LLM (via our elevenlabs-llm webhook → Claude
 *     Haiku), and TTS (eleven_flash_v2_5) in one WebSocket.
 *  4. onMessage callbacks drive captions, distress detection, and history.
 *  5. End call → same post-call reflection flow as TalkScreen.
 *
 * Dev-build note: @elevenlabs/react-native requires native WebRTC modules
 * (via LiveKit).  Run `npx expo prebuild` and build with Xcode / Android
 * Studio — this screen will not work in Expo Go.
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ImageBackground, Dimensions, ActivityIndicator, ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useConversation, ConversationProvider } from '@elevenlabs/react-native';

import { DailySummary, ConversationMessage } from '../types';
import {
  getOpeningMessage,
  generateReflection,
  getSystemPromptWithContext,
} from '../services/ConversationService';
import { StorageService } from '../services/StorageService';
import { recordCompletedConversation } from '../services/ConversationHistoryService';
import { useActiveMindsRoster } from '../hooks/useActiveMindsRoster';
import {
  analyzeCallTurn, queueReentry, DistressTier,
} from '../services/WellbeingService';
import WellbeingResponseModal from '../components/WellbeingResponseModal';
import { ELEVENLABS_AGENT_ID, getSignedUrl } from '../services/ElevenLabsConvAIService';
import { SourceContext } from '../services/openingLineSelector';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  summary?: DailySummary;
  onClose: () => void;
  initialMindId?: string | null;
  sourceContext?: SourceContext | null;
}

type ConvState = 'selecting' | 'connecting' | 'active' | 'post-call' | 'error';

// During 'active' we track a finer UI phase for the avatar / rings.
type UIPhase = 'listening' | 'thinking' | 'speaking';

// ── Constants ─────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');
const AVATAR_SIZE = 110;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(date: string): string {
  const todayStr    = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  if (date === todayStr)    return 'Today';
  if (date === yesterdayStr) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatTimer(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Ring component (identical to TalkScreen) ──────────────────────────────────

function Ring({ delay, active }: { delay: number; active: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;
  const loop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (active) {
      loop.current = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0,    useNativeDriver: true }),
        ]),
      );
      loop.current.start();
    } else {
      loop.current?.stop(); loop.current = null; anim.setValue(0);
    }
    return () => { loop.current?.stop(); loop.current = null; };
  }, [active]);

  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const opacity = anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 0.25, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: AVATAR_SIZE, height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
        borderWidth: 1.5, borderColor: '#98D4FA',
        transform: [{ scale }], opacity,
      }}
    />
  );
}

// ── Mind picker (identical to TalkScreen) ────────────────────────────────────

function MindPicker({
  date, onSelect, onClose,
}: {
  date: string;
  onSelect: (mindId: string | null) => void;
  onClose: () => void;
}) {
  const fullRoster = useActiveMindsRoster();
  const roster = fullRoster.filter(m => m.id !== 'companion');

  return (
    <LinearGradient colors={['#02060E', '#041628', '#02060E']} style={StyleSheet.absoluteFill}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={pickerStyles.header}>
          <View>
            <Text style={pickerStyles.title}>Call with</Text>
            <Text style={pickerStyles.sub}>{formatDate(date)}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={20} color="rgba(152,212,250,0.60)" />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={pickerStyles.content} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={pickerStyles.defaultCard} onPress={() => onSelect(null)} activeOpacity={0.8}>
            <View style={pickerStyles.defaultLeft}>
              <Text style={pickerStyles.defaultSymbol}>✦</Text>
              <View style={{ flex: 1 }}>
                <Text style={pickerStyles.defaultName}>My Untangle Companion</Text>
                <Text style={pickerStyles.defaultDesc}>
                  Your personal AI, here to help you with decisions, reflection, and life.
                </Text>
              </View>
            </View>
            <Feather name="phone" size={16} color="rgba(152,212,250,0.50)" />
          </TouchableOpacity>

          <Text style={pickerStyles.orLabel}>— or call with a mind —</Text>

          <View style={pickerStyles.grid}>
            {roster.reduce<(typeof roster)[]>((rows, m, i) => {
              if (i % 2 === 0) rows.push([m]); else rows[rows.length - 1].push(m);
              return rows;
            }, []).map((pair, pi) => (
              <View key={pi} style={pickerStyles.gridRow}>
                {pair.map(mind => {
                  const bg     = mind.accent.replace(/[\d.]+\)$/, '0.08)');
                  const border = mind.accent.replace(/[\d.]+\)$/, '0.22)');
                  return (
                    <TouchableOpacity
                      key={mind.id}
                      style={[pickerStyles.mindCard, { backgroundColor: bg, borderColor: border }]}
                      onPress={() => onSelect(mind.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={pickerStyles.mindSymbol}>{mind.symbol}</Text>
                      <Text style={pickerStyles.mindName}>{mind.name}</Text>
                      <Text style={pickerStyles.mindEra}>{mind.era}</Text>
                    </TouchableOpacity>
                  );
                })}
                {pair.length === 1 && <View style={{ flex: 1 }} />}
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ── Inner call screen (needs useConversation inside ConversationProvider) ─────

function TalkScreenInner({ summary, onClose, initialMindId, sourceContext }: Props) {
  const effectiveSummary = useMemo<DailySummary>(() => summary ?? {
    date: new Date().toISOString().split('T')[0],
    summary: 'No journal entries today — open conversation.',
    transcriptCount: 0,
    createdAt: Date.now(),
  }, [summary]);

  const [convState, setConvState] = useState<ConvState>(
    initialMindId !== undefined ? 'connecting' : 'selecting',
  );
  const [uiPhase,   setUIPhase]  = useState<UIPhase>('listening');
  const [lastAiText, setLastAiText] = useState('');
  const [callSecs,  setCallSecs]  = useState(0);
  const [error,     setError]     = useState<string | null>(null);

  const [postCallReflection,  setPostCallReflection]  = useState<string | null>(null);
  const [reflectionLoading,   setReflectionLoading]   = useState(false);
  const [wellbeingAlert,      setWellbeingAlert]       = useState<DistressTier | null>(null);

  const selectedMindIdRef       = useRef<string | null>(null);
  const conversationStartedAtRef = useRef<number>(0);
  const messagesRef             = useRef<ConversationMessage[]>([]);
  const timerRef                = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef               = useRef(true);
  const allUserTextsRef         = useRef<string[]>([]);
  const callDistressRef         = useRef<DistressTier>(1);
  const distressChecking        = useRef(false);
  const tier3Delivered          = useRef(false);
  const wellbeingModalActiveRef = useRef(false);
  const thinkPulse = useRef(new Animated.Value(1)).current;
  const thinkLoop  = useRef<Animated.CompositeAnimation | null>(null);

  // ── ElevenLabs conversation hook ────────────────────────────────────────────
  const conversation = useConversation({
    onConnect: () => {
      if (activeRef.current) {
        setConvState('active');
        setUIPhase('listening');
      }
    },
    onDisconnect: () => {
      // Disconnects can be normal (end call) or unexpected.
      // handleEndCall() sets activeRef.current = false before calling endSession(),
      // so we only treat unexpected disconnects as errors here.
      if (activeRef.current) {
        setError('Connection lost.');
        setConvState('error');
      }
    },
    onError: (err: any) => {
      console.error('[TalkScreenV2] conversation error:', err);
      if (activeRef.current) {
        setError(typeof err === 'string' ? err : 'Call error — please try again.');
        setConvState('error');
      }
    },
    onMessage: ({ message, source }: { message: string; source: 'user' | 'agent' }) => {
      if (!activeRef.current) return;

      const msg: ConversationMessage = {
        id: `${source}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: source === 'agent' ? 'assistant' : 'user',
        text: message,
        timestamp: Date.now(),
      };
      messagesRef.current = [...messagesRef.current, msg];

      if (source === 'user') {
        allUserTextsRef.current.push(message.trim());
        setUIPhase('thinking');

        // Fire-and-forget distress detection (same logic as TalkScreen).
        const turnCount = allUserTextsRef.current.length;
        if (!distressChecking.current && turnCount >= 2) {
          distressChecking.current = true;
          analyzeCallTurn(allUserTextsRef.current, turnCount)
            .then(tier => {
              if (tier && tier > callDistressRef.current) {
                callDistressRef.current = tier;
                if (tier >= 2 && activeRef.current) {
                  wellbeingModalActiveRef.current = true;
                  setWellbeingAlert(tier);
                }
              }
            })
            .catch(() => {})
            .finally(() => { distressChecking.current = false; });
        }
      } else {
        // Agent response arrived → speaking phase.
        setLastAiText(message);
        setUIPhase('speaking');
      }
    },
  });

  // isSpeaking = AI is currently playing audio.
  // When it stops, return to listening.
  useEffect(() => {
    if (convState !== 'active') return;
    if (!conversation.isSpeaking && uiPhase === 'speaking') {
      setUIPhase('listening');
    }
  }, [conversation.isSpeaking, convState]);

  // Thinking pulse animation.
  useEffect(() => {
    if (uiPhase === 'thinking') {
      thinkLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(thinkPulse, { toValue: 1.10, duration: 700, useNativeDriver: true }),
          Animated.timing(thinkPulse, { toValue: 1.00, duration: 700, useNativeDriver: true }),
        ]),
      );
      thinkLoop.current.start();
    } else {
      thinkLoop.current?.stop(); thinkPulse.setValue(1);
    }
  }, [uiPhase]);

  // Call timer.
  useEffect(() => {
    if (convState === 'active') {
      timerRef.current = setInterval(() => setCallSecs(s => s + 1), 1000);
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [convState]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Auto-start when initialMindId is provided.
  useEffect(() => {
    if (initialMindId !== undefined) startBoot(initialMindId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── startBoot ───────────────────────────────────────────────────────────────
  const startBoot = useCallback(async (mindId: string | null) => {
    selectedMindIdRef.current    = mindId;
    conversationStartedAtRef.current = Date.now();
    setConvState('connecting');
    setError(null);

    try {
      if (!ELEVENLABS_AGENT_ID) {
        throw new Error(
          'ELEVENLABS_AGENT_ID is not set.\n' +
          'Run: npx tsx scripts/setup-elevenlabs-agent.ts\n' +
          'Then paste the agent ID into src/services/ElevenLabsConvAIService.ts',
        );
      }

      // Build system prompt + opening line in parallel (both are cached after
      // the first call, so subsequent sessions are near-instant).
      const [systemPrompt, signedUrl] = await Promise.all([
        getSystemPromptWithContext(mindId, undefined),
        getSignedUrl(ELEVENLABS_AGENT_ID),
      ]);

      // Opening message — reuses the handcrafted pool (V2 flag) or legacy gen.
      const settings = await StorageService.getSettings();
      const opening = await getOpeningMessage(
        effectiveSummary,
        settings?.anthropicApiKey?.trim(),
        mindId,
        sourceContext ?? null,
      );

      // Seed messagesRef with the opening so reflection has it.
      messagesRef.current = [{
        id: `ai-${Date.now()}`, role: 'assistant', text: opening, timestamp: Date.now(),
      }];

      if (!activeRef.current) return;

      await conversation.startSession({
        signedUrl,
        // Dynamic variables are substituted into the agent's system prompt
        // template ({{full_system_prompt}}) and first_message ({{first_message}})
        // before the session starts.
        dynamicVariables: {
          full_system_prompt: systemPrompt,
          first_message: opening,
        },
      } as any); // `as any` until @elevenlabs/react-native types stabilise

    } catch (e: any) {
      setError(e?.message ?? 'Could not connect.');
      setConvState('error');
    }
  }, [conversation, effectiveSummary, sourceContext]);

  // ── handleEndCall ───────────────────────────────────────────────────────────
  const handleEndCall = useCallback(async () => {
    activeRef.current = false;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    // Record distress reentry if needed.
    const maxTier = callDistressRef.current;
    if (maxTier >= 2) {
      const today = new Date().toISOString().split('T')[0];
      queueReentry(maxTier as DistressTier, today).catch(() => {});
    }

    // Tell ElevenLabs to close the WebSocket.
    try { await conversation.endSession(); } catch { /* ignore */ }

    // Record conversation for UserContextV2.
    const userMessages = messagesRef.current.filter(m => m.role === 'user');
    if (userMessages.length > 0 && conversationStartedAtRef.current > 0) {
      recordCompletedConversation({
        mindId: selectedMindIdRef.current,
        messages: messagesRef.current.map(m => ({ role: m.role as 'user' | 'assistant', text: m.text })),
        startedAt: conversationStartedAtRef.current,
        endedAt: Date.now(),
      }).catch(() => {});
    }

    // Post-call reflection.
    const settings = await StorageService.getSettings().catch(() => null);
    const apiKey = settings?.anthropicApiKey?.trim() ?? '';
    if (userMessages.length > 0 && apiKey) {
      setConvState('post-call');
      setReflectionLoading(true);
      generateReflection(effectiveSummary, messagesRef.current, apiKey, 'call')
        .then(r => {
          setPostCallReflection(r);
          setReflectionLoading(false);
          StorageService.saveSummary({ ...effectiveSummary, reflectionText: r }).catch(() => {});
        })
        .catch(() => { setReflectionLoading(false); onClose(); });
    } else {
      onClose();
    }
  }, [conversation, effectiveSummary, onClose]);

  // ── handleAvatarTap — interrupt AI speech ───────────────────────────────────
  const handleAvatarTap = useCallback(() => {
    // The SDK's VAD will naturally detect the user speaking and cut the agent
    // off. A tap interrupt can additionally signal this via a manual stop if
    // the SDK supports it — for now we trigger VAD by doing nothing (the
    // microphone is always live). If the SDK exposes an interrupt() method in
    // future versions it can be called here.
  }, []);

  // ── Derived UI values ────────────────────────────────────────────────────────
  const stateLabel = convState === 'connecting' ? 'Connecting…'
    : convState === 'error'    ? 'Tap to retry'
    : uiPhase === 'speaking'   ? 'Speaking'
    : uiPhase === 'thinking'   ? 'Thinking…'
    : 'Listening';

  const ringsActive = convState === 'active' &&
    (uiPhase === 'speaking' || uiPhase === 'listening');

  // ── Render: mind picker ──────────────────────────────────────────────────────
  if (convState === 'selecting') {
    return (
      <MindPicker
        date={effectiveSummary.date}
        onSelect={startBoot}
        onClose={onClose}
      />
    );
  }

  // ── Render: post-call reflection ─────────────────────────────────────────────
  if (convState === 'post-call') {
    return (
      <ImageBackground source={require('../../assets/jellyfish.jpg')} style={styles.bg} resizeMode="cover">
        <LinearGradient colors={['rgba(2,6,14,0.65)', 'rgba(2,6,14,0.92)', '#02060E']} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.postCallContainer}>
            <Text style={styles.postCallHeading}>Reflection</Text>
            <Text style={styles.postCallSub}>{formatDate(effectiveSummary.date)}</Text>
            <View style={styles.postCallCard}>
              {reflectionLoading ? (
                <View style={styles.postCallLoading}>
                  <ActivityIndicator color="rgba(152,212,250,0.60)" size="small" />
                  <Text style={styles.postCallLoadingText}>Writing reflection…</Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.postCallReflection}>{postCallReflection}</Text>
                </ScrollView>
              )}
            </View>
            <TouchableOpacity
              style={[styles.postCallDoneBtn, reflectionLoading && { opacity: 0.5 }]}
              onPress={onClose}
              disabled={reflectionLoading}
              activeOpacity={0.8}
            >
              <Text style={styles.postCallDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  // ── Render: in-call ──────────────────────────────────────────────────────────
  return (
    <ImageBackground source={require('../../assets/jellyfish.jpg')} style={styles.bg} resizeMode="cover">
      <LinearGradient colors={['rgba(2,6,14,0.55)', 'rgba(2,6,14,0.82)', '#02060E']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Text style={styles.timer}>{formatTimer(callSecs)}</Text>
          <TouchableOpacity onPress={handleEndCall} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="chevron-down" size={22} color="rgba(152,212,250,0.60)" />
          </TouchableOpacity>
        </View>

        {/* Caller info */}
        <View style={styles.callerSection}>
          <Text style={styles.callerName}>untangle</Text>
          <Text style={styles.callerSub}>{formatDate(effectiveSummary.date)}</Text>
        </View>

        {/* Avatar with rings */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handleAvatarTap} activeOpacity={0.85} style={styles.avatarWrap}>
            <Ring delay={0}    active={ringsActive} />
            <Ring delay={600}  active={ringsActive} />
            <Ring delay={1200} active={ringsActive} />

            <Animated.View style={[styles.avatar, { transform: [{ scale: thinkPulse }] }]}>
              <LinearGradient
                colors={['rgba(9,41,173,0.75)', 'rgba(2,6,14,0.90)']}
                style={styles.avatarGradient}
              >
                <Feather
                  name={
                    convState === 'connecting'  ? 'loader'    :
                    uiPhase   === 'listening'   ? 'mic'       :
                    uiPhase   === 'thinking'    ? 'loader'    :
                    convState === 'error'       ? 'wifi-off'  : 'volume-2'
                  }
                  size={36}
                  color={
                    uiPhase === 'listening' ? '#e94560' :
                    convState === 'error'   ? '#e63946' :
                    'rgba(224,242,254,0.90)'
                  }
                />
              </LinearGradient>
            </Animated.View>
          </TouchableOpacity>

          {/* State pill */}
          <View style={styles.statePill}>
            <View style={[
              styles.stateDot,
              uiPhase === 'listening' && styles.stateDotListening,
              uiPhase === 'speaking'  && styles.stateDotSpeaking,
              convState === 'error'   && styles.stateDotError,
            ]} />
            <Text style={styles.stateLabel}>{stateLabel}</Text>
          </View>

          {uiPhase === 'speaking' && convState === 'active' && (
            <Text style={styles.interruptHint}>just start speaking to interrupt</Text>
          )}
        </View>

        {/* Caption */}
        <View style={styles.captionSection}>
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : lastAiText ? (
            <Text style={styles.caption} numberOfLines={4}>"{lastAiText}"</Text>
          ) : null}
        </View>

        {/* End call */}
        <View style={styles.endCallSection}>
          <TouchableOpacity style={styles.endCallBtn} onPress={handleEndCall} activeOpacity={0.85}>
            <Feather name="phone-off" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.endCallLabel}>End call</Text>
        </View>
      </SafeAreaView>

      {wellbeingAlert && (
        <WellbeingResponseModal
          visible
          tier={wellbeingAlert}
          onContinue={() => { wellbeingModalActiveRef.current = false; setWellbeingAlert(null); }}
          onDismiss={() =>  { wellbeingModalActiveRef.current = false; setWellbeingAlert(null); }}
        />
      )}
    </ImageBackground>
  );
}

// ── Public export — wraps the inner component with ConversationProvider ───────

export default function TalkScreenV2(props: Props) {
  return (
    <ConversationProvider>
      <TalkScreenInner {...props} />
    </ConversationProvider>
  );
}

// ── Styles (mirror TalkScreen exactly) ───────────────────────────────────────

const pickerStyles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  title:  { fontSize: 28, fontWeight: '500', color: 'rgba(224,242,254,0.95)', fontFamily: 'Baskerville' },
  sub:    { fontSize: 14, color: 'rgba(152,212,250,0.55)', fontFamily: 'GillSans-Light', marginTop: 4 },
  content: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12 },
  defaultCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(152,212,250,0.07)', borderWidth: 1, borderColor: 'rgba(152,212,250,0.18)', borderRadius: 16, padding: 18, marginBottom: 20 },
  defaultLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  defaultSymbol: { fontSize: 36, color: 'rgba(152,212,250,0.90)' },
  defaultName: { fontSize: 17, color: 'rgba(224,242,254,0.95)', fontFamily: 'Baskerville', marginBottom: 3 },
  defaultDesc: { fontSize: 12, color: 'rgba(152,212,250,0.65)', fontFamily: 'GillSans-Light', lineHeight: 17 },
  orLabel: { textAlign: 'center', fontSize: 12, color: 'rgba(152,212,250,0.35)', fontFamily: 'GillSans-Light', marginBottom: 16, letterSpacing: 0.5 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  mindCard: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 16, minHeight: 100 },
  mindSymbol: { fontSize: 20, marginBottom: 8 },
  mindName: { fontSize: 14, color: 'rgba(224,242,254,0.92)', fontFamily: 'Baskerville', marginBottom: 3 },
  mindEra: { fontSize: 11, color: 'rgba(152,212,250,0.50)', fontFamily: 'GillSans-Light' },
});

const styles = StyleSheet.create({
  bg:   { flex: 1, backgroundColor: '#02060E' },
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },
  timer: { fontSize: 15, color: 'rgba(224,242,254,0.55)', fontFamily: 'GillSans-Light', letterSpacing: 1 },
  callerSection: { alignItems: 'center', marginTop: 32 },
  callerName: { fontSize: 32, fontWeight: '500', color: 'rgba(224,242,254,0.95)', fontFamily: 'Baskerville', letterSpacing: 0.5 },
  callerSub: { fontSize: 14, color: 'rgba(152,212,250,0.60)', fontFamily: 'GillSans-Light', marginTop: 6 },
  avatarSection: { alignItems: 'center', marginTop: 52 },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(152,212,250,0.30)' },
  avatarGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statePill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'rgba(152,212,250,0.07)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)' },
  stateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(152,212,250,0.50)' },
  stateDotListening: { backgroundColor: '#e94560' },
  stateDotSpeaking:  { backgroundColor: '#98D4FA' },
  stateDotError:     { backgroundColor: '#e63946' },
  stateLabel: { fontSize: 13, color: 'rgba(224,242,254,0.70)', fontFamily: 'GillSans-Light' },
  interruptHint: { marginTop: 10, fontSize: 11, color: 'rgba(152,212,250,0.35)', fontFamily: 'GillSans-Light', letterSpacing: 0.5 },
  captionSection: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  caption: { fontSize: 16, color: 'rgba(224,242,254,0.50)', fontFamily: 'Baskerville', textAlign: 'center', lineHeight: 26, fontStyle: 'italic' },
  errorText: { fontSize: 14, color: '#e63946', textAlign: 'center', fontFamily: 'GillSans-Light' },
  endCallSection: { alignItems: 'center', paddingBottom: 40 },
  endCallBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#e94560', alignItems: 'center', justifyContent: 'center', shadowColor: '#e94560', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
  endCallLabel: { marginTop: 10, fontSize: 13, color: 'rgba(224,242,254,0.45)', fontFamily: 'GillSans-Light' },
  postCallContainer: { flex: 1, paddingHorizontal: 28, paddingTop: 48, paddingBottom: 40 },
  postCallHeading: { fontSize: 30, fontWeight: '500', color: 'rgba(224,242,254,0.95)', fontFamily: 'Baskerville', marginBottom: 6 },
  postCallSub: { fontSize: 14, color: 'rgba(152,212,250,0.55)', fontFamily: 'GillSans-Light', marginBottom: 28 },
  postCallCard: { flex: 1, backgroundColor: 'rgba(152,212,250,0.05)', borderWidth: 1, borderColor: 'rgba(152,212,250,0.10)', borderRadius: 18, padding: 22, marginBottom: 28 },
  postCallLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  postCallLoadingText: { fontSize: 13, color: 'rgba(152,212,250,0.50)', fontFamily: 'GillSans-Light' },
  postCallReflection: { fontSize: 16, color: 'rgba(224,242,254,0.75)', fontFamily: 'Baskerville', lineHeight: 26, fontStyle: 'italic' },
  postCallDoneBtn: { alignSelf: 'center', paddingHorizontal: 40, paddingVertical: 14, backgroundColor: 'rgba(152,212,250,0.10)', borderWidth: 1, borderColor: 'rgba(152,212,250,0.22)', borderRadius: 30 },
  postCallDoneText: { fontSize: 15, color: 'rgba(224,242,254,0.80)', fontFamily: 'GillSans-Light', letterSpacing: 0.5 },
});
