/**
 * JournalScreen — the Journal tab (merged Notes + Day Summary view).
 *
 * Replaces Notes + Day Summary with a single surface:
 *   • Default: today's reflected Day Summary (NewDaySummaryView)
 *   • Tap "Show raw entries" to expand the day's note list inline
 *   • Date arrows navigate back through past days
 *   • Week toggle switches to WeekReviewView for the current week
 *   • Search icon opens a full-screen search across ALL raw entries
 *
 * Route params accepted:
 *   { view?: 'day' | 'week', jumpToDate?: string }
 * The `view: 'week'` param is used by the Sunday-evening week-review
 * notification (see SmartNotificationService + App.tsx deep-link handler).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  TextInput,
  FlatList,
  Image,
  Alert,
  DeviceEventEmitter,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { DailySummary, DayMacros, TranscriptEntry, UserGoals } from '../types';
import { StorageService } from '../services/StorageService';
import { generateDailySummary } from '../services/SummaryService';
import { SubscriptionService } from '../services/SubscriptionService';
import PaywallModal from '../components/PaywallModal';
import ComposeModal from '../components/ComposeModal';
import NewDaySummaryView from '../components/NewDaySummaryView';
import WeekReviewView from '../components/WeekReviewView';
import DayDigestView from '../components/DayDigestView';
import CuratedMindPicker from '../components/CuratedMindPicker';
import { effectiveTodayStr } from '../services/dayRollover';
import { curate, CurationResult } from '../services/mindCuration';
import { buildCurationContext } from '../services/CurationContextBuilder';
import { daySourceContext, promptSourceContext, SourceContext } from '../services/openingLineSelector';
import type { ResolvedPerspectivePrompt } from '../services/PerspectivePromptsService';
import { track } from '../services/AnalyticsService';
import TalkScreen from './TalkScreenV2';
import ChatScreen, { ResumeChatInput } from './ChatScreen';
import {
  getSavedChatsForDate,
  getSavedChat,
  SavedChat,
} from '../services/SavedChatService';

// ── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysLocal(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function formatDate(date: string): string {
  const todayStr = localDateStr();
  const ydStr = localDateStr(new Date(Date.now() - 86_400_000));
  if (date === todayStr) return 'Today';
  if (date === ydStr) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toPlainText(md: string) {
  return md
    .replace(/^##\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^\s*-\s+/gm, '• ')
    .replace(/\n{2,}/g, ' ')
    .trim();
}

// ── Inline day raw-entries list ──────────────────────────────────────────────

function DayRawEntries({
  entries,
  query,
  date,
  onEdit,
}: {
  entries: TranscriptEntry[];
  query: string;
  date: string;
  onEdit: (entry: TranscriptEntry & { date: string }) => void;
}) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? entries.filter(e => e.text.toLowerCase().includes(q))
    : entries;

  if (filtered.length === 0) {
    return (
      <Text style={dr.empty}>
        {q ? 'No entries match that search.' : 'No entries for this day.'}
      </Text>
    );
  }

  return (
    <View>
      {filtered.map((e) => (
        <TouchableOpacity
          key={e.id}
          style={dr.card}
          onPress={() => onEdit({ ...e, date })}
          activeOpacity={0.75}
        >
          <View style={dr.cardHeader}>
            <Feather
              name={e.kind === 'manual' ? 'edit-3' : 'mic'}
              size={11}
              color="rgba(152,212,250,0.65)"
            />
            <Text style={dr.time}>{formatTime(e.timestamp)}</Text>
            {e.kind !== 'manual' && e.duration ? (
              <Text style={dr.duration}> · {e.duration.toFixed(1)}s</Text>
            ) : null}
            <Text style={dr.tapHint}>Tap to edit</Text>
          </View>
          {e.text.length > 0 && (
            <HighlightText text={e.text} query={q} style={dr.text} />
          )}
          {e.emotionTags && e.emotionTags.length > 0 && (
            <View style={dr.tagsRow}>
              {e.emotionTags.map(t => (
                <View key={t} style={dr.tag}><Text style={dr.tagText}>{t}</Text></View>
              ))}
            </View>
          )}
          {e.photoUri ? (
            <Image source={{ uri: e.photoUri }} style={dr.photo} resizeMode="cover" />
          ) : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function HighlightText({ text, query, style }: { text: string; query: string; style: any }) {
  if (!query) return <Text style={style}>{text}</Text>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <Text key={i} style={hl}>{p}</Text>
          : <Text key={i}>{p}</Text>
      )}
    </Text>
  );
}

const hl = { backgroundColor: 'rgba(152, 212, 250, 0.25)', color: 'rgba(224, 242, 254, 0.95)' };

// ── Global search modal ──────────────────────────────────────────────────────

interface SearchHit {
  date: string;
  entry: TranscriptEntry;
}

function GlobalSearchModal({
  visible,
  onClose,
  onHit,
}: {
  visible: boolean;
  onClose: () => void;
  onHit: (hit: SearchHit) => void;
}) {
  const [query, setQuery] = useState('');
  const [allEntries, setAllEntries] = useState<Array<SearchHit>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    (async () => {
      const dates = await StorageService.getTranscriptDates();
      const buckets = await Promise.all(
        dates.map(async (d) => ({ d, entries: await StorageService.getTranscriptsForDate(d) })),
      );
      const flat: SearchHit[] = [];
      for (const b of buckets) {
        for (const e of b.entries) flat.push({ date: b.d, entry: e });
      }
      flat.sort((a, b) => b.entry.timestamp - a.entry.timestamp);
      setAllEntries(flat);
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [visible]);

  const q = query.trim().toLowerCase();
  const hits = q
    ? allEntries.filter(h => h.entry.text.toLowerCase().includes(q))
    : [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={gs.container} edges={['top', 'bottom']}>
        <View style={gs.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={22} color="rgba(152,212,250,0.80)" />
          </TouchableOpacity>
          <View style={gs.searchBox}>
            <Feather name="search" size={13} color="rgba(152,212,250,0.55)" />
            <TextInput
              style={gs.searchInput}
              placeholder="Search all entries…"
              placeholderTextColor="rgba(152, 212, 250, 0.40)"
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Feather name="x" size={13} color="rgba(152,212,250,0.55)" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading ? (
          <View style={gs.center}>
            <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
          </View>
        ) : !q ? (
          <View style={gs.center}>
            <Text style={gs.hint}>Type to search your notes.</Text>
          </View>
        ) : hits.length === 0 ? (
          <View style={gs.center}>
            <Text style={gs.hint}>No entries match "{query}".</Text>
          </View>
        ) : (
          <FlatList
            data={hits}
            keyExtractor={(h) => h.entry.id}
            contentContainerStyle={{ padding: 14 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={gs.hit}
                onPress={() => { onHit(item); onClose(); }}
                activeOpacity={0.75}
              >
                <Text style={gs.hitMeta}>
                  {formatDate(item.date)} · {formatTime(item.entry.timestamp)}
                </Text>
                <HighlightText text={item.entry.text} query={q} style={gs.hitText} />
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function JournalScreen() {
  const route = useRoute<any>();

  // Mode / date
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [viewingDate, setViewingDate] = useState<string>(effectiveTodayStr());

  // Summary state (for day mode)
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [generatingDate, setGeneratingDate] = useState<string | null>(null);
  const [staleCount, setStaleCount] = useState(0);
  const [focusTick, setFocusTick] = useState(0);

  // Raw entries state
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [rawOpen, setRawOpen] = useState(false);
  const [rawSearch, setRawSearch] = useState('');

  // NewDaySummaryView support state
  const [enabledTrackers, setEnabledTrackers] = useState<Set<string> | null>(null);
  const [mealMacrosByDate, setMealMacrosByDate] = useState<Record<string, DayMacros>>({});
  const [goals, setGoals] = useState<UserGoals | null>(null);
  const [savedChatsForViewing, setSavedChatsForViewing] = useState<SavedChat[]>([]);
  const [resumeChatInput, setResumeChatInput] = useState<ResumeChatInput | null>(null);

  // Edit / delete raw entries
  const [editingEntry, setEditingEntry] = useState<(TranscriptEntry & { date: string }) | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const handleEditEntry = (entry: TranscriptEntry & { date: string }) => {
    setEditingEntry(entry);
    setComposeOpen(true);
  };

  // Perspective + paywall + search
  const [perspectiveSummary, setPerspectiveSummary] = useState<DailySummary | null>(null);
  const [callMindId, setCallMindId] = useState<string | null | undefined>(undefined);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallHint, setPaywallHint] = useState<string | undefined>();
  const pendingPerspectiveRef = useRef<DailySummary | null>(null);
  // When set, the curated picker's onPick will route the user into a chat
  // seeded with this prompt instead of a day summary. Used by digest carousel.
  const pendingPromptRef = useRef<ResolvedPerspectivePrompt | null>(null);
  const pendingGenerateDateRef = useRef<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  // Visibility for the prompt-driven chat modal — distinct from the summary
  // chat modal which keys off `perspectiveSummary`. Both render the same
  // ChatScreen but only the summary path passes a `summary` prop.
  const [showPromptChat, setShowPromptChat] = useState(false);

  // Curated picker state.
  const [curation, setCuration] = useState<CurationResult | null>(null);
  const [curationWellbeing, setCurationWellbeing] =
    useState<import('../types').WellbeingState | undefined>(undefined);
  const [chatInitialMindId, setChatInitialMindId] = useState<string | null | undefined>(undefined);
  const [chatSourceContext, setChatSourceContext] = useState<SourceContext | null>(null);

  // ── Load support data once per focus ────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      setFocusTick(t => t + 1);
      StorageService.getSettings().then(s => {
        setEnabledTrackers(s?.enabledTrackers ? new Set(s.enabledTrackers) : null);
      }).catch(() => {});
      StorageService.getGoals().then(setGoals).catch(() => {});
      (async () => {
        const dates = await StorageService.getSummaryDates();
        const monthKeys = [...new Set(dates.map(d => d.slice(0, 7)))];
        const lookup: Record<string, DayMacros> = {};
        await Promise.all(monthKeys.map(async mk => {
          const insight = await StorageService.getMonthlyInsight(mk);
          insight?.weeklyData?.mealMacrosByDay?.forEach(m => { lookup[m.date] = m; });
        }));
        setMealMacrosByDate(lookup);
      })().catch(() => {});

      // Apply deep-link params once per focus
      const jumpTo: string | undefined = route?.params?.jumpToDate;
      const view: 'day' | 'week' | undefined = route?.params?.view;
      if (view === 'week' || view === 'day') setMode(view);
      if (jumpTo) setViewingDate(jumpTo);
    }, [route?.params?.view, route?.params?.jumpToDate]),
  );

  // ── Refresh entries when a new transcript is saved (e.g. while transcription
  //    runs on HomeScreen and the user is already viewing this tab) ─────────────
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('transcriptAdded', ({ date }: { date: string }) => {
      if (date !== viewingDate) return;
      StorageService.getTranscriptsForDate(viewingDate).then(e => {
        setEntries(e);
        setSummary(prev => prev ? { ...prev } : null);
        setStaleCount(prev => prev + 1);
      }).catch(() => {});
    });
    return () => sub.remove();
  }, [viewingDate]);

  // ── Load summary + entries when viewing date changes ────────────────────────
  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    setRawOpen(false);
    setRawSearch('');
    (async () => {
      const [s, e] = await Promise.all([
        StorageService.getSummaryForDate(viewingDate),
        StorageService.getTranscriptsForDate(viewingDate),
      ]);
      if (cancelled) return;
      setSummary(s);
      setEntries(e);
      const newer = e.length - (s?.transcriptCount ?? 0);
      setStaleCount(Math.max(0, newer));
      setSummaryLoading(false);
    })().catch(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [viewingDate, focusTick]);

  // Saved chats for the viewing date — powers the Reflection history section.
  useEffect(() => {
    let cancelled = false;
    getSavedChatsForDate(viewingDate).then(chats => {
      if (!cancelled) setSavedChatsForViewing(chats);
    });
    return () => { cancelled = true; };
  }, [viewingDate, focusTick]);

  // ── Handlers required by NewDaySummaryView ─────────────────────────────────
  const handleGenerate = async (date: string) => {
    if (generatingDate) return;
    setGeneratingDate(date);
    try {
      const transcripts = await StorageService.getTranscriptsForDate(date);
      if (transcripts.length === 0) {
        Alert.alert('No entries', `There are no journal entries for ${formatDate(date)}.`);
        return;
      }
      const result = await generateDailySummary(transcripts, date);
      if (date === viewingDate) {
        setSummary(result);
        setStaleCount(0);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Something went wrong.');
    } finally {
      setGeneratingDate(null);
    }
  };

  const gatedHandleGenerate = async (date: string) => {
    const allowed = await SubscriptionService.canGenerateSummary();
    if (!allowed) {
      pendingGenerateDateRef.current = date;
      setPaywallHint(`You've used your ${SubscriptionService.FREE_SUMMARIES_PER_WEEK} free summaries this week. Upgrade to generate unlimited.`);
      setShowPaywall(true);
      return;
    }
    await SubscriptionService.recordSummaryGenerated();
    handleGenerate(date);
  };

  const handlePerspective = async (item: DailySummary) => {
    const allowed = await SubscriptionService.canUseConversation();
    if (!allowed) {
      pendingPerspectiveRef.current = item;
      setPaywallHint('Unlimited AI conversations are a Pro feature.');
      setShowPaywall(true);
      return;
    }
    await SubscriptionService.recordConversationUsed();

    // Build a CurationContext and show the curated picker. The picker's onPick
    // routes back through openChatWithCuratedMind().
    try {
      const ctx = await buildCurationContext({
        sourceSurface: 'day_summary',
        sourceContent: { type: 'day', data: item },
      });
      const result = curate(ctx);
      track('curation_rule_fired', {
        rule: result.matchedRuleId,
        specialists: result.specialists.map(s => s.id),
        source_surface: 'day_summary',
      });
      setCuration(result);
      setCurationWellbeing(ctx.wellbeingState);
      pendingPerspectiveRef.current = item;
    } catch {
      setCallMindId(undefined);
      setPerspectiveSummary(item);
    }
  };

  const openChatWithCuratedMind = (mindId: string | null) => {
    setCuration(null);

    // Prompt-driven flow (digest carousel chip tap). Source context was
    // staked out by handlePromptTap; we just need to flip the chat modal on.
    const prompt = pendingPromptRef.current;
    if (prompt) {
      pendingPromptRef.current = null;
      setChatInitialMindId(mindId);
      setCallMindId(undefined);
      setShowPromptChat(true);
      return;
    }

    // Day-summary flow (existing).
    const item = pendingPerspectiveRef.current;
    pendingPerspectiveRef.current = null;
    if (!item) return;
    // Build a source context from the day the user tapped in from. The
    // opener selector will pick from openingLinesWithContext + run the
    // Haiku adaptation pass so the opening feels tuned to this specific day.
    setChatSourceContext(daySourceContext({
      date: item.date,
      reflection: item.reflection ?? item.insightText ?? undefined,
    }));
    // Open ChatScreen with initialMindId so it skips its built-in picker
    // and drops straight into the conversation the user just chose.
    setChatInitialMindId(mindId);
    setCallMindId(undefined);
    setPerspectiveSummary(item);
  };

  // Tap on a perspective chip inside the digest's "Worth talking about" row.
  // Mirrors HomeScreen's handlePromptTap — same curation entry point with
  // sourceContent.type='prompt', and seeds a SourceContext that quotes the
  // entry the prompt came from so the opener feels grounded.
  const handlePromptTap = async (prompt: ResolvedPerspectivePrompt) => {
    const allowed = await SubscriptionService.canUseConversation();
    if (!allowed) {
      setPaywallHint('Unlimited AI conversations are a Pro feature.');
      setShowPaywall(true);
      return;
    }
    await SubscriptionService.recordConversationUsed();

    pendingPromptRef.current = prompt;
    setChatSourceContext(promptSourceContext({
      topic:     prompt.topic,
      why:       prompt.why,
      entryText: prompt.entryText,
    }));

    try {
      const ctx = await buildCurationContext({
        sourceSurface: 'day_summary',
        sourceContent: { type: 'prompt', data: prompt },
      });
      const result = curate(ctx);
      track('curation_rule_fired', {
        rule:           result.matchedRuleId,
        specialists:    result.specialists.map(s => s.id),
        source_surface: 'day_digest_prompt',
      });
      setCuration(result);
      setCurationWellbeing(ctx.wellbeingState);
    } catch {
      // Fallback — open chat with no curation step
      pendingPromptRef.current = null;
      setChatInitialMindId(undefined);
      setCallMindId(undefined);
      setShowPromptChat(true);
    }
  };

  // Resume a saved chat from the Reflection history list. Hydrates the
  // ChatScreen from the stored messages so the user picks up where they
  // left off, no new opening message.
  const handleContinueChat = async (chatId: string) => {
    const allowed = await SubscriptionService.canUseConversation();
    if (!allowed) {
      setPaywallHint('Unlimited AI conversations are a Pro feature.');
      setShowPaywall(true);
      return;
    }
    const chat = await getSavedChat(chatId);
    if (!chat || !summary) return;
    setResumeChatInput({
      id: chat.id,
      mindId: chat.mindId,
      startedAt: chat.startedAt,
      messages: chat.messages,
    });
    setChatInitialMindId(undefined);
    setChatSourceContext(null);
    setCallMindId(undefined);
    setPerspectiveSummary(summary);
  };


  const handleDownload = async (item: DailySummary) => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Not supported', 'Sharing is not available on this device.');
        return;
      }
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) return;
      const sep = '-'.repeat(40);
      const header = `UNTANGLE — DAILY SUMMARY\n${formatDate(item.date)}\n${sep}\n`;
      const meta = `Entries: ${item.transcriptCount}\n\n`;
      const body = toPlainText(item.summary || item.insightText || item.reflection || '');
      const fileUri = cacheDir + `untangle-${item.date}.txt`;
      await FileSystem.writeAsStringAsync(fileUri, header + meta + body + '\n', {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: `Save summary for ${formatDate(item.date)}`,
        UTI: 'public.plain-text',
      });
    } catch (err: any) {
      Alert.alert('Export failed', err?.message ?? 'Could not export.');
    }
  };

  // ── Date nav bounds ─────────────────────────────────────────────────────────
  // "Today" respects the 3am rollover — at 01:30 the user's "today" is still
  // yesterday, and the digest/summary slot reflects that. Re-computed on every
  // focus so the value follows midnight rollover when the screen stays mounted.
  const todayStr = useMemo(() => effectiveTodayStr(), [focusTick]);
  const canGoForward = viewingDate < todayStr;
  const showDigestForToday =
    viewingDate === todayStr && !summary && !summaryLoading;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top bar — search, title, Day/Week toggle */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => setShowSearch(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="search" size={18} color="rgba(152,212,250,0.75)" />
        </TouchableOpacity>
        <Text style={styles.title}>Journal</Text>
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'day' && styles.toggleBtnActive]}
            onPress={() => setMode('day')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, mode === 'day' && styles.toggleTextActive]}>Day</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'week' && styles.toggleBtnActive]}
            onPress={() => setMode('week')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, mode === 'week' && styles.toggleTextActive]}>Week</Text>
          </TouchableOpacity>
        </View>
      </View>

      {mode === 'week' ? (
        <WeekReviewView
          anchorDate={viewingDate}
          onOpenDay={(d) => { setViewingDate(d); setMode('day'); }}
        />
      ) : (
        <>
          {/* Date navigator */}
          <View style={styles.dateNav}>
            <TouchableOpacity
              onPress={() => setViewingDate(addDaysLocal(viewingDate, -1))}
              style={styles.dateArrow}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="chevron-left" size={18} color="rgba(152,212,250,0.80)" />
            </TouchableOpacity>
            <Text style={styles.dateLabel}>{formatDate(viewingDate)}</Text>
            <TouchableOpacity
              onPress={() => canGoForward && setViewingDate(addDaysLocal(viewingDate, 1))}
              disabled={!canGoForward}
              style={[styles.dateArrow, !canGoForward && { opacity: 0.25 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="chevron-right" size={18} color="rgba(152,212,250,0.80)" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Day summary / digest card */}
            {summaryLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
              </View>
            ) : summary ? (
              <View style={styles.summaryCard}>
                <NewDaySummaryView
                  item={summary}
                  enabledTrackers={enabledTrackers}
                  mealMacrosByDate={mealMacrosByDate}
                  goals={goals}
                  staleCount={staleCount}
                  generatingDate={generatingDate}
                  onGenerate={gatedHandleGenerate}
                  onDownload={handleDownload}
                  onPerspective={handlePerspective}
                  savedChats={savedChatsForViewing}
                  onContinueChat={handleContinueChat}
                />
              </View>
            ) : showDigestForToday ? (
              <View style={styles.summaryCard}>
                <DayDigestView
                  date={viewingDate}
                  refreshKey={entries.length}
                  onGenerate={entries.length > 0 ? () => gatedHandleGenerate(viewingDate) : undefined}
                  generating={generatingDate === viewingDate}
                  onPromptTap={handlePromptTap}
                />
              </View>
            ) : (
              <View style={styles.noSummary}>
                <Feather name="star" size={28} color="rgba(152,212,250,0.35)" />
                <Text style={styles.noSummaryTitle}>No summary yet for this day</Text>
                {entries.length > 0 ? (
                  <TouchableOpacity
                    style={styles.generateBtn}
                    onPress={() => gatedHandleGenerate(viewingDate)}
                    disabled={!!generatingDate}
                    activeOpacity={0.85}
                  >
                    {generatingDate === viewingDate
                      ? <ActivityIndicator size="small" color="rgba(224,242,254,0.90)" />
                      : <Text style={styles.generateBtnText}>Generate summary</Text>}
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.noSummaryBody}>
                    Nothing recorded for this day.
                  </Text>
                )}
              </View>
            )}

            {/* Raw entries disclosure */}
            <TouchableOpacity
              style={styles.rawToggle}
              onPress={() => setRawOpen(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.rawToggleLabel}>
                {rawOpen ? 'Hide raw entries' : `Show raw entries (${entries.length})`}
              </Text>
              <Feather
                name={rawOpen ? 'chevron-up' : 'chevron-down'}
                size={13}
                color="rgba(152,212,250,0.55)"
              />
            </TouchableOpacity>

            {rawOpen && (
              <View style={styles.rawBlock}>
                {entries.length > 3 && (
                  <View style={styles.rawSearchBox}>
                    <Feather name="search" size={12} color="rgba(152,212,250,0.55)" />
                    <TextInput
                      style={styles.rawSearchInput}
                      placeholder="Search this day…"
                      placeholderTextColor="rgba(152,212,250,0.40)"
                      value={rawSearch}
                      onChangeText={setRawSearch}
                    />
                    {rawSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setRawSearch('')}>
                        <Feather name="x" size={12} color="rgba(152,212,250,0.55)" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <DayRawEntries
                  entries={entries}
                  query={rawSearch}
                  date={viewingDate}
                  onEdit={handleEditEntry}
                />
              </View>
            )}
          </ScrollView>
        </>
      )}

      {/* Search modal */}
      <GlobalSearchModal
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        onHit={(hit) => {
          setViewingDate(hit.date);
          setMode('day');
          setRawOpen(true);
          setRawSearch(hit.entry.text.slice(0, 32));
        }}
      />

      {/* Perspective modal — opens for either a day summary tap OR a digest
          prompt-chip tap. The summary path passes a `summary` prop to
          ChatScreen; the prompt path doesn't (chat is anchored on the
          sourceContext alone, same as Home's chip-tap flow). */}
      <Modal
        visible={!!perspectiveSummary || showPromptChat}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setPerspectiveSummary(null);
          setShowPromptChat(false);
          setCallMindId(undefined);
          setChatInitialMindId(undefined);
          setChatSourceContext(null);
          setResumeChatInput(null);
        }}
      >
        {(perspectiveSummary || showPromptChat) && callMindId === undefined && (
          <ChatScreen
            summary={perspectiveSummary ?? undefined}
            initialMindId={chatInitialMindId}
            sourceContext={chatSourceContext}
            resumeChat={resumeChatInput ?? undefined}
            onClose={() => {
              setPerspectiveSummary(null);
              setShowPromptChat(false);
              setChatInitialMindId(undefined);
              setChatSourceContext(null);
              setResumeChatInput(null);
              // Refresh the saved-chats list so a just-saved chat appears /
              // a newly-updated chat's shape re-renders.
              getSavedChatsForDate(viewingDate).then(setSavedChatsForViewing);
            }}
            onCallRequested={(mindId) => setCallMindId(mindId ?? null)}
          />
        )}
        {(perspectiveSummary || showPromptChat) && callMindId !== undefined && (
          <TalkScreen
            summary={perspectiveSummary ?? undefined}
            initialMindId={callMindId}
            sourceContext={chatSourceContext}
            onClose={() => {
              setPerspectiveSummary(null);
              setShowPromptChat(false);
              setCallMindId(undefined);
              setChatInitialMindId(undefined);
              setChatSourceContext(null);
            }}
          />
        )}
      </Modal>

      {/* Curated mind picker */}
      <CuratedMindPicker
        visible={!!curation}
        result={curation}
        wellbeingState={curationWellbeing}
        onPick={openChatWithCuratedMind}
        onClose={() => {
          setCuration(null);
          setCurationWellbeing(undefined);
          pendingPerspectiveRef.current = null;
        }}
      />

      <ComposeModal
        visible={composeOpen}
        editEntry={editingEntry ?? undefined}
        onClose={() => { setComposeOpen(false); setEditingEntry(null); }}
        onSaved={async () => {
          setComposeOpen(false);
          setEditingEntry(null);
          const updated = await StorageService.getTranscriptsForDate(viewingDate);
          setEntries(updated);
        }}
        onDelete={async () => {
          setComposeOpen(false);
          setEditingEntry(null);
          const updated = await StorageService.getTranscriptsForDate(viewingDate);
          setEntries(updated);
        }}
      />

      <PaywallModal
        visible={showPaywall}
        featureHint={paywallHint}
        onClose={() => {
          setShowPaywall(false);
          pendingGenerateDateRef.current = null;
          pendingPerspectiveRef.current = null;
        }}
        onSuccess={() => {
          setShowPaywall(false);
          if (pendingGenerateDateRef.current) {
            const d = pendingGenerateDateRef.current;
            pendingGenerateDateRef.current = null;
            handleGenerate(d);
          } else if (pendingPerspectiveRef.current) {
            const s = pendingPerspectiveRef.current;
            pendingPerspectiveRef.current = null;
            setCallMindId(undefined);
            setPerspectiveSummary(s);
          }
        }}
      />
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 20, fontWeight: '500',
    color: 'rgba(224,242,254,0.95)', fontFamily: 'Baskerville',
    textAlign: 'center',
  },
  toggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.20)',
    overflow: 'hidden',
  },
  toggleBtn: {
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: 'rgba(9,41,173,0.08)',
  },
  toggleBtnActive: { backgroundColor: 'rgba(9,41,173,0.60)' },
  toggleText: {
    fontSize: 12, letterSpacing: 0.3,
    color: 'rgba(152,212,250,0.70)',
    fontFamily: 'GillSans-Light',
  },
  toggleTextActive: { color: 'rgba(224,242,254,0.95)' },

  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 20, paddingVertical: 8,
  },
  dateArrow: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(9,41,173,0.10)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.18)',
  },
  dateLabel: {
    fontSize: 14, fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.90)',
    minWidth: 180, textAlign: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 28 },

  summaryCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#02060E',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.15)',
    marginTop: 8, marginBottom: 14,
    minHeight: 360,
  },

  loadingBox: { alignItems: 'center', padding: 40 },

  noSummary: {
    alignItems: 'center', gap: 12,
    padding: 32,
    borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.13)',
    backgroundColor: 'rgba(3,18,40,0.55)',
    marginTop: 8, marginBottom: 14,
  },
  noSummaryTitle: {
    fontSize: 15, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.88)',
  },
  noSummaryBody: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.60)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
  },
  generateBtn: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(9,41,173,0.55)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.28)',
  },
  generateBtnText: {
    fontSize: 13, color: 'rgba(224,242,254,0.92)',
    fontFamily: 'GillSans-Light',
  },

  rawToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, marginBottom: 4,
  },
  rawToggleLabel: {
    fontSize: 12, letterSpacing: 0.3,
    color: 'rgba(152,212,250,0.70)',
    fontFamily: 'GillSans-Light',
  },
  rawBlock: { paddingBottom: 10, paddingHorizontal: 4 },

  rawSearchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.18)',
    backgroundColor: 'rgba(9,41,173,0.10)',
  },
  rawSearchInput: {
    flex: 1,
    color: 'rgba(224,242,254,0.90)',
    fontSize: 13, fontFamily: 'GillSans-Light',
    padding: 0, margin: 0,
  },
});

