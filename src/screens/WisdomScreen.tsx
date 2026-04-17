/**
 * WisdomScreen — daily-rotating feed of Wisdom Shorts.
 *
 * Feed refresh:
 *   • Date-seeded daily rotation — new order every day, stable within a day.
 *   • Mood picker — tap how you feel right now; re-ranks the whole feed instantly.
 *   • Filter sheet — tap the Filter button to open a bottom sheet with emotion filters.
 *   • Journal signal (if present from a past entry) is overridden by the mood picker
 *     while the mood is selected; reverts when cleared.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Modal,
  Platform,
  Dimensions,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { WisdomShort, JournalSignal, TranscriptEntry, LoopState } from '../types';
import { SHORTS_LIBRARY } from '../data/shortsLibrary';
import { StorageService } from '../services/StorageService';
import { FeatureFlagsService } from '../services/FeatureFlagsService';
import {
  buildFeed, flattenFeed, MOODS, Mood, extractJournalSignal,
  computeLoopState, pickShortForPlacement,
} from '../services/WisdomService';
import { getCachedReport } from '../services/PatternsService';
import { getShortsLibrary } from '../services/SupabaseService';
import { track } from '../services/AnalyticsService';
import { UserContextService } from '../services/UserContextService';
import ShortCard from '../components/ShortCard';
import ReflectPromptModal from '../components/ReflectPromptModal';
import ShareModal from '../components/ShareModal';

// All available emotion filters
const FILTER_EMOTIONS = [
  'anxious', 'overwhelmed', 'stuck', 'lonely', 'comparing',
  'burned-out', 'self-critical', 'hopeless', 'restless', 'angry',
  'unfulfilled', 'disconnected', 'purposeless', 'conflicted', 'performing',
];

// ── Filter Sheet ──────────────────────────────────────────────────────────────

function FilterSheet({
  visible,
  selectedEmotion,
  onSelect,
  onClear,
  onClose,
}: {
  visible: boolean;
  selectedEmotion: string | null;
  onSelect: (emotion: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity style={sheetStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={sheetStyles.sheet}>
        {/* Handle */}
        <View style={sheetStyles.handle} />

        {/* Header */}
        <View style={sheetStyles.header}>
          <Text style={sheetStyles.title}>Filter by state</Text>
          <TouchableOpacity onPress={onClose} style={sheetStyles.closeBtn}>
            <Feather name="x" size={18} color="rgba(152,212,250,0.60)" />
          </TouchableOpacity>
        </View>

        <Text style={sheetStyles.subtitle}>
          What are you feeling right now? We'll surface shorts that speak to it.
        </Text>

        {/* Emotion grid */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={sheetStyles.grid}
        >
          {FILTER_EMOTIONS.map(emotion => {
            const active = selectedEmotion === emotion;
            return (
              <TouchableOpacity
                key={emotion}
                style={[sheetStyles.chip, active && sheetStyles.chipActive]}
                onPress={() => {
                  if (active) {
                    onClear();
                  } else {
                    onSelect(emotion);
                  }
                  onClose();
                }}
              >
                <Text style={[sheetStyles.chipText, active && sheetStyles.chipTextActive]}>
                  {emotion}
                </Text>
                {active && (
                  <Feather name="check" size={11} color="rgba(224,242,254,0.95)" style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Clear button */}
        {selectedEmotion && (
          <TouchableOpacity
            style={sheetStyles.clearBtn}
            onPress={() => { onClear(); onClose(); }}
          >
            <Text style={sheetStyles.clearText}>Clear filter</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: Math.max(16, insets.bottom) }} />
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.60)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#040d1e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152,212,250,0.15)',
    maxHeight: '75%',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(152,212,250,0.25)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(224,242,254,0.95)',
    fontFamily: 'Baskerville',
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.50)',
    fontFamily: 'GillSans-Light',
    marginBottom: 16,
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    paddingBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(152,212,250,0.04)',
  },
  chipActive: {
    backgroundColor: 'rgba(152,212,250,0.18)',
    borderColor: 'rgba(152,212,250,0.55)',
  },
  chipText: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.55)',
    fontWeight: '500',
    fontFamily: 'GillSans-Light',
  },
  chipTextActive: {
    color: 'rgba(224,242,254,0.95)',
    fontWeight: '600',
  },
  clearBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.18)',
    alignItems: 'center',
    backgroundColor: 'rgba(152,212,250,0.04)',
  },
  clearText: {
    fontSize: 14,
    color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
  },
});

