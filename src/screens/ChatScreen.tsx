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

type ConvState = 'loading' | 'speaking' | 'listening' | 'thinking' | 'idle' | 'error';

const VAD_THRESHOLD = -38;
const SILENCE_MS    = 1800;
const MIN_SPEECH_MS = 400;

function formatDate(date: string): string {
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  if (date === todayStr) return 'Today';
  if (date === yesterdayStr) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

export default function ChatScreen({ summary, onClose }: Props) {
  const [messages,   setMessages]   = useState<ConversationMessage[]>([]);
  const [convState,  setConvState]  = useState<ConvState>('loading');
  const [error,      setError]      = useState<string | null>(null);

  const recordingRef    = useRef<Audio.Recording | null>(null);
  const hasSpeechRef    = useRef(false);
  const speechStartRef  = useRef(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef       = useRef(true);
  const messagesRef     = useRef<ConversationMessage[]>([]);
  const scrollRef       = useRef<ScrollView>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── Cleanup ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      activeRef.current = false;
      Speech.stop();
      clearSilenceTimer();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // ── Scroll to bottom ───────────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages, convState]);

  // ── Mic pulse while listening ──────────────────────────────────────────
  useEffect(() => {
    if (convState === 'listening') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 650, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.00, duration: 650, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [convState]);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  };

  // ── speak() → auto-listens when done ──────────────────────────────────
  const speak = useCallback(async (text: string) => {
    if (!activeRef.current) return;
    Speech.stop();
    setConvState('speaking');
    const settings = await StorageService.getSettings();
    Speech.speak(text, {
      rate: 0.92,
      pitch: 1.0,
      ...(settings?.ttsVoiceId ? { voice: settings.ttsVoiceId } : {}),
      onDone:    () => { if (activeRef.current) startListening(); },
      onStopped: () => { if (activeRef.current) startListening(); },
      onError:   () => { if (activeRef.current) startListening(); },
    });
  }, []);

  // ── VAD listening ──────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') { setConvState('error'); setError('Microphone permission denied.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      hasSpeechRef.current   = false;
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
      setMessages(prev => {
        const updated = [...prev, userMsg];
        messagesRef.current = updated;
        const history = updated.slice(1);
        sendMessage(summary, history.slice(0, -1), userText.trim())
          .then(aiText => {
            if (!activeRef.current) return;
            const aiMsg: ConversationMessage = {
              id: `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              role: 'assistant', text: aiText, timestamp: Date.now(),
            };
            setMessages(p => [...p, aiMsg]);
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

  // ── Boot ───────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const opening = await getOpeningMessage(summary);
        if (!activeRef.current) return;
        const msg: ConversationMessage = {
          id: `ai-${Date.now()}`, role: 'assistant', text: opening, timestamp: Date.now(),
        };
        messagesRef.current = [msg];
        setMessages([msg]);
        speak(opening);
      } catch (e: any) {
        setError(e?.message ?? 'Could not start conversation.');
        setConvState('error');
      }
    })();
  }, []);

  // ── Tap mic button ─────────────────────────────────────────────────────
  const handleMicTap = () => {
    if (convState === 'speaking')  { Speech.stop(); startListening(); }
    else if (convState === 'listening') stopAndSend();
    else if (convState === 'error' || convState === 'idle') { setError(null); startListening(); }
  };

  const micDisabled = convState === 'loading' || convState === 'thinking';

  const hint = {
    loading:   'Reading your day…',
    speaking:  'Tap to interrupt',
    listening: 'Listening… tap to send',
    thinking:  'Thinking…',
    idle:      'Tap to speak',
    error:     'Tap to retry',
  }[convState];

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Chat</Text>
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
        {convState === 'loading' && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.65)" />
            <Text style={styles.loadingText}>Reading your day…</Text>
          </View>
        )}

        {messages.map(msg => (
          <View key={msg.id} style={[
            styles.bubble,
            msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI,
          ]}>
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

      {/* Input row */}
      <View style={styles.inputRow}>
        <Text style={styles.hint}>{hint}</Text>
        <TouchableOpacity onPress={handleMicTap} disabled={micDisabled} activeOpacity={0.8}>
          <Animated.View style={[
            styles.micBtn,
            convState === 'listening' && styles.micBtnListening,
            convState === 'speaking'  && styles.micBtnSpeaking,
            micDisabled               && styles.micBtnDisabled,
            { transform: [{ scale: pulseAnim }] },
          ]}>
            {micDisabled
              ? <ActivityIndicator color="rgba(224, 242, 254, 0.8)" size="small" />
              : <Feather
                  name={convState === 'speaking' ? 'volume-2' : 'mic'}
                  size={22}
                  color="rgba(224, 242, 254, 0.90)"
                />
            }
          </Animated.View>
        </TouchableOpacity>
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
  headerTitle: { fontSize: 20, fontWeight: '500', color: 'rgba(224, 242, 254, 0.95)', fontFamily: 'Baskerville' },
  headerSub:   { fontSize: 12, color: 'rgba(152, 212, 250, 0.60)', fontFamily: 'GillSans-Light', marginTop: 2 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(152, 212, 250, 0.08)',
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: 'rgba(152, 212, 250, 0.08)', marginHorizontal: 20 },

  thread: { flex: 1 },
  threadContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, gap: 12 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { fontSize: 13, color: 'rgba(152, 212, 250, 0.55)', fontFamily: 'GillSans-Light', fontStyle: 'italic' },

  bubble:         { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleUser:     { alignSelf: 'flex-end', backgroundColor: '#0929AD', borderBottomRightRadius: 4 },
  bubbleAI:       { alignSelf: 'flex-start', backgroundColor: 'rgba(152, 212, 250, 0.07)', borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.12)', borderBottomLeftRadius: 4 },
  thinkingBubble: { paddingVertical: 12, paddingHorizontal: 18 },
  bubbleText:     { fontSize: 15, lineHeight: 22, fontFamily: 'GillSans-Light' },
  bubbleTextUser: { color: 'rgba(224, 242, 254, 0.95)' },
  bubbleTextAI:   { color: 'rgba(224, 242, 254, 0.85)' },
  errorText:      { fontSize: 13, color: '#e63946', textAlign: 'center', fontFamily: 'GillSans-Light', paddingVertical: 8 },

  inputRow: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  hint: { fontSize: 12, color: 'rgba(152, 212, 250, 0.45)', fontFamily: 'GillSans-Light', letterSpacing: 0.3 },
  micBtn: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#0929AD',
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  micBtnListening: { backgroundColor: '#e94560', borderColor: 'rgba(233, 69, 96, 0.55)' },
  micBtnSpeaking:  { backgroundColor: 'rgba(9, 41, 173, 0.55)', borderColor: 'rgba(152, 212, 250, 0.55)' },
  micBtnDisabled:  { opacity: 0.40 },
});
