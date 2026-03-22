import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { DailySummary, ConversationMessage } from '../types';
import { transcribeAudio } from '../services/TranscriptionService';
import { fetchSentences, getOpeningMessage, generateReflection } from '../services/ConversationService';
import { StorageService } from '../services/StorageService';
import { synthesizeSpeech } from '../services/ElevenLabsService';

interface Props {
  summary: DailySummary;
  onClose: () => void;
}

type ConvState = 'connecting' | 'speaking' | 'listening' | 'thinking' | 'error';

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
      anim.setValue(0);
    }
    return () => { loop.current?.stop(); };
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

/** Play a local audio URI and resolve when playback finishes.
 *  Callback is passed directly to createAsync to avoid a race where
 *  a short clip finishes before setOnPlaybackStatusUpdate is called. */
function playSoundAndWait(uri: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true },
      (status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          // sound ref captured via closure below
          soundRef?.unloadAsync().catch(() => {});
          resolve();
        }
      },
    )
      .then(({ sound }) => { soundRef = sound; })
      .catch(reject);
    let soundRef: Audio.Sound | undefined;
  });
}

export default function TalkScreen({ summary, onClose }: Props) {
  const [convState, setConvState]         = useState<ConvState>('connecting');
  const [lastAiText, setLastAiText]       = useState('');
  const [callSecs, setCallSecs]           = useState(0);
  const [error, setError]                 = useState<string | null>(null);
  const [savingReflection, setSaving]     = useState(false);

  const recordingRef    = useRef<Audio.Recording | null>(null);
  const hasSpeechRef    = useRef(false);
  const speechStartRef  = useRef(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef       = useRef(true);
  const messagesRef     = useRef<ConversationMessage[]>([]);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cached settings — loaded once at boot to avoid per-turn storage reads
  const cachedAnthropicKey  = useRef<string>('');
  const cachedElKey         = useRef<string>('');
  const cachedElVoiceId     = useRef<string>('');
  const cachedTtsVoiceId    = useRef<string | undefined>(undefined);

  // Avatar pulse for thinking
  const thinkPulse = useRef(new Animated.Value(1)).current;
  const thinkLoop  = useRef<Animated.CompositeAnimation | null>(null);

  // ── Call timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCallSecs(s => s + 1);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Thinking pulse ─────────────────────────────────────────────────────
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

  // ── Cleanup ────────────────────────────────────────────────────────────
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

  // ── speak() → ElevenLabs if configured, else expo-speech ────────────────
  const speak = useCallback(async (text: string) => {
    if (!activeRef.current) return;
    Speech.stop();
    setConvState('speaking');

    // Use cached settings — no storage round-trip per turn
    const elKey     = cachedElKey.current;
    const elVoiceId = cachedElVoiceId.current;

    if (elKey && elVoiceId) {
      // ── ElevenLabs path ────────────────────────────────────────────
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
      } catch {
        // ElevenLabs failed — fall through to expo-speech
        if (!activeRef.current) return;
        Speech.speak(text, {
          rate: 0.92,
          onDone:    () => { if (activeRef.current) startListening(); },
          onStopped: () => { if (activeRef.current) startListening(); },
          onError:   () => { if (activeRef.current) startListening(); },
        });
      }
    } else {
      // ── expo-speech fallback ───────────────────────────────────────
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

  // ── startListening() — VAD hands-free ─────────────────────────────────
  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      hasSpeechRef.current  = false;
      speechStartRef.current = 0;
      clearSilenceTimer();

      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        (status) => {
          if (!status.isRecording || !activeRef.current) return;
          const isTalking = (status.metering ?? -160) > VAD_THRESHOLD;
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
      setError(e?.message ?? 'Could not start listening.');
      setConvState('error');
    }
  }, []);

  // ── stopAndSend() ──────────────────────────────────────────────────────
  const stopAndSend = useCallback(async () => {
    clearSilenceTimer();
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

      const userMsg: ConversationMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'user', text: userText.trim(), timestamp: Date.now(),
      };
      const updated = [...messagesRef.current, userMsg];
      messagesRef.current = updated;

      const history   = updated.slice(1);   // strip context-seed msg
      const elKey     = cachedElKey.current;
      const elVoiceId = cachedElVoiceId.current;
      const useEL     = !!(elKey && elVoiceId);
      const apiKey    = cachedAnthropicKey.current;

      // ── Get full Claude response, split into sentences ────────────────
      const sentences = await fetchSentences(summary, history.slice(0, -1), userText.trim(), apiKey);
      if (!activeRef.current) return;

      const fullText = sentences.join(' ');
      setLastAiText(fullText);

      // Save AI message
      const aiMsg: ConversationMessage = {
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'assistant', text: fullText, timestamp: Date.now(),
      };
      messagesRef.current = [...messagesRef.current, aiMsg];
      setError(null);

      if (!useEL) {
        speak(fullText);
        return;
      }

      // ── Fire all EL synthesis calls in parallel, play in order ────────
      // All sentences are synthesized simultaneously. Sentence 1's audio
      // is usually ready well before sentence 2 finishes playing.
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      setConvState('speaking');

      const synthPromises = sentences.map(s => synthesizeSpeech(s, elVoiceId!, elKey!));

      for (const uriPromise of synthPromises) {
        if (!activeRef.current) return;
        try {
          const audioUri = await uriPromise;
          if (activeRef.current) await playSoundAndWait(audioUri);
        } catch { /* skip any sentence whose synthesis failed */ }
      }

      if (activeRef.current) startListening();
    } catch (e: any) {
      if (!activeRef.current) return;
      setError(e?.message ?? 'Recording failed.');
      setConvState('error');
    }
  }, [speak, startListening, summary]);

  // ── Boot ───────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        // Request mic permission immediately — before any playback starts,
        // so the OS dialog appears as soon as the screen opens.
        const { status, canAskAgain } = await Audio.requestPermissionsAsync();
        if (!activeRef.current) return;
        if (status !== 'granted') {
          setConvState('error');
          setError('Microphone access is required for calls.');
          if (!canAskAgain) {
            Alert.alert(
              'Microphone Access Needed',
              'untangle needs the microphone for voice calls. Please enable it in Settings.',
              [
                { text: 'Not Now', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ],
            );
          }
          return;
        }

        // Load settings once — cache for the lifetime of this call
        const settings = await StorageService.getSettings();
        cachedAnthropicKey.current = settings?.anthropicApiKey?.trim() ?? '';
        cachedElKey.current        = settings?.elevenLabsApiKey?.trim() ?? '';
        cachedElVoiceId.current    = settings?.elevenLabsVoiceId?.trim() ?? '';
        cachedTtsVoiceId.current   = settings?.ttsVoiceId;

        const opening = await getOpeningMessage(summary, cachedAnthropicKey.current || undefined);
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
    })();
  }, []);

  // ── Button tap ─────────────────────────────────────────────────────────
  const handleEndCall = async () => {
    Speech.stop();
    clearSilenceTimer();
    recordingRef.current?.stopAndUnloadAsync().catch(() => {});

    const userMessages = messagesRef.current.filter(m => m.role === 'user');
    if (userMessages.length > 0 && cachedAnthropicKey.current) {
      setSaving(true);
      try {
        const reflection = await generateReflection(
          summary, messagesRef.current, cachedAnthropicKey.current, 'call',
        );
        await StorageService.saveSummary({ ...summary, reflectionText: reflection });
      } catch { /* reflection is best-effort */ }
    }

    onClose();
  };

  const handleAvatarTap = () => {
    if (convState === 'speaking') { Speech.stop(); startListening(); }
    else if (convState === 'listening') stopAndSend();
    else if (convState === 'error') { setError(null); startListening(); }
  };

  // ── Derived labels ─────────────────────────────────────────────────────
  const stateLabel = {
    connecting: 'Connecting…',
    speaking:   'Speaking',
    listening:  'Listening',
    thinking:   'Thinking…',
    error:      'Tap to retry',
  }[convState];

  const ringsActive = convState === 'speaking' || convState === 'listening';

  // ── Render ─────────────────────────────────────────────────────────────
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
          <Text style={styles.callerSub}>{formatDate(summary.date)}</Text>
        </View>

        {/* ── Avatar with rings ── */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handleAvatarTap} activeOpacity={0.85} style={styles.avatarWrap}>
            {/* Expanding rings */}
            <Ring delay={0}    active={ringsActive} />
            <Ring delay={600}  active={ringsActive} />
            <Ring delay={1200} active={ringsActive} />

            {/* Avatar circle */}
            <Animated.View style={[styles.avatar, { transform: [{ scale: thinkPulse }] }]}>
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

          {/* State label */}
          <View style={styles.statePill}>
            <View style={[
              styles.stateDot,
              convState === 'listening' && styles.stateDotListening,
              convState === 'speaking'  && styles.stateDotSpeaking,
              convState === 'error'     && styles.stateDotError,
            ]} />
            <Text style={styles.stateLabel}>{stateLabel}</Text>
          </View>
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
            style={[styles.endCallBtn, savingReflection && { opacity: 0.6 }]}
            onPress={handleEndCall}
            disabled={savingReflection}
            activeOpacity={0.85}
          >
            {savingReflection
              ? <ActivityIndicator color="#fff" size="small" />
              : <Feather name="phone-off" size={26} color="#fff" />
            }
          </TouchableOpacity>
          <Text style={styles.endCallLabel}>
            {savingReflection ? 'Saving reflection…' : 'End call'}
          </Text>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

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
});