export default function WisdomScreen() {
  const route = useRoute<any>();
  const [savedIds, setSavedIds]               = useState<Set<string>>(new Set());
  const [seenIds, setSeenIds]                 = useState<Set<string>>(new Set());
  const [journalSignal, setJournalSignal]     = useState<JournalSignal | null>(null);
  const [selectedMoodId, setSelectedMoodId]   = useState<string | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [becauseFilter, setBecauseFilter]     = useState<{ signal: JournalSignal; label: string } | null>(null);
  const [showSaved, setShowSaved]             = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [reflectShort, setReflectShort]       = useState<WisdomShort | null>(null);
  const [shareShort, setShareShort]           = useState<WisdomShort | null>(null);
  const [customShorts, setCustomShorts]       = useState<WisdomShort[]>([]);
  // Supabase library — starts with bundled shorts for instant display, refreshes from remote
  const [remoteLibrary, setRemoteLibrary]     = useState<WisdomShort[]>(SHORTS_LIBRARY);
  // Stance / loop state (ff_new_minds_system)
  const [stanceEnabled, setStanceEnabled]     = useState(false);
  const [loopState, setLoopState]             = useState<LoopState>('fresh');
  const [forYouToday, setForYouToday]         = useState<WisdomShort | null>(null);
  // Pagination
  const [currentIndex, setCurrentIndex]       = useState(0);
  const currentIndexRef                       = useRef(0);
  const flatListRef                           = useRef<FlatList<WisdomShort>>(null);

  // ── Pagination helpers ────────────────────────────────────────────────────
  const scrollToIndex = useCallback((idx: number, animated = true) => {
    currentIndexRef.current = idx;
    setCurrentIndex(idx);
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: idx, animated, viewPosition: 0 });
    }, 50);
  }, []);

  // ── Load stored state + remote library on focus ───────────────────────────
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [saved, seen, sig, customs, flagOn] = await Promise.all([
          StorageService.getSavedShorts(),
          StorageService.getSeenShortIds(),
          StorageService.getJournalSignal(),
          StorageService.getCustomShorts(),
          FeatureFlagsService.getFlag('ff_new_minds_system'),
        ]);
        if (!active) return;
        setSavedIds(new Set(saved.map(s => s.shortId)));
        setSeenIds(new Set(seen));
        setCustomShorts(customs);
        setStanceEnabled(flagOn);

        const SIGNAL_TTL = 24 * 60 * 60 * 1000; // 24 hours
        const signalStale = !sig?.extractedAt || (Date.now() - sig.extractedAt > SIGNAL_TTL);

        if (sig && !signalStale) {
          setJournalSignal(sig);
        } else {
          setJournalSignal(sig);
          const summaries = await StorageService.getSummaryDates();
          if (summaries.length > 0 && active) {
            const latest = await StorageService.getSummaryForDate(summaries[0]);
            const latestText = latest?.insightText ?? latest?.summary;
            if (latestText && active) {
              extractJournalSignal(latestText)
                .then(fresh => { if (active && fresh) setJournalSignal(fresh); })
                .catch(() => {});
            }
          }
        }

        // Load library from Supabase (cache-first, background refresh)
        const lib = await getShortsLibrary((fresh) => {
          if (active) setRemoteLibrary(fresh);
        });
        if (active && lib.length > 0) setRemoteLibrary(lib);

        // Stance: derive loop state and pick "For you today" (ff_new_minds_system)
        if (flagOn) {
          const report = await getCachedReport();
          const loop = computeLoopState(report);
          if (active) setLoopState(loop);
          const library = lib.length > 0 ? lib : SHORTS_LIBRARY;
          const today = await pickShortForPlacement('wisdom_tab', sig, loop, library);
          if (active) setForYouToday(today);
        }
      })();
      return () => { active = false; };
    }, []),
  );

  // ── Active signal: mood picker overrides journal signal ────────────────────
  const activeSignal = useMemo<JournalSignal | null>(() => {
    if (selectedMoodId) {
      return MOODS.find(m => m.id === selectedMoodId)?.signal ?? null;
    }
    return journalSignal;
  }, [selectedMoodId, journalSignal]);

  // ── Merged library (remote/curated + custom) ──────────────────────────────
  const fullLibrary = useMemo<WisdomShort[]>(
    () => [...remoteLibrary, ...customShorts],
    [remoteLibrary, customShorts],
  );

  // ── Build feed ─────────────────────────────────────────────────────────────
  const feed = useMemo<WisdomShort[]>(() => {
    if (showSaved) {
      return fullLibrary.filter(s => savedIds.has(s.id));
    }

    // Because filter: rank the full library using the day's extracted signal so
    // the cards shown are genuinely related to what was written that day.
    if (becauseFilter) {
      const feedSelection = buildFeed(becauseFilter.signal, savedIds, seenIds, undefined, fullLibrary);
      return flattenFeed(feedSelection);
    }

    const feedOptions = stanceEnabled
      ? { loopState, placement: 'wisdom_tab' as const, stanceEnabled: true }
      : undefined;
    const feedSelection = buildFeed(
      activeSignal, savedIds, seenIds, selectedEmotion ?? undefined, fullLibrary, feedOptions,
    );
    let flat = flattenFeed(feedSelection);

    // Prepend "For you today" as the first card when the flag is on and not
    // already at position 0. Deduplicate its occurrence further in the feed.
    if (stanceEnabled && forYouToday) {
      flat = [forYouToday, ...flat.filter(s => s.id !== forYouToday.id)];
    }

    return flat;
  }, [activeSignal, savedIds, seenIds, selectedEmotion, becauseFilter, showSaved, fullLibrary, stanceEnabled, loopState, forYouToday]);

  // ── Deep-link: scroll to a specific short (from notification tap) ─────────
  useEffect(() => {
    const shortId = route.params?.shortId as string | undefined;
    if (!shortId || feed.length === 0) return;
    const idx = feed.findIndex(s => s.id === shortId);
    if (idx !== -1) scrollToIndex(idx, false);
  }, [route.params?.shortId, feed]);

  // ── Because filter: set from navigation params (e.g. tapping a summary card) ─
  useEffect(() => {
    const raw = route.params?.becauseSignal as string | undefined;
    const label = route.params?.becauseLabel as string | undefined;
    if (!raw || !label) return;
    try {
      const signal = JSON.parse(raw) as JournalSignal;
      setBecauseFilter({ signal, label });
      setSelectedEmotion(null);
      setSelectedMoodId(null);
      scrollToIndex(0, false);
    } catch { /* malformed param — ignore */ }
  }, [route.params?.becauseSignal, route.params?.becauseLabel]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (id: string) => {
    track('wisdom_short_saved', { short_id: id });
    await StorageService.saveShort(id);
    setSavedIds(prev => new Set([...prev, id]));
  }, []);

  const handleUnsave = useCallback(async (id: string) => {
    track('wisdom_short_unsaved', { short_id: id });
    await StorageService.unsaveShort(id);
    setSavedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleRead = useCallback((short: WisdomShort) => {
    StorageService.markShortSeen(short.id).catch(() => {});
    setSeenIds(prev => new Set([...prev, short.id]));
  }, []);

  const handleReflect = useCallback((short: WisdomShort) => {
    track('wisdom_short_reflected', { short_id: short.id, author: short.source_author });
    // Persist last-reflected short so UserContext can surface it in AI chat
    AsyncStorage.setItem('wisdom_last_reflected', short.id).catch(() => {});
    UserContextService.invalidate();
    setReflectShort(short);
  }, []);

  const handleShare = useCallback((short: WisdomShort) => {
    track('wisdom_short_shared', { short_id: short.id, author: short.source_author });
    setShareShort(short);
  }, []);

  const handleMoodPress = useCallback((mood: Mood) => {
    track('mood_selected', { mood: mood.id });
    setSelectedMoodId(prev => prev === mood.id ? null : mood.id);
    setSelectedEmotion(null);
    setBecauseFilter(null);
    scrollToIndex(0, false);
  }, [scrollToIndex]);

  const selectedMood = MOODS.find(m => m.id === selectedMoodId) ?? null;

  // ── Feed header label ──────────────────────────────────────────────────────
  const feedLabel = useMemo(() => {
    if (selectedMood) return `Curated for: ${selectedMood.emoji} ${selectedMood.label}`;
    if (journalSignal) return 'Matched to your recent entries';
    return null;
  }, [selectedMood, journalSignal]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Wisdom</Text>
          <Text style={styles.headerSub}>Curated ideas for your inner life</Text>
        </View>
        <View style={styles.headerRight}>
          {/* Filter button */}
          {!showSaved && (
            <TouchableOpacity
              style={[styles.filterBtn, selectedEmotion && styles.filterBtnActive]}
              onPress={() => setShowFilterSheet(true)}
            >
              <Feather
                name="sliders"
                size={14}
                color={selectedEmotion ? '#0a1223' : 'rgba(152,212,250,0.75)'}
              />
              <Text style={[styles.filterBtnText, selectedEmotion && styles.filterBtnTextActive]}>
                {selectedEmotion ? selectedEmotion : 'Filter'}
              </Text>
              {selectedEmotion && (
                <TouchableOpacity
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  onPress={() => { setSelectedEmotion(null); scrollToIndex(0, false); }}
                >
                  <Feather name="x" size={11} color="#0a1223" style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
          {/* Saved toggle */}
          <TouchableOpacity
            style={[styles.savedToggle, showSaved && styles.savedToggleActive]}
            onPress={() => { setShowSaved(v => !v); scrollToIndex(0, false); }}
          >
            <Feather
              name="bookmark"
              size={15}
              color={showSaved ? '#0a1223' : 'rgba(152, 212, 250, 0.7)'}
            />
            <Text style={[styles.savedToggleText, showSaved && styles.savedToggleTextActive]}>
              Saved
            </Text>
          </TouchableOpacity>
        </View>
      </View>


      {/* ── Because filter banner ── */}
      {becauseFilter && (
        <View style={styles.becauseBanner}>
          <Feather name="book-open" size={12} color="rgba(152,212,250,0.65)" />
          <Text style={styles.becauseBannerText} numberOfLines={1}>
            Because you talked about{' '}
            <Text style={styles.becauseBannerTopic}>{becauseFilter.label}</Text>
          </Text>
          <TouchableOpacity
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => { setBecauseFilter(null); scrollToIndex(0, false); }}
          >
            <Feather name="x" size={13} color="rgba(152,212,250,0.55)" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Paginated feed ── */}
      {feed.length === 0 ? (
        <View style={styles.emptyState}>
          {showSaved ? (
            <>
              <Feather name="bookmark" size={32} color="rgba(152, 212, 250, 0.3)" />
              <Text style={styles.emptyTitle}>Nothing saved yet</Text>
              <Text style={styles.emptyBody}>
                Tap the bookmark icon on any short to save it here.
              </Text>
            </>
          ) : (
            <>
              <Feather name="compass" size={32} color="rgba(152, 212, 250, 0.3)" />
              <Text style={styles.emptyTitle}>No matches found</Text>
              <Text style={styles.emptyBody}>Try a different filter.</Text>
              <TouchableOpacity onPress={() => {
                setSelectedEmotion(null);
                setSelectedMoodId(null);
              }}>
                <Text style={styles.clearFilter}>Clear all filters</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ marginTop: 8 }}
                onPress={() => setShowFilterSheet(true)}
              >
                <Text style={styles.clearFilter}>Change emotion filter</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={feed}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => {
            const isForYouToday = stanceEnabled && forYouToday?.id === item.id && index === 0;
            return (
              <ScrollView
                style={{ width: SCREEN_WIDTH }}
                contentContainerStyle={styles.page}
                showsVerticalScrollIndicator={false}
                directionalLockEnabled
              >
                {isForYouToday && (
                  <View style={styles.forYouLabel}>
                    <Text style={styles.forYouLabelText}>For you today</Text>
                  </View>
                )}
                <ShortCard
                  short={item}
                  isSaved={savedIds.has(item.id)}
                  onSave={handleSave}
                  onUnsave={handleUnsave}
                  onReflect={handleReflect}
                  onShare={handleShare}
                  onRead={handleRead}
                  journalSignal={becauseFilter?.signal ?? activeSignal}
                />
              </ScrollView>
            );
          }}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          initialScrollIndex={0}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index,
          })}
          onMomentumScrollEnd={e => {
            const newIdx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            currentIndexRef.current = newIdx;
            setCurrentIndex(newIdx);
          }}
          onScrollToIndexFailed={info => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
            }, 100);
          }}
          style={styles.feedList}
        />
      )}

      {/* ── Bottom nav ── */}
      {feed.length > 0 && (
        <View style={styles.navRow}>
          {currentIndex > 0 ? (
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => scrollToIndex(currentIndex - 1)}
            >
              <Text style={styles.navBtnText}>← Newer</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.navPlaceholder} />
          )}
          <Text style={styles.swipeHint}>swipe to explore</Text>
          {currentIndex < feed.length - 1 ? (
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => scrollToIndex(currentIndex + 1)}
            >
              <Text style={styles.navBtnText}>Older →</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.navPlaceholder} />
          )}
        </View>
      )}

      {/* ── Reflect modal ── */}
      <ReflectPromptModal
        short={reflectShort}
        visible={reflectShort !== null}
        onClose={() => setReflectShort(null)}
        onSave={async (shortId, text) => {
          if (!text.trim()) return;
          const entry: TranscriptEntry = {
            id: `reflect_${shortId}_${Date.now()}`,
            text: text.trim(),
            timestamp: Date.now(),
            duration: 0,
            kind: 'manual',
          };
          await StorageService.addTranscript(entry).catch(() => {});
        }}
      />

      {/* ── Share modal ── */}
      <ShareModal
        short={shareShort}
        visible={shareShort !== null}
        onClose={() => setShareShort(null)}
      />

      {/* ── Filter sheet ── */}
      <FilterSheet
        visible={showFilterSheet}
        selectedEmotion={selectedEmotion}
        onSelect={(emotion) => {
          setSelectedEmotion(emotion);
          setSelectedMoodId(null);
          setBecauseFilter(null);
        }}
        onClear={() => setSelectedEmotion(null)}
        onClose={() => setShowFilterSheet(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#02060E',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.25)',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: 'rgba(152,212,250,0.04)',
  },
  filterBtnActive: {
    backgroundColor: 'rgba(152,212,250,0.88)',
    borderColor: 'rgba(152,212,250,0.88)',
  },
  filterBtnText: {
    fontSize: 12,
    color: 'rgba(152,212,250,0.75)',
    fontWeight: '500',
    fontFamily: 'GillSans-Light',
    maxWidth: 90,
  },
  filterBtnTextActive: {
    color: '#0a1223',
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'Baskerville',
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(152, 212, 250, 0.45)',
    marginTop: 2,
  },

  savedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.25)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  savedToggleActive: {
    backgroundColor: 'rgba(152, 212, 250, 0.88)',
    borderColor: 'rgba(152, 212, 250, 0.88)',
  },
  savedToggleText: {
    fontSize: 13,
    color: 'rgba(152, 212, 250, 0.7)',
    fontWeight: '500',
  },
  savedToggleTextActive: {
    color: '#0a1223',
    fontWeight: '700',
  },

  // ── Mood picker ──
  moodSection: {
    paddingTop: 6,
    paddingBottom: 4,
  },
  moodLabel: {
    fontSize: 11,
    color: 'rgba(152, 212, 250, 0.4)',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  moodRow: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 2,
  },
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: 'rgba(152, 212, 250, 0.04)',
  },
  moodChipActive: {
    backgroundColor: 'rgba(152, 212, 250, 0.15)',
    borderColor: 'rgba(152, 212, 250, 0.5)',
  },
  moodEmoji: {
    fontSize: 14,
  },
  moodChipText: {
    fontSize: 13,
    color: 'rgba(152, 212, 250, 0.55)',
    fontWeight: '500',
  },
  moodChipTextActive: {
    color: 'rgba(224, 242, 254, 0.92)',
    fontWeight: '600',
  },

  feedList: {
    flex: 1,
  },
  page: {
    paddingTop: 8,
    paddingBottom: 24,
  },

  // ── For you today label ──
  forYouLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 6,
    marginTop: 2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.28)',
    backgroundColor: 'rgba(152,212,250,0.07)',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  forYouLabelText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'rgba(152,212,250,0.70)',
    fontFamily: 'GillSans-Light',
  },

  // ── Bottom nav ──
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  navBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: 'rgba(9, 41, 173, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.20)',
  },
  navBtnText: {
    color: 'rgba(152, 212, 250, 0.85)',
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'GillSans-Light',
  },
  navPlaceholder: { width: 80 },
  swipeHint: {
    fontSize: 12,
    color: 'rgba(152, 212, 250, 0.60)',
    fontFamily: 'GillSans-Light',
  },

  becauseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(152,212,250,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.18)',
  },
  becauseBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.55)',
    fontStyle: 'italic',
  },
  becauseBannerTopic: {
    color: 'rgba(152,212,250,0.85)',
    fontStyle: 'italic',
  },

  matchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(251, 191, 36, 0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.18)',
  },
  matchBannerText: {
    fontSize: 12,
    color: 'rgba(251, 191, 36, 0.7)',
    fontWeight: '500',
    flex: 1,
  },
  clearBannerBtn: {
    padding: 2,
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(224, 242, 254, 0.65)',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    color: 'rgba(152, 212, 250, 0.45)',
    textAlign: 'center',
    lineHeight: 20,
  },
  clearFilter: {
    fontSize: 14,
    color: 'rgba(152, 212, 250, 0.7)',
    textDecorationLine: 'underline',
    marginTop: 4,
  },

});
