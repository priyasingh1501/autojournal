import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
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
import { recordCompletedConversation } from '../services/ConversationHistoryService';
import { useActiveMindsRoster } from '../hooks/useActiveMindsRoster';
import { FeatureFlagsService } from '../services/FeatureFlagsService';
import { getUserContextV2 } from '../services/UserContextService';
import {
  detectHandoff,
  generateTransferSummary,
  buildHandoffSourceContext,
} from '../services/handoffDetector';
import {
  INITIAL_HANDOFF_STATE,
  canOfferHandoff,
  advanceTurn,
  applyDetectedOffer,
  recordStay,
  recordNotYet,
  recordAccept,
  HandoffState,
} from '../services/handoffState';
import { track } from '../services/AnalyticsService';
import { MIND_DISPLAY_NAMES } from '../services/mindCuration';
import type { SourceContext } from '../services/openingLineSelector';

interface Props {
  summary?: DailySummary;
  onClose: () => void;
  onCallRequested?: (mindId: string | null) => void;
  /**
   * When provided, skip the mind-picker carousel and jump straight into a
   * conversation with this mindId. `null` = Companion. Used by the curated
   * picker flow (ff_new_minds_system) so we don't show two pickers in a row.
   */
  initialMindId?: string | null;
  /**
   * Optional context describing what the user tapped in from (pattern /
   * day / wisdom short). Threaded to getOpeningMessage so the V2 opener
   * can acknowledge the context implicitly.
   */
  sourceContext?: import('../services/openingLineSelector').SourceContext | null;
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

const SCREEN_W = Dimensions.get('window').width;

// Default companion entry (treated like a Mind for the picker)
const COMPANION = {
  id:         null as null,
  name:       'Untangle',
  era:        'Your personal AI',
  philosophy: 'Decisions, reflection, and life — all in one place',
  accent:     'rgba(152,212,250,0.90)',
  symbol:     '✦',
  image:      require('../../assets/icon.png') as number,
};

type PickerItem = (typeof COMPANION | (typeof MINDS)[number]) & { image: number };

// Key used in openingMessages map: 'default' for companion, mindId for minds
function itemKey(item: PickerItem): string {
  return item.id ?? 'default';
}

function MindPicker({
  onSelect,
  onCall,
  onClose,
  date,
  summary,
}: {
  onSelect: (mindId: string | null, openingMsg: string) => void;
  onCall?: (mindId: string | null) => void;
  onClose: () => void;
  date: string;
  summary: DailySummary;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const flatListRef = useRef<FlatList<PickerItem>>(null);
  // Map of itemKey → fetched opening message (undefined = loading, null = error)
  const [openingMessages, setOpeningMessages] = useState<Record<string, string | null>>({});

  // Flag-aware roster — V2 when ff_new_minds_system is on, legacy otherwise.
  // The local COMPANION card (rendered with mindId=null) stays as the first
  // item for both rosters, so V2's 'companion' entry is filtered out to
  // avoid a duplicate row.
  const activeRoster = useActiveMindsRoster();
  const rosterWithoutCompanion = activeRoster.filter(m => m.id !== 'companion');
  // Cast via `any` because the V2 Mind has optional image while PickerItem
  // requires image — Companion-special is handled by the static COMPANION
  // card, and the rest of the V2 roster all have images. The `filter` above
  // guarantees that invariant at runtime.
  const items: PickerItem[] = [COMPANION, ...(rosterWithoutCompanion as any)];

  // Lazily fetch opening messages: only load the current card plus one on each side.
  // This avoids a burst of 12+ API calls on mount — messages for off-screen cards
  // are fetched on demand as the user swipes toward them.
  const fetchOpeningMessage = useCallback(async (item: PickerItem, active: { value: boolean }) => {
    const key = itemKey(item);
    setOpeningMessages(prev => {
      if (key in prev) return prev; // already fetched or in-flight
      return { ...prev }; // trigger re-render so the loading state shows
    });
    try {
      const settings = await StorageService.getSettings();
      const apiKey = settings?.anthropicApiKey?.trim() ?? '';
      const msg = await getOpeningMessage(summary, apiKey || undefined, item.id);
      if (active.value) setOpeningMessages(prev => ({ ...prev, [key]: msg }));
    } catch {
      if (active.value) setOpeningMessages(prev => ({ ...prev, [key]: null }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  useEffect(() => {
    const active = { value: true };
    // Fetch current + one neighbour on each side
    const indices = [currentIndex - 1, currentIndex, currentIndex + 1]
      .filter(i => i >= 0 && i < items.length);
    indices.forEach(i => fetchOpeningMessage(items[i], active));
    return () => { active.value = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const scrollToIndex = useCallback((idx: number) => {
    currentIndexRef.current = idx;
    setCurrentIndex(idx);
    flatListRef.current?.scrollToIndex({ index: idx, animated: true });
  }, []);

  const prev = currentIndex > 0 ? items[currentIndex - 1] : null;
  const next = currentIndex < items.length - 1 ? items[currentIndex + 1] : null;

  const renderItem = ({ item }: { item: PickerItem }) => {
    const accentFull  = item.accent;
    const accentDim   = accentFull.replace(/[\d.]+\)$/, '0.60)');
    const accentFaint = accentFull.replace(/[\d.]+\)$/, '0.10)');
    const borderColor = accentFull.replace(/[\d.]+\)$/, '0.25)');
    const chatBg      = accentFull.replace(/[\d.]+\)$/, '0.12)');
    const chatBorder  = accentFull.replace(/[\d.]+\)$/, '0.35)');
    const firstName   = item.name.split(' ')[0];
    const key         = itemKey(item);
    const opening     = openingMessages[key]; // undefined = loading, null = error, string = ready

    const cardBg      = accentFull.replace(/[\d.]+\)$/, '0.07)');
    const btnActiveBg = accentFull.replace(/[\d.]+\)$/, '0.28)');
    const btnDimBg    = accentFull.replace(/[\d.]+\)$/, '0.08)');

    return (
      <ScrollView
        style={{ width: SCREEN_W, backgroundColor: cardBg }}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        {/* Portrait */}
        <View style={[styles.portraitRing, { borderColor: accentFull.replace(/[\d.]+\)$/, '0.50)') }]}>
          <Image
            source={item.image}
            style={styles.portraitImg}
            resizeMode="cover"
          />
        </View>

        {/* Name + era */}
        <Text style={styles.pageName}>{item.name}</Text>
        <Text style={styles.pageEra}>{item.era}</Text>

        {/* Philosophy tag */}
        <View style={[styles.philTag, { backgroundColor: accentFull.replace(/[\d.]+\)$/, '0.15)'), borderColor }]}>
          <Text style={styles.philText}>{item.philosophy}</Text>
        </View>

        {/* Opening message */}
        <View style={[styles.openingWrap, { backgroundColor: accentFull.replace(/[\d.]+\)$/, '0.08)'), borderColor: accentFull.replace(/[\d.]+\)$/, '0.18)') }]}>
          {opening === undefined ? (
            <View style={styles.openingLoading}>
              <ActivityIndicator size="small" color="rgba(224,242,254,0.60)" />
              <Text style={styles.openingLoadingText}>
                Reading your day…
              </Text>
            </View>
          ) : opening === null ? (
            <Text style={styles.openingText}>
              "I'm here. What would you like to explore today?"
            </Text>
          ) : (
            <Text style={styles.openingText}>
              "{opening}"
            </Text>
          )}
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          {/* Chat button */}
          <TouchableOpacity
            style={[
              styles.chatBtn, styles.actionBtn,
              { backgroundColor: opening !== undefined ? btnActiveBg : btnDimBg, borderColor },
              opening === undefined && styles.chatBtnDisabled,
            ]}
            onPress={() => opening != null && onSelect(item.id, opening)}
            activeOpacity={0.8}
            disabled={opening === undefined}
          >
            <Feather name="message-circle" size={15} color="rgba(224,242,254,0.90)" />
            <Text style={styles.chatBtnText}>Chat</Text>
          </TouchableOpacity>

