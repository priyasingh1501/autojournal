import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Pressable,
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
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isLoadingOpening, setIsLoadingOpening] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // ── Speak AI text ────────────────────────────────────────────────────────
  const speak = async (text: string) => {
    Speech.stop();
    setIsSpeaking(true);
    const settings = await StorageService.getSettings();
    const voiceId = settings?.ttsVoiceId;
    Speech.speak(text, {
      rate: 0.92,
      pitch: 1.0,
      ...(voiceId ? { voice: voiceId } : {}),
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  // Stop speech when the screen closes
  useEffect(() => {
    return () => { Speech.stop(); };
  }, []);

  // ── Load opening message ────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const opening = await getOpeningMessage(summary);
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
      } finally {
        setIsLoadingOpening(false);
      }
    })();
  }, []);

  // ── Scroll to bottom when messages change ───────────────────────────────
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, isThinking]);

  // ── Pulse animation while recording ────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.22, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // ── Recording ───────────────────────────────────────────────────────────
  const startRecording = async () => {
    if (isThinking || isLoadingOpening) return;
    // Stop any ongoing speech so the user can speak
    Speech.stop();
    setIsSpeaking(false);
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('Microphone permission denied.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e: any) {
      setError('Could not start recording.');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    const rec = recordingRef.current;
    recordingRef.current = null;

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) return;

      setIsThinking(true);

      // Transcribe
      const userText = await transcribeAudio(uri);
      if (!userText.trim()) {
        setIsThinking(false);
        return;
      }

      // Add user message
      const userMsg: ConversationMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'user',
        text: userText.trim(),
        timestamp: Date.now(),
      };
      setMessages(prev => {
        const updated = [...prev, userMsg];
        // Send to AI with history (exclude the opening assistant message from history
        // since it's already in the context seed in ConversationService)
        const history = updated.slice(1); // skip opening assistant message
        sendMessage(summary, history.slice(0, -1), userText.trim())
          .then(aiText => {
            const aiMsg: ConversationMessage = {
              id: `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              role: 'assistant',
              text: aiText,
              timestamp: Date.now(),
            };
            setMessages(prev2 => [...prev2, aiMsg]);
            setIsThinking(false);
            setError(null);
            speak(aiText);
          })
          .catch(e => {
            setError(e?.message ?? 'Could not get response.');
            setIsThinking(false);
          });
        return updated;
      });
    } catch (e: any) {
      setError(e?.message ?? 'Recording failed.');
      setIsThinking(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Reflect</Text>
          <Text style={styles.headerSub}>{formatDate(summary.date)}</Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="x" size={18} color="rgba(152, 212, 250, 0.70)" />
        </TouchableOpacity>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Chat thread */}
      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoadingOpening ? (
          <View style={styles.openingLoader}>
            <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.65)" />
            <Text style={styles.openingLoaderText}>Reading your day…</Text>
          </View>
        ) : (
          messages.map(msg => (
            <View
              key={msg.id}
              style={[
                styles.bubble,
                msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI,
              ]}
            >
              <Text style={[
                styles.bubbleText,
                msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAI,
              ]}>
                {msg.text}
              </Text>
            </View>
          ))
        )}

        {/* Thinking indicator */}
        {isThinking && (
          <View style={[styles.bubble, styles.bubbleAI, styles.thinkingBubble]}>
            <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.65)" />
          </View>
        )}

        {/* Error */}
        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}
      </ScrollView>

      {/* Mic button */}
      <View style={styles.inputRow}>
        <Text style={styles.hint}>
          {isRecording
            ? 'Release to send'
            : isThinking
            ? 'Thinking…'
            : isSpeaking
            ? 'Hold to interrupt'
            : 'Hold to speak'}
        </Text>
        <Pressable
          onPressIn={startRecording}
          onPressOut={stopRecording}
          disabled={isThinking || isLoadingOpening}
        >
          <Animated.View style={[
            styles.micBtn,
            isRecording && styles.micBtnActive,
            isSpeaking && styles.micBtnSpeaking,
            (isThinking || isLoadingOpening) && styles.micBtnDisabled,
            { transform: [{ scale: pulseAnim }] },
          ]}>
            {isThinking
              ? <ActivityIndicator color="rgba(224, 242, 254, 0.8)" size="small" />
              : <Feather
                  name={isRecording ? 'square' : isSpeaking ? 'volume-2' : 'mic'}
                  size={22}
                  color="rgba(224, 242, 254, 0.90)"
                />
            }
          </Animated.View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02060E',
  },
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
  divider: {
    height: 1,
    backgroundColor: 'rgba(152, 212, 250, 0.08)',
    marginHorizontal: 20,
  },

  // Thread
  thread: { flex: 1 },
  threadContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
  },
  openingLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  openingLoaderText: {
    fontSize: 13,
    color: 'rgba(152, 212, 250, 0.55)',
    fontFamily: 'GillSans-Light',
    fontStyle: 'italic',
  },

  // Bubbles
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
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
  thinkingBubble: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'GillSans-Light',
  },
  bubbleTextUser: {
    color: 'rgba(224, 242, 254, 0.95)',
  },
  bubbleTextAI: {
    color: 'rgba(224, 242, 254, 0.85)',
  },
  errorText: {
    fontSize: 13,
    color: '#e63946',
    textAlign: 'center',
    fontFamily: 'GillSans-Light',
    paddingVertical: 8,
  },

  // Input row
  inputRow: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
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
  micBtnActive: {
    backgroundColor: '#e94560',
    borderColor: 'rgba(233, 69, 96, 0.50)',
  },
  micBtnSpeaking: {
    backgroundColor: 'rgba(9, 41, 173, 0.55)',
    borderColor: 'rgba(152, 212, 250, 0.55)',
  },
  micBtnDisabled: {
    opacity: 0.45,
  },
});
