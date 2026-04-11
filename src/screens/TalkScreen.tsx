import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ImageBackground,
  Dimensions,
  ActivityIndicator,
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { DailySummary, ConversationMessage } from '../types';
import { transcribeAudio } from '../services/TranscriptionService';
import {
  fetchSentences, getOpeningMessage, generateReflection,
  detectIntent, ConversationIntent, ConversationContext,
} from '../services/ConversationService';
import { StorageService } from '../services/StorageService';
import { synthesizeSpeech } from '../services/ElevenLabsService';
import { MINDS } from '../services/MindService';
import {
  analyzeCallTurn,
  getPendingReentry,
  clearPendingReentry,
  queueReentry,
  DistressTier,
} from '../services/WellbeingService';
import WellbeingResponseModal from '../components/WellbeingResponseModal';

interface Props {
  summary?: DailySummary;   // optional — calls can start without a day summary
  onClose: () => void;
}

type ConvState = 'selecting' | 'connecting' | 'speaking' | 'listening' | 'thinking' | 'post-call' | 'error';

const { width: SW } = Dimensions.get('window');
const AVATAR_SIZE   = 110;
const VAD_THRESHOLD = -38;
const SILENCE_MS    = 1200;
const MIN_SPEECH_MS = 400;

function formatDate(date: string): string {
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  if (date === todayStr) return 'Today';
  if (date === yesterdayStr) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTimer(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Expanding ring component ─────────────────────────────────────────────────
function Ring({ delay, active }: { delay: number; active: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;
  const loop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (active) {
      loop.current = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
      loop.current.start();
    } else {
      loop.current?.stop();
      loop.current = null;
      anim.setValue(0);
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
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
        borderWidth: 1.5,
        borderColor: '#98D4FA',
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

/** Play a local audio URI and resolve when playback finishes. */
function playSoundAndWait(uri: string, onSound?: (s: Audio.Sound) => void): Promise<void> {
  let soundRef: Audio.Sound | undefined;
  return new Promise<void>((resolve, reject) => {
    Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true },
      (status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          soundRef?.unloadAsync().catch(() => {});
          resolve();
        }
      },
    )
      .then(({ sound }) => { soundRef = sound; onSound?.(sound); })
      .catch(reject);
  });
}

// ── Mind picker ──────────────────────────────────────────────────────────────
function MindPicker({
  date,
  onSelect,
  onClose,
}: {
  date: string;
  onSelect: (mindId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <LinearGradient colors={['#02060E', '#041628', '#02060E']} style={StyleSheet.absoluteFill}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={pickerStyles.header}>
          <View>
            <Text style={pickerStyles.title}>Call with</Text>
            <Text style={pickerStyles.sub}>{formatDate(date)}</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="x" size={20} color="rgba(152,212,250,0.60)" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={pickerStyles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Default companion */}
          <TouchableOpacity
            style={pickerStyles.defaultCard}
            onPress={() => onSelect(null)}
            activeOpacity={0.8}
          >
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

          {/* 2-col grid */}
          <View style={pickerStyles.grid}>
            {MINDS.reduce<(typeof MINDS)[]>((rows, m, i) => {
              if (i % 2 === 0) rows.push([m]);
              else rows[rows.length - 1].push(m);
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

export default function TalkScreen({ summary, onClose }: Props) {
  // Standalone calls (no summary) get a minimal stub so ConversationService always has context.
  // useMemo keeps the reference stable so useCallback deps don't thrash.
  const effectiveSummary = useMemo<DailySummary>(() => summary ?? {
    date: new Date().toISOString().split('T')[0],
    summary: 'No journal entries today — open conversation.',
    transcriptCount: 0,
    createdAt: Date.now(),
  }, [summary]);

  const [convState, setConvState]   = useState<ConvState>('selecting');
  const [lastAiText, setLastAiText] = useState('');
  const [callSecs, setCallSecs]     = useState(0);
  const [error, setError]           = useState<string | null>(null);

  // Post-call reflection
  const [postCallReflection, setPostCallReflection] = useState<string | null>(null);
  const [reflectionLoading, setReflectionLoading]   = useState(false);

  const [wellbeingAlert, setWellbeingAlert] = useState<DistressTier | null>(null);
  const wellbeingModalActiveRef             = useRef(false);

  // Metering → volume visualisation
  const meteringAnim = useRef(new Animated.Value(0)).current;

  const recordingRef    = useRef<Audio.Recording | null>(null);
  const hasSpeechRef    = useRef(false);
  const speechStartRef  = useRef(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef       = useRef(true);
  const messagesRef     = useRef<ConversationMessage[]>([]);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSoundRef  = useRef<Audio.Sound | null>(null);

  // Cached settings
  const cachedAnthropicKey  = useRef<string>('');
  const cachedElKey         = useRef<string>('');
  const cachedElVoiceId     = useRef<string>('');
  const cachedTtsVoiceId    = useRef<string | undefined>(undefined);

  // Selected mind — ref so stopAndSend always reads current value without stale closure
  const selectedMindIdRef   = useRef<string | null>(null);
  const convContextRef      = useRef<ConversationContext>({});
  const detectedIntentRef   = useRef<ConversationIntent | null>(null);

  // In-call distress tracking
  const allUserTextsRef  = useRef<string[]>([]);
  const callDistressRef  = useRef<DistressTier>(1);
  const distressChecking = useRef(false);
  const tier3Delivered   = useRef(false);

  // Thinking pulse
  const thinkPulse = useRef(new Animated.Value(1)).current;
  const thinkLoop  = useRef<Animated.CompositeAnimation | null>(null);

  // ── Thinking pulse ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (convState === 'thinking') {
      thinkLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(thinkPulse, { toValue: 1.10, duration: 700, useNativeDriver: true }),
          Animated.timing(thinkPulse, { toValue: 1.00, duration: 700, useNativeDriver: true }),
        ]),
      );
      thinkLoop.current.start();
    } else {
      thinkLoop.current?.stop();
      thinkPulse.setValue(1);
    }
  }, [convState]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      activeRef.current = false;
      Speech.stop();
      clearSilenceTimer();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  };

  // ── speak() ────────────────────────────────────────────────────────────────
  const speak = useCallback(async (text: string) => {
    if (!activeRef.current) return;
    Speech.stop();
    setConvState('speaking');

    const elKey     = cachedElKey.current;
    const elVoiceId = cachedElVoiceId.current;

    if (elKey && elVoiceId) {
      try {
        const uri = await synthesizeSpeech(text, elVoiceId, elKey);
        if (!activeRef.current) return;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            if (status.didJustFinish) {
              sound.unloadAsync().catch(() => {});
              if (activeRef.current) startListening();
            }
          },
        );
        activeSoundRef.current = sound;
      } catch (elErr: any) {
        console.warn('[TalkScreen] ElevenLabs synthesis failed:', elErr?.message ?? elErr);
        if (!activeRef.current) return;
        Speech.speak(text, {
          rate: 0.92,
          onDone:    () => { if (activeRef.current) startListening(); },
          onStopped: () => { if (activeRef.current) startListening(); },
          onError:   () => { if (activeRef.current) startListening(); },
        });
      }
    } else {
      const voiceId = cachedTtsVoiceId.current;
      Speech.speak(text, {
        rate: 0.92,
        pitch: 1.0,
        ...(voiceId ? { voice: voiceId } : {}),
        onDone:    () => { if (activeRef.current) startListening(); },
        onStopped: () => { if (activeRef.current) startListening(); },
        onError:   () => { if (activeRef.current) startListening(); },
      });
    }
  }, []);

  // ── startListening() — VAD hands-free ─────────────────────────────────────
  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    if (wellbeingModalActiveRef.current) return;
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      hasSpeechRef.current   = false;
      speechStartRef.current = 0;
      clearSilenceTimer();
      meteringAnim.setValue(0);

      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        (status) => {
          if (!status.isRecording || !activeRef.current) return;
          const db        = status.metering ?? -160;
          const isTalking = db > VAD_THRESHOLD;

          // Animate volume meter: normalise -60→0 dB to 0→1
          const normalised = Math.max(0, Math.min(1, (db + 60) / 60));
          Animated.timing(meteringAnim, {
            toValue: normalised,
            duration: 80,
            useNativeDriver: true,
          }).start();

          if (isTalking) {
            if (!hasSpeechRef.current) { hasSpeechRef.current = true; speechStartRef.current = Date.now(); }
            clearSilenceTimer();
          } else if (hasSpeechRef.current && !silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => stopAndSend(), SILENCE_MS);
          }
        },
        100,
      );
      recordingRef.current = recording;
      if (activeRef.current) setConvState('listening');
    } catch (e: any) {
      Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
      setError(e?.message ?? 'Could not start listening.');
      setConvState('error');
    }
  }, []);

  // ── stopAndSend() ──────────────────────────────────────────────────────────
  const stopAndSend = useCallback(async () => {
    clearSilenceTimer();
    meteringAnim.setValue(0);
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      const speechDuration = hasSpeechRef.current ? Date.now() - speechStartRef.current : 0;

      if (!uri || !hasSpeechRef.current || speechDuration < MIN_SPEECH_MS) {
        if (activeRef.current) startListening();
        return;
      }
      if (!activeRef.current) return;

      setConvState('thinking');
      const userText = await transcribeAudio(uri);
      if (!userText.trim()) { if (activeRef.current) startListening(); return; }

      allUserTextsRef.current.push(userText.trim());
      const turnCount = allUserTextsRef.current.length;

      const userMsg: ConversationMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'user', text: userText.trim(), timestamp: Date.now(),
      };
      const updated = [...messagesRef.current, userMsg];
      messagesRef.current = updated;

      // Distress check (fire-and-forget)
      if (!distressChecking.current && turnCount >= 2) {
        distressChecking.current = true;
        analyzeCallTurn(allUserTextsRef.current, turnCount)
          .then(tier => {
            if (tier && tier > callDistressRef.current) {
              callDistressRef.current = tier;
              if (tier >= 2 && activeRef.current) {
                wellbeingModalActiveRef.current = true;
                Speech.stop();
                setWellbeingAlert(tier);
              }
            }
          })
          .catch(() => {})
          .finally(() => { distressChecking.current = false; });
      }

      const history   = updated.slice(1);      // strip context-seed msg
      const elKey     = cachedElKey.current;
      const elVoiceId = cachedElVoiceId.current;
      const useEL     = !!(elKey && elVoiceId);
      const mindId    = selectedMindIdRef.current;

      // Intent detection + context injection apply to untangle companion only
      const isCompanion = mindId === null;
      if (isCompanion && detectedIntentRef.current === null) {
        detectedIntentRef.current = await detectIntent(userText.trim());
      }

      const currentTier = callDistressRef.current;

      // Tier 3: verbal crisis response — one delivery only
      if (currentTier === 3 && !tier3Delivered.current) {
        tier3Delivered.current = true;
        const crisisText =
          "I want to stop for a second. What you're sharing sounds really serious " +
          "and I don't want to move past it. Are you safe right now?";
        setLastAiText(crisisText);
        const crisisMsg: ConversationMessage = {
          id: `ai-${Date.now()}-crisis`,
          role: 'assistant', text: crisisText, timestamp: Date.now(),
        };
        messagesRef.current = [...messagesRef.current, crisisMsg];
        setError(null);
        speak(crisisText);
        return;
      }

      const distressTierForTurn: 2 | 3 | undefined =
        (currentTier === 2 || currentTier === 3) ? currentTier : undefined;

      const sentences = await fetchSentences(
        effectiveSummary,
        history.slice(0, -1),
        userText.trim(),
        cachedAnthropicKey.current,
        mindId,
        distressTierForTurn,
        isCompanion ? detectedIntentRef.current ?? undefined : undefined,
        isCompanion ? convContextRef.current : undefined,
      );
      if (!activeRef.current) return;

      const fullText = sentences.join(' ');
      const aiMsg: ConversationMessage = {
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'assistant', text: fullText, timestamp: Date.now(),
      };
      messagesRef.current = [...messagesRef.current, aiMsg];
      setError(null);

      if (!useEL) {
        // expo-speech: show full text upfront
        setLastAiText(fullText);
        speak(fullText);
        return;
      }

      // EL: synthesize all in parallel, play + caption sentence-by-sentence
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      setConvState('speaking');

      const synthPromises = sentences.map(s => synthesizeSpeech(s, elVoiceId!, elKey!));

      for (let i = 0; i < synthPromises.length; i++) {
        if (!activeRef.current) return;
        try {
          const audioUri = await synthPromises[i];
          if (!activeRef.current) return;
          // Update caption to current sentence as it starts playing
          setLastAiText(sentences[i]);
          await playSoundAndWait(audioUri, s => { activeSoundRef.current = s; });
        } catch (synErr: any) {
          console.warn('[TalkScreen] ElevenLabs sentence synthesis failed:', synErr?.message ?? synErr);
        }
      }

      if (activeRef.current) startListening();
    } catch (e: any) {
      if (!activeRef.current) return;
      setError(e?.message ?? 'Recording failed.');
      setConvState('error');
    }
  }, [speak, startListening, effectiveSummary]);

  // ── startBoot() — called after mind selection ──────────────────────────────
  const startBoot = useCallback(async (mindId: string | null) => {
    selectedMindIdRef.current = mindId;
    setConvState('connecting');

    // Start call timer
    timerRef.current = setInterval(() => {
      setCallSecs(s => s + 1);
    }, 1000);

    try {
      // Request mic permission
      let micGranted = false;
      if (Platform.OS === 'android') {
        micGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (!micGranted) {
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: 'Microphone Access',
              message: 'untangle needs the microphone to record your voice for journaling.',
              buttonNeutral: 'Ask Later',
              buttonNegative: 'Deny',
              buttonPositive: 'Allow',
            },
          );
          micGranted = result === PermissionsAndroid.RESULTS.GRANTED;
          if (!micGranted && result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
            Alert.alert(
              'Microphone Access Needed',
              'untangle needs the microphone for voice calls. Please enable it in Settings.',
              [
                { text: 'Not Now', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ],
            );
          }
        }
      } else {
        const { status: existing } = await Audio.getPermissionsAsync();
        micGranted = existing === 'granted';
        if (!micGranted) {
          const { status, canAskAgain } = await Audio.requestPermissionsAsync();
          micGranted = status === 'granted';
          if (!micGranted && !canAskAgain) {
            Alert.alert(
              'Microphone Access Needed',
              'untangle needs the microphone for voice calls. Please enable it in Settings.',
              [
                { text: 'Not Now', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ],
            );
          }
        }
      }
      if (!activeRef.current) return;
      if (!micGranted) {
        setConvState('error');
        setError('Microphone access is required for calls.');
        return;
      }

      // Load settings once
      const settings = await StorageService.getSettings();
      cachedAnthropicKey.current = settings?.anthropicApiKey?.trim() ?? '';
      cachedElKey.current        = settings?.elevenLabsApiKey?.trim() ?? '';
      cachedElVoiceId.current    = settings?.elevenLabsVoiceId?.trim() ?? '';
      cachedTtsVoiceId.current   = settings?.ttsVoiceId;

      // Load context data for intent-aware responses (fire-and-forget; errors are non-fatal)
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [goals, monthlyInsight, whoYouAre, whatYouCare] = await Promise.allSettled([
        StorageService.getGoals(),
        StorageService.getMonthlyInsight(monthKey),
        StorageService.getWhoYouAre(),
        StorageService.getWhatYouCare(),
      ]);
      convContextRef.current = {
        goals:       goals.status === 'fulfilled' ? goals.value ?? undefined : undefined,
        monthlyData: monthlyInsight.status === 'fulfilled' ? monthlyInsight.value?.weeklyData ?? undefined : undefined,
        whoYouAre:   whoYouAre.status === 'fulfilled' ? whoYouAre.value ?? undefined : undefined,
        whatYouCare: whatYouCare.status === 'fulfilled' ? whatYouCare.value ?? undefined : undefined,
      };

      // Check for re-entry from a prior Tier 2/3 call
      const reentry = await getPendingReentry();
      const today   = new Date().toISOString().split('T')[0];
      const hasReentry = reentry && reentry.date < today;

      let opening: string;
      if (hasReentry) {
        await clearPendingReentry();
        opening =
          reentry!.tier === 3
            ? "Last time we spoke, things felt really hard. I've been thinking about you. How are you today?"
            : "Last time we spoke, things felt pretty heavy. How are you today?";
      } else {
        opening = await getOpeningMessage(effectiveSummary, cachedAnthropicKey.current || undefined, mindId);
      }
      if (!activeRef.current) return;

      const msg: ConversationMessage = {
        id: `ai-${Date.now()}`, role: 'assistant', text: opening, timestamp: Date.now(),
      };
      messagesRef.current = [msg];
      setLastAiText(opening);
      speak(opening);
    } catch (e: any) {
      setError(e?.message ?? 'Could not connect.');
      setConvState('error');
    }
  }, [speak, effectiveSummary]);

  // ── handleEndCall ──────────────────────────────────────────────────────────
  const handleEndCall = useCallback(() => {
    activeRef.current = false;
    Speech.stop();
    activeSoundRef.current?.stopAsync().catch(() => {});
    activeSoundRef.current?.unloadAsync().catch(() => {});
    activeSoundRef.current = null;
    clearSilenceTimer();
    recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    const maxTier = callDistressRef.current;
    if (maxTier >= 2) {
      const today = new Date().toISOString().split('T')[0];
      queueReentry(maxTier as DistressTier, today).catch(() => {});
    }

    const userMessages = messagesRef.current.filter(m => m.role === 'user');
    if (userMessages.length > 0 && cachedAnthropicKey.current) {
      // Show post-call overlay and generate reflection in background
      setConvState('post-call');
      setReflectionLoading(true);
      generateReflection(effectiveSummary, messagesRef.current, cachedAnthropicKey.current, 'call')
        .then(reflection => {
          setPostCallReflection(reflection);
          setReflectionLoading(false);
          StorageService.saveSummary({ ...effectiveSummary, reflectionText: reflection }).catch(() => {});
        })
        .catch(() => {
          setReflectionLoading(false);
          onClose();
        });
    } else {
      onClose();
    }
  }, [effectiveSummary, onClose]);

  // ── handleAvatarTap ────────────────────────────────────────────────────────
  const handleAvatarTap = () => {
    if (convState === 'speaking') {
      // Stop both expo-speech and any active ElevenLabs sound
      Speech.stop();
      activeSoundRef.current?.stopAsync().catch(() => {});
      activeSoundRef.current?.unloadAsync().catch(() => {});
      activeSoundRef.current = null;
      startListening();
    } else if (convState === 'listening') {
      stopAndSend();
    } else if (convState === 'error') {
      setError(null);
      startListening();
    }
  };

  // ── Derived labels / flags ─────────────────────────────────────────────────
  const stateLabel = {
    selecting:  '',
    connecting: 'Connecting…',
    speaking:   'Speaking',
    listening:  'Listening',
    thinking:   'Thinking…',
    'post-call': '',
    error:      'Tap to retry',
  }[convState];

  const ringsActive = convState === 'speaking' || convState === 'listening';

  // Volume-driven avatar scale during listening
  const micScale = meteringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.14],
  });
  const avatarScale = convState === 'listening'
    ? Animated.multiply(thinkPulse, micScale)
    : thinkPulse;

  // ── Render: mind picker ────────────────────────────────────────────────────
  if (convState === 'selecting') {
    return (
      <MindPicker
        date={effectiveSummary.date}
        onSelect={startBoot}
        onClose={onClose}
      />
    );
  }

  // ── Render: post-call reflection overlay ───────────────────────────────────
  if (convState === 'post-call') {
    return (
      <ImageBackground
        source={require('../../assets/jellyfish.jpg')}
        style={styles.bg}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(2,6,14,0.65)', 'rgba(2,6,14,0.92)', '#02060E']}
          style={StyleSheet.absoluteFill}
        />
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

  // ── Render: in-call ────────────────────────────────────────────────────────
  return (
    <ImageBackground
      source={require('../../assets/jellyfish.jpg')}
      style={styles.bg}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(2,6,14,0.55)', 'rgba(2,6,14,0.82)', '#02060E']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <Text style={styles.timer}>{formatTimer(callSecs)}</Text>
          <TouchableOpacity
            onPress={handleEndCall}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="chevron-down" size={22} color="rgba(152, 212, 250, 0.60)" />
          </TouchableOpacity>
        </View>

        {/* ── Caller info ── */}
        <View style={styles.callerSection}>
          <Text style={styles.callerName}>untangle</Text>
          <Text style={styles.callerSub}>{formatDate(effectiveSummary.date)}</Text>
        </View>

        {/* ── Avatar with rings ── */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handleAvatarTap} activeOpacity={0.85} style={styles.avatarWrap}>
            <Ring delay={0}    active={ringsActive} />
            <Ring delay={600}  active={ringsActive} />
            <Ring delay={1200} active={ringsActive} />

            <Animated.View style={[styles.avatar, { transform: [{ scale: avatarScale }] }]}>
              <LinearGradient
                colors={['rgba(9,41,173,0.75)', 'rgba(2,6,14,0.90)']}
                style={styles.avatarGradient}
              >
                <Feather
                  name={
                    convState === 'listening' ? 'mic' :
                    convState === 'thinking'  ? 'loader' :
                    convState === 'error'     ? 'wifi-off' :
                    'volume-2'
                  }
                  size={36}
                  color={
                    convState === 'listening' ? '#e94560' :
                    convState === 'error'     ? '#e63946' :
                    'rgba(224, 242, 254, 0.90)'
                  }
                />
              </LinearGradient>
            </Animated.View>
          </TouchableOpacity>

          {/* State pill */}
          <View style={styles.statePill}>
            <View style={[
              styles.stateDot,
              convState === 'listening' && styles.stateDotListening,
              convState === 'speaking'  && styles.stateDotSpeaking,
              convState === 'error'     && styles.stateDotError,
            ]} />
            <Text style={styles.stateLabel}>{stateLabel}</Text>
          </View>

          {/* Tap to interrupt hint */}
          {convState === 'speaking' && (
            <Text style={styles.interruptHint}>tap to interrupt</Text>
          )}
        </View>

        {/* ── Last AI line ── */}
        <View style={styles.captionSection}>
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : lastAiText ? (
            <Text style={styles.caption} numberOfLines={4}>
              "{lastAiText}"
            </Text>
          ) : null}
        </View>

        {/* ── End call button ── */}
        <View style={styles.endCallSection}>
          <TouchableOpacity
            style={styles.endCallBtn}
            onPress={handleEndCall}
            activeOpacity={0.85}
          >
            <Feather name="phone-off" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.endCallLabel}>End call</Text>
        </View>
      </SafeAreaView>

      {/* Wellbeing modal */}
      {wellbeingAlert && (
        <WellbeingResponseModal
          visible
          tier={wellbeingAlert}
          onContinue={() => {
            wellbeingModalActiveRef.current = false;
            setWellbeingAlert(null);
            if (activeRef.current) startListening();
          }}
          onDismiss={() => {
            wellbeingModalActiveRef.current = false;
            setWellbeingAlert(null);
            if (activeRef.current) startListening();
          }}
        />
      )}
    </ImageBackground>
  );
}

