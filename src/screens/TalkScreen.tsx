import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { DailySummary, ConversationMessage } from '../types';
import { transcribeAudio } from '../services/TranscriptionService';
import { sendMessage, getOpeningMessage } from '../services/ConversationService';
import { StorageService } from '../services/StorageService';

interface Props {
  summary: DailySummary;
  onClose: () => void;
}

type ConvState = 'loading' | 'speaking' | 'listening' | 'thinking' | 'paused' | 'error';

const VAD_THRESHOLD = -38;      // dB — louder than this = speech
const SILENCE_MS    = 1800;     // ms of silence before auto-send
const MIN_SPEECH_MS = 400;      // ignore clips shorter than this

function formatDate(date: string): string {
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  if (date === todayStr) return 'Today';
  if (date === yesterdayStr) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

export default function TalkScreen({ summary, onClose }: Props) {
  const [messages, setMessages]     = useState<ConversationMessage[]>([]);
  const [convState, setConvState]   = useState<ConvState>('loading');
  const [error, setError]           = useState<string | null>(null);

  // Refs — stable across renders, safe to use inside Audio callbacks
  const recordingRef      = useRef<Audio.Recording | null>(null);
  const hasSpeechRef      = useRef(false);
  const speechStartRef    = useRef(0);
  const silenceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef         = useRef(true);   // false once screen is closing
  const messagesRef       = useRef<ConversationMessage[]>([]);

  const scrollRef  = useRef<ScrollView>(null);
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulseLoop  = useRef<Animated.CompositeAnimation | null>(null);

  // Keep messagesRef in sync so callbacks can read latest messages
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      activeRef.current = false;
      Speech.stop();
      clearSilenceTimer();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // ── Scroll to bottom ────────────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages, convState]);

  // ── Pulse animation while listening ────────────────────────────────────
  useEffect(() => {
    if (convState === 'listening') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.20, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.00, duration: 700, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [convState]);

  // ── Helpers ─────────────────────────────────────────────────────────────
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  // ── speak() → auto-starts listening when done ───────────────────────────
  const speak = useCallback(async (text: string) => {
    if (!activeRef.current) return;
    Speech.stop();
    setConvState('speaking');
    const settings = await StorageService.getSettings();
    const voiceId = settings?.ttsVoiceId;
    Speech.speak(text, {
      rate: 0.92,
      pitch: 1.0,
      ...(voiceId ? { voice: voiceId } : {}),
      onDone:    () => { if (activeRef.current) startListening(); },
      onStopped: () => { if (activeRef.current) startListening(); },
      onError:   () => { if (activeRef.current) startListening(); },
    });
  }, []);

  // ── startListening() — VAD-based hands-free capture ─────────────────────
  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('Microphone permission denied.');
        setConvState('error');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      hasSpeechRef.current  = false;
      speechStartRef.current = 0;
      clearSilenceTimer();

      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        (status) => {
          if (!status.isRecording || !activeRef.current) return;
          const db = status.metering ?? -160;
          const isTalking = db > VAD_THRESHOLD;

          if (isTalking) {
            if (!hasSpeechRef.current) {
              hasSpeechRef.current = true;
              speechStartRef.current = Date.now();
            }
            clearSilenceTimer();
          } else if (hasSpeechRef.current && !silenceTimerRef.current) {
            // Speech detected earlier — start silence countdown
            silenceTimerRef.current = setTimeout(() => {
              stopAndSend();
            }, SILENCE_MS);
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

  // ── stopAndSend() — stop mic, transcribe, get AI reply ──────────────────
  const stopAndSend = useCallback(async () => {
    clearSilenceTimer();
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      const speechDuration = hasSpeechRef.current
        ? Date.now() - speechStartRef.current
        : 0;

      // Too short or no speech detected → restart listening quietly
      if (!uri || !hasSpeechRef.current || speechDuration < MIN_SPEECH_MS) {
        if (activeRef.current) startListening();
        return;
      }

      if (!activeRef.current) return;
      setConvState('thinking');

      const userText = await transcribeAudio(uri);
      if (!userText.trim()) {
        if (activeRef.current) startListening();
        return;
      }

      const userMsg: ConversationMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'user',
        text: userText.trim(),
        timestamp: Date.now(),
      };

      setMessages(prev => {
        const updated = [...prev, userMsg];
        messagesRef.current = updated;

        // history: skip the seeded opening assistant message
        const history = updated.slice(1);
        sendMessage(summary, history.slice(0, -1), userText.trim())
          .then(aiText => {
            if (!activeRef.current) return;
            const aiMsg: ConversationMessage = {
              id: `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              role: 'assistant',
              text: aiText,
              timestamp: Date.now(),
            };
            setMessages(prev2 => [...prev2, aiMsg]);
            setError(null);
            speak(aiText);
          })
          .catch(e => {
            if (!activeRef.current) return;
            setError(e?.message ?? 'Could not get response.');
            setConvState('error');
          });

        return updated;
      });
    } catch (e: any) {
      if (!activeRef.current) return;
      setError(e?.message ?? 'Recording failed.');
      setConvState('error');
    }
  }, [speak, startListening, summary]);

  // ── Boot: load opening message then speak it ─────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const opening = await getOpeningMessage(summary);
        if (!activeRef.current) return;
        const msg: ConversationMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: opening,
          timestamp: Date.now(),
        };
        setMessages([msg]);
        speak(opening);
      } catch (e: any) {
        setError(e?.message ?? 'Could not start conversation.');
        setConvState('error');
      }
    })();
  }, []);

  // ── Tap button handler ───────────────────────────────────────────────────
  const handleButtonPress = () => {
    if (convState === 'speaking') {
      // Interrupt AI, start listening immediately
      Speech.stop();
      startListening();
    } else if (convState === 'listening') {
      // Force-stop and send what was captured (or cancel if no speech yet)
      stopAndSend();
    } else if (convState === 'error') {
      setError(null);
      startListening();
    } else if (convState === 'paused') {
      startListening();
    }
  };

  // ── Derived UI labels ────────────────────────────────────────────────────
  const hint = {
    loading:   'Reading your day…',
    speaking:  'Tap to interrupt',
    listening: 'Listening… tap to send early',
    thinking:  'Thinking…',
    paused:    'Tap to resume',
    error:     'Tap to retry',
  }[convState];

  const btnIcon = {
    loading:   'loader' as const,
    speaking:  'volume-2' as const,
    listening: 'mic' as const,
    thinking:  'loader' as const,
    paused:    'play' as const,
    error:     'refresh-cw' as const,
  }[convState];

  const btnDisabled = convState === 'loading' || convState === 'thinking';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Reflect</Text>
          <Text style={styles.headerSub}>{formatDate(summary.date)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => { Speech.stop(); onClose(); }}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="x" size={18} color="rgba(152, 212, 250, 0.70)" />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* Chat thread */}
      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.map(msg => (
          <View
            key={msg.id}
            style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}
          >
            <Text style={[
              styles.bubbleText,
              msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAI,
            ]}>
              {msg.text}
            </Text>
          </View>
        ))}

        {convState === 'thinking' && (
          <View style={[styles.bubble, styles.bubbleAI, styles.thinkingBubble]}>
            <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.65)" />
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      {/* Control row */}
      <View style={styles.inputRow}>
        <Text style={styles.hint}>{hint}</Text>

        <TouchableOpacity onPress={handleButtonPress} disabled={btnDisabled} activeOpacity={0.8}>
          <Animated.View style={[
            styles.micBtn,
            convState === 'listening'  && styles.micBtnListening,
            convState === 'speaking'   && styles.micBtnSpeaking,
            convState === 'error'      && styles.micBtnError,
            btnDisabled                && styles.micBtnDisabled,
            { transform: [{ scale: pulseAnim }] },
          ]}>
            {convState === 'loading' || convState === 'thinking'
              ? <ActivityIndicator color="rgba(224, 242, 254, 0.8)" size="small" />
              : <Feather name={btnIcon} size={22} color="rgba(224, 242, 254, 0.90)" />
            }
          </Animated.View>
        </TouchableOpacity>

        {/* Listening waveform dots */}
        {convState === 'listening' && (
          <View style={styles.waveRow}>
            {[0, 1, 2, 3, 4].map(i => (
              <View key={i} style={[styles.waveDot, { opacity: 0.3 + i * 0.14 }]} />
            ))}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'Baskerville',
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(152, 212, 250, 0.60)',
    fontFamily: 'GillSans-Light',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(152, 212, 250, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: 'rgba(152, 212, 250, 0.08)', marginHorizontal: 20 },

  // Thread
  thread: { flex: 1 },
  threadContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, gap: 12 },

  // Bubbles
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#0929AD',
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(152, 212, 250, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.12)',
    borderBottomLeftRadius: 4,
  },
  thinkingBubble: { paddingVertical: 12, paddingHorizontal: 18 },
  bubbleText: { fontSize: 15, lineHeight: 22, fontFamily: 'GillSans-Light' },
  bubbleTextUser: { color: 'rgba(224, 242, 254, 0.95)' },
  bubbleTextAI:   { color: 'rgba(224, 242, 254, 0.85)' },
  errorText: {
    fontSize: 13,
    color: '#e63946',
    textAlign: 'center',
    fontFamily: 'GillSans-Light',
    paddingVertical: 8,
  },

  // Control row
  inputRow: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  hint: {
    fontSize: 12,
    color: 'rgba(152, 212, 250, 0.45)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.3,
  },
  micBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#0929AD',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnListening: {
    backgroundColor: '#e94560',
    borderColor: 'rgba(233, 69, 96, 0.55)',
  },
  micBtnSpeaking: {
    backgroundColor: 'rgba(9, 41, 173, 0.55)',
    borderColor: 'rgba(152, 212, 250, 0.55)',
  },
  micBtnError: {
    backgroundColor: 'rgba(230, 57, 70, 0.20)',
    borderColor: 'rgba(230, 57, 70, 0.50)',
  },
  micBtnDisabled: { opacity: 0.40 },

  // Waveform dots shown while listening
  waveRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  waveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#98D4FA',
  },
});