const dr = StyleSheet.create({
  card: {
    padding: 12, marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.10)',
    backgroundColor: 'rgba(3,18,40,0.55)',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  tapHint: {
    marginLeft: 'auto',
    fontSize: 10,
    color: 'rgba(152,212,250,0.35)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.2,
  },
  time: {
    fontSize: 11, letterSpacing: 0.3,
    color: 'rgba(152,212,250,0.70)',
    fontFamily: 'GillSans-Light',
  },
  duration: {
    fontSize: 10,
    color: 'rgba(152,212,250,0.50)',
    fontFamily: 'GillSans-Light',
  },
  text: {
    fontSize: 13, lineHeight: 19,
    color: 'rgba(224,242,254,0.85)',
    fontFamily: 'GillSans-Light',
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(9,41,173,0.20)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.22)',
  },
  tagText: {
    fontSize: 10,
    color: 'rgba(224,242,254,0.85)',
    fontFamily: 'GillSans-Light',
  },
  photo: {
    width: '100%', height: 160,
    marginTop: 10,
    borderRadius: 10,
  },
  empty: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center', padding: 20,
  },
});

const gs = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(152,212,250,0.10)',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(9,41,173,0.10)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.18)',
  },
  searchInput: {
    flex: 1,
    color: 'rgba(224,242,254,0.90)',
    fontSize: 14, fontFamily: 'GillSans-Light',
    padding: 0, margin: 0,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  hint: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
  },
  hit: {
    paddingVertical: 10, paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(3,18,40,0.55)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.10)',
  },
  hitMeta: {
    fontSize: 10, letterSpacing: 0.4,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  hitText: {
    fontSize: 13, lineHeight: 19,
    color: 'rgba(224,242,254,0.85)',
    fontFamily: 'GillSans-Light',
  },
});