// ── Mind picker styles ────────────────────────────────────────────────────────
const pickerStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'Baskerville',
  },
  sub: {
    fontSize: 14,
    color: 'rgba(152, 212, 250, 0.55)',
    fontFamily: 'GillSans-Light',
    marginTop: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  defaultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(152, 212, 250, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  defaultLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  defaultSymbol: {
    fontSize: 36,
    color: 'rgba(152, 212, 250, 0.90)',
  },
  defaultName: {
    fontSize: 17,
    color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'Baskerville',
    marginBottom: 3,
  },
  defaultDesc: {
    fontSize: 12,
    color: 'rgba(152, 212, 250, 0.65)',
    fontFamily: 'GillSans-Light',
    lineHeight: 17,
  },
  orLabel: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(152, 212, 250, 0.35)',
    fontFamily: 'GillSans-Light',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  mindCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    minHeight: 100,
  },
  mindSymbol: { fontSize: 20, marginBottom: 8 },
  mindName: {
    fontSize: 14,
    color: 'rgba(224, 242, 254, 0.92)',
    fontFamily: 'Baskerville',
    marginBottom: 3,
  },
  mindEra: {
    fontSize: 11,
    color: 'rgba(152, 212, 250, 0.50)',
    fontFamily: 'GillSans-Light',
  },
});