          {/* Call button */}
          {onCall && (
            <TouchableOpacity
              style={[styles.chatBtn, styles.actionBtn, { backgroundColor: btnActiveBg, borderColor }]}
              onPress={() => onCall(item.id)}
              activeOpacity={0.8}
            >
              <Feather name="phone" size={15} color="rgba(224,242,254,0.90)" />
              <Text style={styles.chatBtnText}>Call</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    );
  };

  return (
    <LinearGradient colors={['#02060E', '#041628', '#02060E']} style={styles.pickerRoot}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={styles.pickerHeader}>
          <View>
            <Text style={styles.pickerTitle}>Get a new perspective</Text>
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

        {/* Paged list */}
        <FlatList
          ref={flatListRef}
          data={items}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({
            length: SCREEN_W, offset: SCREEN_W * index, index,
          })}
          onMomentumScrollEnd={e => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            currentIndexRef.current = idx;
            setCurrentIndex(idx);
          }}
          onScrollToIndexFailed={info => {
            setTimeout(() => flatListRef.current?.scrollToIndex({ index: info.index, animated: false }), 100);
          }}
          style={{ flex: 1 }}
        />

        {/* Bottom nav — mind names */}
        <View style={styles.navRow}>
          {prev ? (
            <TouchableOpacity style={styles.navBtn} onPress={() => scrollToIndex(currentIndex - 1)}>
              <Feather name="chevron-left" size={14} color="rgba(152,212,250,0.60)" />
              <Text style={styles.navBtnText}>{prev.name.split(' ')[0]}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.navPlaceholder} />
          )}

          {/* Dot indicators */}
          <View style={styles.dots}>
            {items.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === currentIndex && styles.dotActive]}
              />
            ))}
          </View>

          {next ? (
            <TouchableOpacity style={styles.navBtn} onPress={() => scrollToIndex(currentIndex + 1)}>
              <Text style={styles.navBtnText}>{next.name.split(' ')[0]}</Text>
              <Feather name="chevron-right" size={14} color="rgba(152,212,250,0.60)" />
            </TouchableOpacity>
          ) : (
            <View style={styles.navPlaceholder} />
          )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ── Handoff pills ────────────────────────────────────────────────────────────
// Rendered inline below Companion's last message when a handoff has been
// offered. Three options — "Stay with you" / "Meet X" / "Not yet".
function HandoffPills({
  toMindId,
  transitioning,
  onStay,
  onAccept,
  onNotYet,
}: {
  toMindId: string;
  transitioning: boolean;
  onStay: () => void;
  onAccept: () => void;
  onNotYet: () => void;
}) {
  const displayName = MIND_DISPLAY_NAMES[toMindId] ?? toMindId;
  return (
    <View style={handoffStyles.wrap}>
      <TouchableOpacity
        style={handoffStyles.pill}
        onPress={onStay}
        disabled={transitioning}
        activeOpacity={0.75}
      >
        <Text style={handoffStyles.pillText}>Stay with you</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[handoffStyles.pill, handoffStyles.pillPrimary]}
        onPress={onAccept}
        disabled={transitioning}
        activeOpacity={0.85}
      >
        {transitioning
          ? <ActivityIndicator size="small" color="rgba(224,242,254,0.90)" />
          : <Text style={handoffStyles.pillTextPrimary}>Meet {displayName}</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        style={handoffStyles.pill}
        onPress={onNotYet}
        disabled={transitioning}
        activeOpacity={0.75}
      >
        <Text style={handoffStyles.pillText}>Not yet</Text>
      </TouchableOpacity>
    </View>
  );
}

const handoffStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    marginBottom: 6,
  },
  pill: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.25)',
    backgroundColor: 'rgba(9,41,173,0.12)',
  },
  pillPrimary: {
    borderColor: 'rgba(152,212,250,0.55)',
    backgroundColor: 'rgba(9,41,173,0.50)',
  },
  pillText: {
    fontSize: 12, letterSpacing: 0.2,
    color: 'rgba(152,212,250,0.80)',
    fontFamily: 'GillSans-Light',
  },
  pillTextPrimary: {
    fontSize: 12, letterSpacing: 0.2,
    color: 'rgba(224,242,254,0.95)',
    fontFamily: 'GillSans-Light',
  },
});

