/**
 * NewDaySummaryView — day-summary card.
 *
 * Layout (top → bottom):
 *   1. Jellyfish artwork header (existing)
 *   2. Mood hint (evening word from moodArc, if present)
 *   3. Reflection prose
 *   4. Mood arc — three dots with emotion words
 *   5. "What the day held" — only categories actually present
 *   6. "Get a new perspective" CTA
 *   7. "More about this day" disclosure (existing insight + macros + breakdown)
 *   8. Wisdom short matched to the day's emotional signal
 *
 * Sections 2/4/5/8 only render when their data is present, so a sparse day
 * (one entry, old summary without new fields, missing wisdom library) renders
 * cleanly rather than showing empty scaffolding.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Markdown from 'react-native-markdown-display';
import { useNavigation } from '@react-navigation/native';

import { DailySummary, DayMacros, UserGoals, WisdomShort, JournalSignal } from '../types';
import { renderInsightSections } from './InsightSections';
import { StorageService } from '../services/StorageService';
import { getShortsLibrary } from '../services/SupabaseService';
import { buildFeed, flattenFeed, extractJournalSignal } from '../services/WisdomService';
import type { SavedChat } from '../services/SavedChatService';
import { MIND_DISPLAY_NAMES } from '../services/mindCuration';

interface Props {
  item: DailySummary;
  enabledTrackers: Set<string> | null;
  mealMacrosByDate: Record<string, DayMacros>;
  goals: UserGoals | null;
  staleCount: number;
  generatingDate: string | null;
  onGenerate: (date: string) => void;
  onDownload: (item: DailySummary) => void;
  onPerspective: (item: DailySummary) => void;
  savedChats?: SavedChat[];
  onContinueChat?: (chatId: string) => void;
}

function mindDisplayName(mindId: string | null): string {
  if (mindId === null) return MIND_DISPLAY_NAMES['companion'] ?? 'Companion';
  return MIND_DISPLAY_NAMES[mindId] ?? mindId;
}

const markdownStyles = {
  body: { color: 'rgba(152, 212, 250, 0.65)', fontSize: 14, lineHeight: 22, fontFamily: 'GillSans-Light' },
  heading2: {
    color: 'rgba(224, 242, 254, 0.95)',
    fontSize: 15,
    fontWeight: '500' as const,
    fontFamily: 'Baskerville',
    marginTop: 12,
    marginBottom: 4,
    borderBottomWidth: 0,
  },
  bullet_list: { marginLeft: 0 },
  bullet_list_item: { color: 'rgba(152, 212, 250, 0.65)', marginBottom: 2, fontFamily: 'GillSans-Light' },
  bullet_list_icon: { color: 'rgba(152, 212, 250, 0.85)', marginTop: 5 },
  strong: { color: 'rgba(224, 242, 254, 0.95)', fontWeight: '500' as const, fontFamily: 'GillSans-Light' },
  paragraph: { marginTop: 0, marginBottom: 4 },
};

function formatDate(date: string): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  const yy = yd.getFullYear();
  const ym = String(yd.getMonth() + 1).padStart(2, '0');
  const ydd = String(yd.getDate()).padStart(2, '0');
  const yesterdayStr = `${yy}-${ym}-${ydd}`;
  if (date === todayStr) return 'Today';
  if (date === yesterdayStr) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatCreatedAt(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Wisdom short card ─────────────────────────────────────────────────────────

function WisdomShortBlock({ summaryText, dayDate }: { summaryText: string; dayDate: string }) {
  const navigation = useNavigation<any>();
  const [short, setShort] = useState<WisdomShort | null>(null);
  const [signal, setSignal] = useState<JournalSignal | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [library, seenIds, savedIds, sig] = await Promise.all([
          getShortsLibrary(),
          StorageService.getSeenShortIds().then(ids => new Set(ids)),
          StorageService.getSavedShorts().then(s => new Set(s.map(x => x.shortId))),
          summaryText ? extractJournalSignal(summaryText) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (!library || library.length === 0) { setLoaded(true); return; }
        setSignal(sig);
        const feed = buildFeed(sig, savedIds, seenIds, undefined, library);
        const ordered = flattenFeed(feed);
        if (!cancelled) setShort(ordered[0] ?? null);
      } catch {
        // swallow — just don't render the section
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [dayDate, summaryText]);

  if (!loaded || !short) return null;

  // Find the best "because" topic from the journal signal
  let becauseTopic: string | null = null;
  let becauseValue: string | null = null; // raw tag value for filtering
  if (signal) {
    for (const e of signal.emotional_states) {
      if (short.emotional_states.includes(e)) { becauseTopic = `feeling ${e}`; becauseValue = e; break; }
    }
    if (!becauseTopic) {
      for (const c of signal.cognitive_patterns) {
        if (short.cognitive_patterns.includes(c)) { becauseTopic = c; becauseValue = c; break; }
      }
    }
    if (!becauseTopic) {
      for (const t of signal.themes) {
        if (short.themes.includes(t)) { becauseTopic = t; becauseValue = t; break; }
      }
    }
    if (!becauseTopic) {
      if (signal.emotional_states.length > 0) { becauseTopic = `feeling ${signal.emotional_states[0]}`; becauseValue = signal.emotional_states[0]; }
      else if (signal.cognitive_patterns.length > 0) { becauseTopic = signal.cognitive_patterns[0]; becauseValue = signal.cognitive_patterns[0]; }
      else if (signal.themes.length > 0) { becauseTopic = signal.themes[0]; becauseValue = signal.themes[0]; }
    }
  }

  return (
    <View style={styles.wisdomBlock}>
      <Text style={styles.sitWithLabel}>SOMETHING TO SIT WITH</Text>
      <TouchableOpacity
        style={styles.wisdomCard}
        onPress={() => navigation.navigate('Wisdom', {
          shortId: short.id,
          ...(signal && becauseTopic ? {
            becauseSignal: JSON.stringify(signal),
            becauseLabel: becauseTopic,
          } : {}),
        })}
        activeOpacity={0.85}
      >
        {becauseTopic && (
          <View style={styles.wisdomBecauseRow}>
            <Feather name="book-open" size={10} color="rgba(152,212,250,0.45)" />
            <Text style={styles.wisdomBecauseText}>
              Because you talked about{' '}
              <Text style={styles.wisdomBecauseTopic}>{becauseTopic}</Text>
            </Text>
          </View>
        )}
        <Text style={styles.wisdomQuote} numberOfLines={4}>
          {short.pullquote || short.short || short.title}
        </Text>
        <View style={styles.wisdomFooter}>
          <Text style={styles.wisdomAuthor} numberOfLines={1}>
            {short.source_author}
          </Text>
          <Feather name="arrow-right" size={14} color="rgba(152,212,250,0.55)" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ── Mood arc ──────────────────────────────────────────────────────────────────

function MoodArc({ arc }: { arc: NonNullable<DailySummary['moodArc']> }) {
  const slots: Array<['morning' | 'afternoon' | 'evening', string]> = [
    ['morning', arc.morning],
    ['afternoon', arc.afternoon],
    ['evening', arc.evening],
  ];
  return (
    <View style={styles.moodArcRow}>
      {slots.map(([period, word], i) => (
        <View key={period} style={styles.moodArcSlot}>
          <View style={styles.moodArcDot} />
          <Text style={styles.moodArcWord}>{word.toLowerCase()}</Text>
          <Text style={styles.moodArcPeriod}>{period}</Text>
          {i < 2 && <View style={styles.moodArcConnector} pointerEvents="none" />}
        </View>
      ))}
    </View>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function NewDaySummaryView({
  item,
  enabledTrackers,
  mealMacrosByDate,
  goals,
  staleCount,
  generatingDate,
  onGenerate,
  onDownload,
  onPerspective,
  savedChats,
  onContinueChat,
}: Props) {

  const moodHint = useMemo(() => {
    // Show the evening word as a small mood hint near the prose. We deliberately
    // don't guess an emoji — the persisted summary has no stored emoji, so a
    // subtle colored dot + word reads more honest than an invented mapping.
    if (item.moodArc && item.moodArc.evening) return item.moodArc.evening;
    return null;
  }, [item.moodArc]);

  const hasNewFields = !!(item.reflection || item.whatTheDayHeld?.length || item.moodArc);

  return (
    <>
      {/* Header — same artwork/gradient as the existing view */}
      {item.imageUri ? (
        <ImageBackground
          source={{ uri: item.imageUri }}
          style={styles.cardImageHeader}
          imageStyle={styles.cardImageStyle}
          resizeMode="cover"
        >
          <LinearGradient
            colors={['transparent', 'rgba(2,6,14,0.55)', 'rgba(2,6,14,0.92)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.cardHeaderOnImage}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
              <Text style={styles.cardMeta}>
                {item.transcriptCount} entr{item.transcriptCount !== 1 ? 'ies' : 'y'}
                {' · '}generated {formatCreatedAt(item.createdAt)}
              </Text>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                onPress={() => onDownload(item)}
                style={styles.actionBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="download" size={13} color="rgba(152, 212, 250, 0.85)" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onGenerate(item.date)}
                disabled={!!generatingDate}
                style={styles.actionBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {generatingDate === item.date
                  ? <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.65)" />
                  : <Feather name="refresh-cw" size={13} color="rgba(152, 212, 250, 0.65)" />}
              </TouchableOpacity>
            </View>
          </View>
        </ImageBackground>
      ) : (
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
            <Text style={styles.cardMeta}>
              {item.transcriptCount} entr{item.transcriptCount !== 1 ? 'ies' : 'y'}
              {' · '}generated {formatCreatedAt(item.createdAt)}
            </Text>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity
              onPress={() => onDownload(item)}
              style={styles.actionBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="download" size={13} color="rgba(152, 212, 250, 0.85)" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onGenerate(item.date)}
              disabled={!!generatingDate}
              style={styles.actionBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {generatingDate === item.date
                ? <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.65)" />
                : <Feather name="refresh-cw" size={13} color="rgba(152, 212, 250, 0.65)" />}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {staleCount > 0 && (
        <View style={styles.staleBanner}>
          <Feather name="clock" size={11} color="rgba(152,212,250,0.55)" />
          <Text style={styles.staleText}>
            {staleCount} new entr{staleCount === 1 ? 'y' : 'ies'} since this summary
          </Text>
          <TouchableOpacity
            onPress={() => onGenerate(item.date)}
            disabled={generatingDate === item.date}
            style={[styles.staleBtn, generatingDate === item.date && { opacity: 0.5 }]}
            activeOpacity={0.75}
          >
            <Text style={styles.staleBtnText}>
              {generatingDate === item.date ? 'Regenerating…' : 'Regenerate'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.cardScroll}>
        {/* Mood hint — small, sits just above the prose */}
        {moodHint && (
          <View style={styles.moodHintRow}>
            <View style={styles.moodHintDot} />
            <Text style={styles.moodHintText}>{moodHint.toLowerCase()}</Text>
          </View>
        )}

        {/* Reflection prose — serif for warmth */}
        {item.reflection ? (
          <Text style={styles.reflectionProse}>{item.reflection}</Text>
        ) : item.insightText ? (
          // Legacy summary under the flag — still give the user something warm
          // to read at the top rather than dropping straight into categories.
          <Text style={styles.reflectionFallback}>
            This summary was generated before the new reflection format. Tap
            "More about this day" for the categorised breakdown.
          </Text>
        ) : null}

        {/* Mood arc — three dots across the day */}
        {item.moodArc && <MoodArc arc={item.moodArc} />}

        {/* What the day held — adaptive label/sentence pairs */}
        {item.whatTheDayHeld && item.whatTheDayHeld.length > 0 && (
          <View style={styles.whatHeldBlock}>
            <Text style={styles.whatHeldTitle}>What the day held</Text>
            {item.whatTheDayHeld.map((row, i) => (
              <View key={`${row.label}-${i}`} style={styles.whatHeldRow}>
                <Text style={styles.whatHeldLabel}>{row.label}</Text>
                <Text style={styles.whatHeldContent}>{row.content}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Reflection history — saved chats the user can resume */}
        {savedChats && savedChats.length > 0 ? (
          <View style={styles.reflectionHistoryBlock}>
            <Text style={styles.reflectionHistoryTitle}>Reflection history</Text>
            {savedChats.map(chat => (
              <View key={chat.id} style={styles.reflectionHistoryRow}>
                <View style={styles.reflectionHistoryText}>
                  <Text style={styles.reflectionHistoryMind}>
                    Chat with {mindDisplayName(chat.mindId)}
                  </Text>
                  {chat.shape ? (
                    <Text style={styles.reflectionHistoryShape} numberOfLines={2}>
                      {chat.shape}
                    </Text>
                  ) : null}
                </View>
                {onContinueChat && (
                  <TouchableOpacity
                    style={styles.reflectionHistoryContinueBtn}
                    onPress={() => onContinueChat(chat.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.reflectionHistoryContinueBtnText}>Continue</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        ) : null}

        {/* Primary CTA — inline so it reads as the natural next action */}
        <TouchableOpacity
          style={styles.perspectiveBtn}
          onPress={() => onPerspective(item)}
          activeOpacity={0.85}
        >
          <Feather name="compass" size={15} color="rgba(224, 242, 254, 0.95)" />
          <Text style={styles.perspectiveBtnText}>Get a new perspective</Text>
        </TouchableOpacity>


        {/* Wisdom short — fire-and-forget; renders nothing if library unavailable */}
        <WisdomShortBlock summaryText={item.insightText ?? item.summary ?? ''} dayDate={item.date} />

        {/* When the flag is on but this card was generated before the new fields
            existed, let the user know the new view is still useful */}
        {!hasNewFields && !item.insightText && (
          <View style={styles.legacyNudge}>
            <Feather name="refresh-cw" size={12} color="rgba(152,212,250,0.45)" />
            <Text style={styles.legacyNudgeText}>Regenerate to see the new summary</Text>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  // Header (matches existing card visuals)
  cardImageHeader: { width: '100%', height: 190, justifyContent: 'flex-end' },
  cardImageStyle: { opacity: 0.90 },
  cardHeaderOnImage: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-end', paddingHorizontal: 18, paddingBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', padding: 18, paddingBottom: 0,
  },
  cardHeaderLeft: { flex: 1 },
  cardDate: {
    fontSize: 20, fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)', marginBottom: 3, fontFamily: 'Baskerville',
  },
  cardMeta: { fontSize: 12, color: 'rgba(152, 212, 250, 0.60)', fontFamily: 'GillSans-Light' },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(2, 6, 14, 0.60)',
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.20)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Stale banner
  staleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(9,41,173,0.18)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(152,212,250,0.14)',
  },
  staleText: {
    flex: 1, fontSize: 12, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.80)',
  },
  staleBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(9,41,173,0.50)',
    borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.35)',
  },
  staleBtnText: { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.90)' },

  // Content body
  cardScroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, backgroundColor: '#02060E' },

  // Mood hint
  moodHintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 10,
  },
  moodHintDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(152,212,250,0.60)',
  },
  moodHintText: {
    fontSize: 12, letterSpacing: 0.6,
    color: 'rgba(152,212,250,0.70)', fontFamily: 'GillSans-Light',
    textTransform: 'uppercase',
  },

  // Reflection
  reflectionProse: {
    fontSize: 14, lineHeight: 21,
    color: 'rgba(224, 242, 254, 0.88)',
    fontFamily: 'GillSans-Light',
    marginBottom: 18,
  },
  reflectionFallback: {
    fontSize: 14, lineHeight: 22,
    color: 'rgba(152,212,250,0.60)',
    fontFamily: 'GillSans-Light',
    fontStyle: 'italic',
    marginBottom: 16,
  },

  // Mood arc
  moodArcRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22, marginTop: 4,
    paddingHorizontal: 4,
  },
  moodArcSlot: {
    flex: 1, alignItems: 'center', position: 'relative',
  },
  moodArcDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: 'rgba(152,212,250,0.70)',
    marginBottom: 6,
    shadowColor: '#98D4FA',
    shadowOpacity: 0.45,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  moodArcWord: {
    fontSize: 13,
    color: 'rgba(224,242,254,0.88)',
    fontFamily: 'GillSans-Light',
    marginBottom: 2,
  },
  moodArcPeriod: {
    fontSize: 10, letterSpacing: 0.5,
    color: 'rgba(152,212,250,0.50)',
    fontFamily: 'GillSans-Light',
    textTransform: 'uppercase',
  },
  moodArcConnector: {
    position: 'absolute',
    top: 4, right: -50, width: 100, height: 1,
    backgroundColor: 'rgba(152,212,250,0.18)',
  },

  // What the day held
  whatHeldBlock: { marginBottom: 20 },
  whatHeldTitle: {
    fontSize: 14, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.92)',
    marginBottom: 10,
  },
  whatHeldRow: { marginBottom: 10 },
  whatHeldLabel: {
    fontSize: 11, letterSpacing: 0.6,
    color: 'rgba(152,212,250,0.75)',
    fontFamily: 'GillSans-Light',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  whatHeldContent: {
    fontSize: 14, lineHeight: 21,
    color: 'rgba(224,242,254,0.85)',
    fontFamily: 'GillSans-Light',
  },

  // Reflection history block
  reflectionHistoryBlock: {
    marginBottom: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152,212,250,0.10)',
  },
  reflectionHistoryTitle: {
    fontSize: 14, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.92)',
    marginBottom: 10,
  },
  reflectionHistoryRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(152,212,250,0.10)',
  },
  reflectionHistoryText: { flex: 1 },
  reflectionHistoryMind: {
    fontSize: 13, fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.90)',
    marginBottom: 2,
  },
  reflectionHistoryShape: {
    fontSize: 12, lineHeight: 17,
    color: 'rgba(152,212,250,0.70)',
    fontFamily: 'GillSans-Light',
    fontStyle: 'italic',
  },
  reflectionHistoryContinueBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(9, 41, 173, 0.35)',
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.30)',
  },
  reflectionHistoryContinueBtnText: {
    fontSize: 12, fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.92)',
  },

  // Perspective CTA
  perspectiveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
    backgroundColor: 'rgba(9, 41, 173, 0.55)',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.28)',
    marginBottom: 18,
  },
  perspectiveBtnText: {
    fontSize: 15, color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'GillSans-Light', letterSpacing: 0.2,
  },


  // Wisdom short block
  wisdomBlock: { marginTop: 20 },
  sitWithLabel: {
    fontSize: 10, fontWeight: '500', letterSpacing: 0.8,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    marginBottom: 8,
  },
  wisdomCard: {
    backgroundColor: 'rgba(9,41,173,0.12)',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.18)',
    padding: 16,
  },
  wisdomBecauseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10,
  },
  wisdomBecauseText: {
    fontSize: 11, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.45)', fontStyle: 'italic',
  },
  wisdomBecauseTopic: {
    color: 'rgba(152,212,250,0.72)', fontStyle: 'italic',
  },
  wisdomQuote: {
    fontSize: 15, lineHeight: 23,
    color: 'rgba(224,242,254,0.90)',
    fontFamily: 'Baskerville',
    marginBottom: 10,
  },
  wisdomFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8,
  },
  wisdomAuthor: {
    flex: 1,
    fontSize: 12, letterSpacing: 0.3,
    color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
  },

  // Legacy nudge (flag-on path, empty summary)
  legacyNudge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 4, marginTop: 10,
  },
  legacyNudgeText: {
    fontSize: 13, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.55)', fontStyle: 'italic',
  },
});
