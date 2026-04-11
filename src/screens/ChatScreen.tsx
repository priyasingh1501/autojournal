import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { DailySummary, ConversationMessage } from '../types';
import {
  sendMessage, getOpeningMessage, generateReflection,
  detectIntent, ConversationIntent, ConversationContext,
} from '../services/ConversationService';
import { MINDS } from '../services/MindService';
import { StorageService } from '../services/StorageService';

interface Props {
  summary?: DailySummary;
  onClose: () => void;
}

type ConvState = 'selecting' | 'loading' | 'thinking' | 'idle' | 'error';

function formatDate(date: string): string {
  const todayStr     = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  if (date === todayStr)     return 'Today';
  if (date === yesterdayStr) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

// ── Mind picker ───────────────────────────────────────────────────────────────

function MindPicker({
  onSelect,
  onClose,
  date,
}: {
  onSelect: (mindId: string | null) => void;
  onClose: () => void;
  date: string;
}) {
  return (
    <LinearGradient colors={['#02060E', '#041628', '#02060E']} style={styles.pickerRoot}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={styles.pickerHeader}>
          <View>
            <Text style={styles.pickerTitle}>Start a conversation with</Text>
            <Text style={styles.pickerSub}>{formatDate(date)}</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="x" size={18} color="rgba(152,212,250,0.70)" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.pickerContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Default companion — full width */}
          <TouchableOpacity
            style={styles.defaultCard}
            onPress={() => onSelect(null)}
            activeOpacity={0.8}
          >
            <View style={styles.defaultLeft}>
              <Text style={styles.defaultSymbol}>✦</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.defaultName}>My Untangle Companion</Text>
                <Text style={styles.defaultDesc}>
                  Your personal AI, here to help you with decisions, reflection, and life.
                </Text>
              </View>
            </View>
            <Feather name="arrow-right" size={16} color="rgba(152,212,250,0.50)" />
          </TouchableOpacity>

          <Text style={styles.orLabel}>— or reflect with a mind —</Text>

          {/* 2-col grid of minds */}
          <View style={styles.pickerGrid}>
            {MINDS.reduce<(typeof MINDS)[]>((rows, m, i) => {
              if (i % 2 === 0) rows.push([m]);
              else rows[rows.length - 1].push(m);
              return rows;
            }, []).map((pair, pi) => (
              <View key={pi} style={styles.pickerRow}>
                {pair.map(mind => {
                  const bg     = mind.accent.replace(/[\d.]+\)$/, '0.08)');
                  const border = mind.accent.replace(/[\d.]+\)$/, '0.22)');
                  return (
                    <TouchableOpacity
                      key={mind.id}
                      style={[styles.mindCard, { backgroundColor: bg, borderColor: border }]}
                      onPress={() => onSelect(mind.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.mindReflectWith, { color: mind.accent.replace(/[\d.]+\)$/, '0.45)') }]}>Reflect with</Text>
                      <Text style={styles.mindName}>{mind.name}</Text>
                      <Text style={styles.mindEra}>{mind.era}</Text>
                      <Text style={styles.mindPhil} numberOfLines={2}>{mind.philosophy}</Text>
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

// ── Main chat screen ──────────────────────────────────────────────────────────

export default function ChatScreen({ summary, onClose }: Props) {
  // Standalone chats (no summary) get a minimal stub so ConversationService always has context
  const effectiveSummary: DailySummary = summary ?? {
    date: new Date().toISOString().split('T')[0],
    summary: 'No journal entries today — open conversation.',
    transcriptCount: 0,
    createdAt: Date.now(),
  };
  const [messages,         setMessages]  = useState<ConversationMessage[]>([]);
  const [convState,        setConvState] = useState<ConvState>('selecting');
  const [draft,            setDraft]     = useState('');
  const [error,            setError]     = useState<string | null>(null);
  const [savingReflection, setSaving]    = useState(false);
  const [selectedMindId,   setSelectedMindId] = useState<string | null>(null);

  // Go back to the mind picker from an active conversation
  const handleBackToPicker = () => {
    setMessages([]);
    setDraft('');
    setError(null);
    setSelectedMindId(null);
    setConvState('selecting');
    messagesRef.current = [];
    detectedIntentRef.current = null;
  };

  const activeRef       = useRef(true);
  const messagesRef     = useRef<ConversationMessage[]>([]);
  const scrollRef       = useRef<ScrollView>(null);
  const inputRef        = useRef<TextInput>(null);
  const apiKeyRef       = useRef('');
  const convContextRef  = useRef<ConversationContext>({});
  const detectedIntentRef = useRef<ConversationIntent | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { return () => { activeRef.current = false; }; }, []);
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages, convState]);

  // ── Start conversation after mind is selected ─────────────────────────
  const startConversation = async (mindId: string | null) => {
    setSelectedMindId(mindId);
    setConvState('loading');
    try {
      const settings = await StorageService.getSettings();
      apiKeyRef.current = settings?.anthropicApiKey?.trim() ?? '';

      // Load context data in parallel for intent-aware responses
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

      const opening = await getOpeningMessage(effectiveSummary, apiKeyRef.current || undefined, mindId);
      if (!activeRef.current) return;

      const msg: ConversationMessage = {
        id: `ai-${Date.now()}`, role: 'assistant', text: opening, timestamp: Date.now(),
      };
      messagesRef.current = [msg];
      setMessages([msg]);
      setConvState('idle');
    } catch (e: any) {
      if (!activeRef.current) return;
      setError(e?.message ?? 'Could not start conversation.');
      setConvState('error');
    }
  };

  // ── Send message ──────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = draft.trim();
    if (!text || convState !== 'idle') return;

    setDraft('');
    setError(null);
    setConvState('thinking');

    const userMsg: ConversationMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role: 'user', text, timestamp: Date.now(),
    };

    const updatedMsgs = [...messagesRef.current, userMsg];
    messagesRef.current = updatedMsgs;
    setMessages(updatedMsgs);

    try {
      const history = updatedMsgs.slice(1);

      // Intent detection + context injection apply to untangle companion only
      const isCompanion = selectedMindId === null;
      if (isCompanion && detectedIntentRef.current === null) {
        detectedIntentRef.current = await detectIntent(text);
      }

      const aiText = await sendMessage(
        effectiveSummary,
        history.slice(0, -1),
        text,
        apiKeyRef.current || undefined,
        selectedMindId,
        isCompanion ? detectedIntentRef.current ?? undefined : undefined,
        isCompanion ? convContextRef.current : undefined,
      );
      if (!activeRef.current) return;

      const aiMsg: ConversationMessage = {
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'assistant', text: aiText, timestamp: Date.now(),
      };
      const final = [...messagesRef.current, aiMsg];
      messagesRef.current = final;
      setMessages(final);
      setConvState('idle');
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (e: any) {
      if (!activeRef.current) return;
      setError(e?.message ?? 'Could not get response.');
      setConvState('error');
    }
  };

  const handleClose = async () => {
    const userMessages = messagesRef.current.filter(m => m.role === 'user');
    if (userMessages.length > 0 && apiKeyRef.current) {
      setSaving(true);
      try {
        const reflection = await generateReflection(
          effectiveSummary, messagesRef.current, apiKeyRef.current, 'chat',
        );
        // Only persist reflection if a real summary exists (not a stub)
        if (summary) {
          await StorageService.saveSummary({ ...effectiveSummary, reflectionText: reflection });
        }
      } catch { /* reflection is best-effort */ }
    }
    onClose();
  };

  // ── Mind picker ───────────────────────────────────────────────────────
  if (convState === 'selecting') {
    return (
      <MindPicker
        onSelect={startConversation}
        onClose={onClose}
        date={effectiveSummary.date}
      />
    );
  }

  const canSend   = draft.trim().length > 0 && convState === 'idle';
  const insets    = useSafeAreaInsets();
  const activeMind = selectedMindId ? MINDS.find(m => m.id === selectedMindId) : null;

  // ── Chat UI ───────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          {/* Back to mind picker */}
          <TouchableOpacity
            onPress={handleBackToPicker}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="chevron-left" size={20} color="rgba(152,212,250,0.70)" />
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 4 }}>
            <View style={styles.headerNameRow}>
              {activeMind && (
                <Text style={styles.headerSymbol}>{activeMind.symbol}</Text>
              )}
              <Text style={styles.headerTitle}>
                {activeMind ? activeMind.name : 'Reflection'}
              </Text>
            </View>
            <Text style={styles.headerSub}>{formatDate(effectiveSummary.date)}</Text>
          </View>
          {savingReflection ? (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color="rgba(152,212,250,0.65)" />
              <Text style={styles.savingText}>Saving…</Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              disabled={savingReflection}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="x" size={18} color="rgba(152,212,250,0.70)" />
            </TouchableOpacity>
          )}
        </View>

        {activeMind && (
          <View style={[styles.mindBanner, {
            borderBottomColor: activeMind.accent.replace(/[\d.]+\)$/, '0.15)'),
          }]}>
            <Text style={[styles.mindBannerText, { color: activeMind.accent.replace(/[\d.]+\)$/, '0.70)') }]}>
              {activeMind.philosophy}
            </Text>
          </View>
        )}

        {!activeMind && <View style={styles.divider} />}

        {/* Thread */}
        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
        >
          {convState === 'loading' && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="rgba(152,212,250,0.65)" />
              <Text style={styles.loadingText}>
                {activeMind ? `${activeMind.name} is reading your day…` : 'Reading your day…'}
              </Text>
            </View>
          )}

          {messages.map(msg => (
            <View
              key={msg.id}
              style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}
            >
              {msg.role === 'assistant' && activeMind && (
                <Text style={[styles.bubbleSender, { color: activeMind.accent.replace(/[\d.]+\)$/, '0.65)') }]}>
                  {activeMind.name}
                </Text>
              )}
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
              <ActivityIndicator size="small" color="rgba(152,212,250,0.65)" />
            </View>
          )}

          {error && (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                onPress={() => { setError(null); setConvState('idle'); }}
                style={styles.retryBtn}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(12, insets.bottom) }]}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={draft}
            onChangeText={setDraft}
            placeholder={convState === 'loading' ? 'Loading…' : 'Type a message…'}
            placeholderTextColor="rgba(152,212,250,0.35)"
            multiline
            maxLength={1000}
            editable={convState === 'idle'}
            returnKeyType="default"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.75}
          >
            <Feather name="arrow-up" size={18} color={canSend ? '#fff' : 'rgba(224,242,254,0.30)'} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#02060E' },
  container: { flex: 1 },

  // ── Picker ────────────────────────────────────────────────────────────
  pickerRoot: { flex: 1 },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  pickerTitle: {
    fontSize: 24, fontFamily: 'Baskerville', fontWeight: '500',
    color: 'rgba(224,242,254,0.95)',
  },
  pickerSub: {
    fontSize: 12, color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light', marginTop: 2,
  },
  pickerContent: { paddingHorizontal: 20, paddingBottom: 40 },

  defaultCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(152,212,250,0.07)',
    borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.20)',
    paddingHorizontal: 18, paddingVertical: 16,
    marginBottom: 4,
  },
  defaultLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  defaultSymbol: { fontSize: 36, color: 'rgba(152,212,250,0.90)' },
  defaultName: {
    fontSize: 17, fontFamily: 'Baskerville', fontWeight: '500',
    color: 'rgba(224,242,254,0.95)',
  },
  defaultDesc: {
    fontSize: 12, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.65)', marginTop: 3, lineHeight: 17,
  },

  orLabel: {
    fontSize: 11, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.35)', textAlign: 'center',
    marginVertical: 18, letterSpacing: 0.5,
  },

  pickerGrid: { gap: 12 },
  pickerRow: { flexDirection: 'row', gap: 12 },
  mindCard: {
    flex: 1, borderRadius: 18, borderWidth: 1,
    padding: 16, minHeight: 140, gap: 4,
  },
  mindReflectWith: { fontSize: 9, fontFamily: 'GillSans-Light', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 2 },
  mindName: { fontSize: 14, fontFamily: 'Baskerville', fontWeight: '500', lineHeight: 20, color: 'rgba(224,242,254,0.95)' },
  mindEra: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', lineHeight: 14 },
  mindPhil: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.55)', lineHeight: 16, marginTop: 2 },

  // ── Chat header ───────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerSymbol: { fontSize: 18 },
  headerTitle: {
    fontSize: 20, fontWeight: '500',
    color: 'rgba(224,242,254,0.95)', fontFamily: 'Baskerville',
  },
  headerSub: {
    fontSize: 12, color: 'rgba(152,212,250,0.60)',
    fontFamily: 'GillSans-Light', marginTop: 2,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(152,212,250,0.06)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.13)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(152,212,250,0.08)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  savingText: { fontSize: 12, color: 'rgba(152,212,250,0.55)', fontFamily: 'GillSans-Light' },
  divider: { height: 1, backgroundColor: 'rgba(152,212,250,0.08)', marginHorizontal: 20 },
  mindBanner: {
    paddingHorizontal: 20, paddingBottom: 10,
    borderBottomWidth: 1,
  },
  mindBannerText: { fontSize: 11, fontFamily: 'GillSans-Light', fontStyle: 'italic' },

  // ── Thread ────────────────────────────────────────────────────────────
  thread: { flex: 1 },
  threadContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, gap: 12 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { fontSize: 13, color: 'rgba(152,212,250,0.55)', fontFamily: 'GillSans-Light', fontStyle: 'italic' },

  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#0929AD', borderBottomRightRadius: 4 },
  bubbleAI: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(152,212,250,0.07)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)',
    borderBottomLeftRadius: 4,
  },
  thinkingBubble: { paddingVertical: 12, paddingHorizontal: 18 },
  bubbleSender: { fontSize: 10, fontFamily: 'GillSans-Light', marginBottom: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22, fontFamily: 'GillSans-Light' },
  bubbleTextUser: { color: 'rgba(224,242,254,0.95)' },
  bubbleTextAI: { color: 'rgba(224,242,254,0.85)' },

  errorRow: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  errorText: { fontSize: 13, color: '#e63946', textAlign: 'center', fontFamily: 'GillSans-Light' },
  retryBtn: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12,
    backgroundColor: 'rgba(233,69,96,0.12)', borderWidth: 1, borderColor: 'rgba(233,69,96,0.30)',
  },
  retryText: { fontSize: 13, color: '#e94560', fontFamily: 'GillSans-Light' },

  // ── Input bar ─────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 12, gap: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(152,212,250,0.08)',
    backgroundColor: '#02060E',
  },
  textInput: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: 'rgba(152,212,250,0.06)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.15)',
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11,
    fontSize: 15, color: 'rgba(224,242,254,0.90)',
    fontFamily: 'GillSans-Light', lineHeight: 20,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#0929AD', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.25)',
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(9,41,173,0.20)', borderColor: 'rgba(152,212,250,0.10)',
  },
});