// ── Main chat screen ──────────────────────────────────────────────────────────

export default function ChatScreen({ summary, onClose, onCallRequested, initialMindId, sourceContext }: Props) {
  // Standalone chats (no summary) get a minimal stub so ConversationService always has context
  const effectiveSummary: DailySummary = summary ?? {
    date: new Date().toISOString().split('T')[0],
    summary: 'No journal entries today — open conversation.',
    transcriptCount: 0,
    createdAt: Date.now(),
  };
  const [messages,         setMessages]  = useState<ConversationMessage[]>([]);
  // Skip the in-screen picker when the curated picker flow already chose a mind.
  const [convState,        setConvState] = useState<ConvState>(
    initialMindId === undefined ? 'selecting' : 'loading',
  );
  const [draft,            setDraft]     = useState('');
  const [error,            setError]     = useState<string | null>(null);
  const [savingReflection, setSaving]    = useState(false);
  const [selectedMindId,   setSelectedMindId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  // Track when the current conversation started so ConversationHistoryService
  // can key records by mind+startedAt. Reset via handleBackToPicker.
  const conversationStartedAtRef = useRef<number>(0);

  // ── Handoff state (ff_new_minds_system, Companion-only) ────────────────────
  // Kept in a ref so handleSend's async closure reads the latest value without
  // stale-state pitfalls; mirrored into React state only to trigger re-render
  // of the pills UI.
  const handoffStateRef = useRef<HandoffState>(INITIAL_HANDOFF_STATE);
  const [handoffUi, setHandoffUi] = useState<HandoffState['activeOffer']>(null);
  const [newMindsOn, setNewMindsOn] = useState(false);
  const wellbeingRef = useRef<'regulated' | 'tender' | 'hard_stretch'>('regulated');
  // The source context can be updated mid-session (on handoff) — keep it in a
  // ref so the subsequent getOpeningMessage call sees the latest value.
  const sourceContextRef = useRef<SourceContext | null>(sourceContext ?? null);
  const [handoffTransitioning, setHandoffTransitioning] = useState(false);

  useEffect(() => {
    FeatureFlagsService.getFlag('ff_new_minds_system').then(setNewMindsOn).catch(() => {});
    getUserContextV2()
      .then(c => { wellbeingRef.current = c.wellbeingState; })
      .catch(() => {});
  }, []);

  const applyHandoffState = (next: HandoffState) => {
    handoffStateRef.current = next;
    setHandoffUi(next.activeOffer);
  };

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
  // preloadedOpening: already-fetched message from the picker — skips the API call
  const startConversation = async (mindId: string | null, preloadedOpening?: string) => {
    setSelectedMindId(mindId);
    conversationStartedAtRef.current = Date.now();
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

      // Use pre-fetched opening from picker if available, otherwise fetch now.
      // sourceContextRef carries either the original prop OR an updated
      // handoff-transfer context set just before a mid-session transition.
      const opening = preloadedOpening
        ?? await getOpeningMessage(
          effectiveSummary,
          apiKeyRef.current || undefined,
          mindId,
          sourceContextRef.current,
        );
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

  // Auto-start when the caller handed us an initialMindId (curated picker flow).
  useEffect(() => {
    if (initialMindId !== undefined) {
      startConversation(initialMindId);
    }
    // Only on mount — the curated flow unmounts the screen when the user
    // closes it and re-mounts with a fresh prop if they re-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handoff pill handlers ────────────────────────────────────────────────
  const handleHandoffStay = () => {
    const offer = handoffStateRef.current.activeOffer;
    if (!offer) return;
    track('handoff_declined', { to: offer.mindId, reason: 'stay' });
    applyHandoffState(recordStay(handoffStateRef.current));
  };

  const handleHandoffNotYet = () => {
    const offer = handoffStateRef.current.activeOffer;
    if (!offer) return;
    track('handoff_declined', { to: offer.mindId, reason: 'not_yet' });
    applyHandoffState(recordNotYet(handoffStateRef.current));
  };

  const handleHandoffAccept = async () => {
    const offer = handoffStateRef.current.activeOffer;
    if (!offer || handoffTransitioning) return;
    const toMindId = offer.mindId;
    track('handoff_accepted', { to: toMindId });
    applyHandoffState(recordAccept(handoffStateRef.current));
    setHandoffTransitioning(true);

    // Record the Companion conversation for recentMinds + save reflection
    // (fire-and-forget; we don't want the user staring at a spinner).
    if (conversationStartedAtRef.current > 0) {
      recordCompletedConversation({
        mindId: 'companion',
        messages: messagesRef.current.map(m => ({
          role: m.role as 'user' | 'assistant',
          text: m.text,
        })),
        startedAt: conversationStartedAtRef.current,
        endedAt: Date.now(),
      }).catch(() => {});
    }
    if (apiKeyRef.current && messagesRef.current.some(m => m.role === 'user')) {
      generateReflection(effectiveSummary, messagesRef.current, apiKeyRef.current, 'chat')
        .then(reflection => {
          if (summary) {
            StorageService.saveSummary({ ...effectiveSummary, reflectionText: reflection }).catch(() => {});
          }
        })
        .catch(() => {});
    }

    // Generate the transfer summary, then pivot this same ChatScreen
    // session over to the specialist with continuity context.
    try {
      const transfer = await generateTransferSummary(messagesRef.current);
      sourceContextRef.current = transfer
        ? buildHandoffSourceContext(transfer)
        // Fallback: a minimal hand-off context so the opener still feels continuous
        : {
            kind: 'day',
            description:
              `Companion has brought this user to you. The conversation has revealed something ${MIND_DISPLAY_NAMES[toMindId] ?? 'you'} would meet well.`,
          };

      // Reset conversation state to a clean slate for the specialist.
      setMessages([]);
      messagesRef.current = [];
      setDraft('');
      setError(null);
      detectedIntentRef.current = null;
      handoffStateRef.current = INITIAL_HANDOFF_STATE;
      setHandoffUi(null);

      // startConversation will read sourceContextRef.current when it calls
      // getOpeningMessage, so the specialist's opening line reflects the
      // handoff context.
      await startConversation(toMindId);
    } finally {
      setHandoffTransitioning(false);
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

      // ── Handoff detection ──────────────────────────────────────────────
      // Runs after Companion responses only, from turn 3 onward, respecting
      // the cooldown and declined-set state machine. Fire-and-forget so it
      // never blocks the user from typing their next message.
      if (newMindsOn && selectedMindId === null) {
        applyHandoffState(advanceTurn(handoffStateRef.current));
        const eligible = canOfferHandoff({
          state: handoffStateRef.current,
          isCompanion: true,
          wellbeingState: wellbeingRef.current,
        });
        if (eligible) {
          detectHandoff(final).then(decision => {
            if (!activeRef.current || !decision || !decision.mindId) return;
            // Re-check eligibility — wellbeing or declined-set may have shifted
            // while Haiku was thinking.
            if (!canOfferHandoff({
              state: handoffStateRef.current,
              isCompanion: true,
              wellbeingState: wellbeingRef.current,
            })) return;
            const next = applyDetectedOffer(handoffStateRef.current, {
              mindId: decision.mindId,
              reason: decision.reason ?? '',
            });
            if (next === handoffStateRef.current) return; // declined earlier, dropped silently
            applyHandoffState(next);
            track('handoff_offered', { from: 'companion', to: decision.mindId });
          }).catch(() => { /* silent — never break the loop */ });
        }
      }
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
    // Record the conversation for UserContextV2.recentMinds — no-op when
    // ff_new_minds_system is off, and skipped when there were no user turns.
    if (conversationStartedAtRef.current > 0) {
      recordCompletedConversation({
        mindId: selectedMindId,
        messages: messagesRef.current.map(m => ({ role: m.role as 'user' | 'assistant', text: m.text })),
        startedAt: conversationStartedAtRef.current,
        endedAt: Date.now(),
      }).catch(() => {});
    }
    onClose();
  };

  // ── Mind picker ───────────────────────────────────────────────────────
  if (convState === 'selecting') {
    return (
      <MindPicker
        onSelect={(mindId, openingMsg) => startConversation(mindId, openingMsg)}
        onCall={onCallRequested}
        onClose={onClose}
        date={effectiveSummary.date}
        summary={effectiveSummary}
      />
    );
  }

  const canSend   = draft.trim().length > 0 && convState === 'idle';
  // Look up the active mind from the SAME flag-aware roster the picker
  // used — otherwise picking Rumi/Munger under ff_new_minds_system yields
  // null here and the active-mind UI blanks.
  const fullRoster = useActiveMindsRoster();
  const activeMind = selectedMindId ? fullRoster.find(m => m.id === selectedMindId) : null;

  // ── Chat UI ───────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top + 8}
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
          keyboardShouldPersistTaps="handled"
        >
          {convState === 'loading' && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="rgba(152,212,250,0.65)" />
              <Text style={styles.loadingText}>
                {activeMind ? `${activeMind.name} is reading your day…` : 'Reading your day…'}
              </Text>
            </View>
          )}

          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            const attachPills =
              isLast &&
              msg.role === 'assistant' &&
              selectedMindId === null &&
              handoffUi != null;
            return (
              <View key={msg.id}>
                <View
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
                {attachPills && handoffUi && (
                  <HandoffPills
                    toMindId={handoffUi.mindId}
                    transitioning={handoffTransitioning}
                    onStay={handleHandoffStay}
                    onAccept={handleHandoffAccept}
                    onNotYet={handleHandoffNotYet}
                  />
                )}
              </View>
            );
          })}

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
  // ── Per-page card ─────────────────────────────────────────────────────────
  page: {
    paddingHorizontal: 28, paddingTop: 24, paddingBottom: 32,
    alignItems: 'center',
  },
  portraitRing: {
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 2.5, overflow: 'hidden',
    marginBottom: 20,
  },
  portraitImg: { width: '100%', height: '100%' },
  portraitFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  portraitSymbol: { fontSize: 56 },
  pageName: {
    fontSize: 28, fontFamily: 'Baskerville', fontWeight: '500',
    color: 'rgba(224,242,254,0.95)', textAlign: 'center',
  },
  pageEra: {
    fontSize: 12, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.45)', marginTop: 5, textAlign: 'center',
  },
  philTag: {
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 7,
    marginTop: 20,
  },
  philText: {
    fontSize: 12, fontFamily: 'GillSans-Light',
    textAlign: 'center', lineHeight: 18,
    color: 'rgba(224,242,254,0.80)',
  },
  openingWrap: {
    marginTop: 28, alignSelf: 'stretch',
    backgroundColor: 'rgba(152,212,250,0.04)',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.10)',
    padding: 18,
    minHeight: 90, justifyContent: 'center',
  },
  openingLoading: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
  },
  openingLoadingText: {
    fontSize: 13, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.65)',
  },
  openingText: {
    fontSize: 16, fontFamily: 'Baskerville',
    lineHeight: 26, textAlign: 'center',
    color: 'rgba(224,242,254,0.90)',
  },
  actionRow: {
    flexDirection: 'row', gap: 12, marginTop: 20, alignSelf: 'stretch',
  },
  chatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
    borderRadius: 18, borderWidth: 1,
  },
  actionBtn: { flex: 1 },
  chatBtnDisabled: { opacity: 0.45 },
  chatBtnText: {
    fontSize: 15, fontFamily: 'GillSans-Light', fontWeight: '600',
    color: 'rgba(224,242,254,0.90)',
  },

  // ── Bottom nav ────────────────────────────────────────────────────────────
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(152,212,250,0.05)',
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.15)',
    minWidth: 90,
  },
  navBtnText: {
    fontSize: 13, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.75)', fontWeight: '500',
  },
  navPlaceholder: { minWidth: 90 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(152,212,250,0.18)' },
  dotActive: { width: 14, backgroundColor: 'rgba(152,212,250,0.65)' },

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