// ── Main call styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  bg:   { flex: 1, backgroundColor: '#02060E' },
  safe: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  timer: { fontSize: 15, color: 'rgba(224, 242, 254, 0.55)', fontFamily: 'GillSans-Light', letterSpacing: 1 },

  // Caller info
  callerSection: { alignItems: 'center', marginTop: 32 },
  callerName: {
    fontSize: 32,
    fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'Baskerville',
    letterSpacing: 0.5,
  },
  callerSub: {
    fontSize: 14,
    color: 'rgba(152, 212, 250, 0.60)',
    fontFamily: 'GillSans-Light',
    marginTop: 6,
  },

  // Avatar
  avatarSection: { alignItems: 'center', marginTop: 52 },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(152, 212, 250, 0.30)',
  },
  avatarGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // State pill
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(152, 212, 250, 0.07)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.12)',
  },
  stateDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: 'rgba(152, 212, 250, 0.50)',
  },
  stateDotListening: { backgroundColor: '#e94560' },
  stateDotSpeaking:  { backgroundColor: '#98D4FA' },
  stateDotError:     { backgroundColor: '#e63946' },
  stateLabel: { fontSize: 13, color: 'rgba(224, 242, 254, 0.70)', fontFamily: 'GillSans-Light' },

  interruptHint: {
    marginTop: 10,
    fontSize: 11,
    color: 'rgba(152, 212, 250, 0.35)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.5,
  },

  // Caption
  captionSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  caption: {
    fontSize: 16,
    color: 'rgba(224, 242, 254, 0.50)',
    fontFamily: 'Baskerville',
    textAlign: 'center',
    lineHeight: 26,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 14,
    color: '#e63946',
    textAlign: 'center',
    fontFamily: 'GillSans-Light',
  },

  // End call
  endCallSection: { alignItems: 'center', paddingBottom: 40 },
  endCallBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#e94560',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  endCallLabel: {
    marginTop: 10,
    fontSize: 13,
    color: 'rgba(224, 242, 254, 0.45)',
    fontFamily: 'GillSans-Light',
  },

  // Post-call reflection
  postCallContainer: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 40,
  },
  postCallHeading: {
    fontSize: 30,
    fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'Baskerville',
    marginBottom: 6,
  },
  postCallSub: {
    fontSize: 14,
    color: 'rgba(152, 212, 250, 0.55)',
    fontFamily: 'GillSans-Light',
    marginBottom: 28,
  },
  postCallCard: {
    flex: 1,
    backgroundColor: 'rgba(152, 212, 250, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.10)',
    borderRadius: 18,
    padding: 22,
    marginBottom: 28,
  },
  postCallLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  postCallLoadingText: {
    fontSize: 13,
    color: 'rgba(152, 212, 250, 0.50)',
    fontFamily: 'GillSans-Light',
  },
  postCallReflection: {
    fontSize: 16,
    color: 'rgba(224, 242, 254, 0.75)',
    fontFamily: 'Baskerville',
    lineHeight: 26,
    fontStyle: 'italic',
  },
  postCallDoneBtn: {
    alignSelf: 'center',
    paddingHorizontal: 40,
    paddingVertical: 14,
    backgroundColor: 'rgba(152, 212, 250, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.22)',
    borderRadius: 30,
  },
  postCallDoneText: {
    fontSize: 15,
    color: 'rgba(224, 242, 254, 0.80)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.5,
  },
});
