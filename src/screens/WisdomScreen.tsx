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

import React, { useCallback, useMemo, useState } from 'react';
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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { WisdomShort, JournalSignal } from '../types';
import { SHORTS_LIBRARY } from '../data/shortsLibrary';
import { StorageService } from '../services/StorageService';
import { buildFeed, flattenFeed, MOODS, Mood } from '../services/WisdomService';
import ShortCard from '../components/ShortCard';
import ReflectPromptModal from '../components/ReflectPromptModal';
import AddShortModal from '../components/AddShortModal';
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

        <View style={{ height: Platform.OS === 'ios' ? 28 : 16 }} />
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
  const [savedIds, setSavedIds]               = useState<Set<string>>(new Set());
  const [seenIds, setSeenIds]                 = useState<Set<string>>(new Set());
  const [journalSignal, setJournalSignal]     = useState<JournalSignal | null>(null);
  const [selectedMoodId, setSelectedMoodId]   = useState<string | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [showSaved, setShowSaved]             = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [reflectShort, setReflectShort]       = useState<WisdomShort | null>(null);
  const [shareShort, setShareShort]           = useState<WisdomShort | null>(null);
  const [customShorts, setCustomShorts]       = useState<WisdomShort[]>([]);
  const [isPublisher, setIsPublisher]         = useState(false);
  const [showAddShort, setShowAddShort]       = useState(false);
  const [editShort, setEditShort]             = useState<WisdomShort | null>(null);

  // ── Load stored state on focus ─────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [saved, seen, sig, customs, publisher] = await Promise.all([
          StorageService.getSavedShorts(),
          StorageService.getSeenShortIds(),
          StorageService.getJournalSignal(),
          StorageService.getCustomShorts(),
          StorageService.isPublisherMode(),
        ]);
        if (!active) return;
        setSavedIds(new Set(saved.map(s => s.shortId)));
        setSeenIds(new Set(seen));
        setJournalSignal(sig);
        setCustomShorts(customs);
        setIsPublisher(publisher);
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

  // ── Merged library (curated + custom) ─────────────────────────────────────
  const fullLibrary = useMemo<WisdomShort[]>(
    () => [...SHORTS_LIBRARY, ...customShorts],
    [customShorts],
  );

  // ── Build feed ─────────────────────────────────────────────────────────────
  const feed = useMemo<WisdomShort[]>(() => {
    if (showSaved) {
      return fullLibrary.filter(s => savedIds.has(s.id));
    }
    const feedSelection = buildFeed(activeSignal, savedIds, seenIds, selectedEmotion ?? undefined, fullLibrary);
    return flattenFeed(feedSelection);
  }, [activeSignal, savedIds, seenIds, selectedEmotion, showSaved, fullLibrary]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (id: string) => {
    await StorageService.saveShort(id);
    setSavedIds(prev => new Set([...prev, id]));
  }, []);

  const handleUnsave = useCallback(async (id: string) => {
    await StorageService.unsaveShort(id);
    setSavedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleReflect = useCallback((short: WisdomShort) => {
    setReflectShort(short);
    StorageService.markShortSeen(short.id).catch(() => {});
    setSeenIds(prev => new Set([...prev, short.id]));
  }, []);

  const handleShare = useCallback((short: WisdomShort) => {
    setShareShort(short);
  }, []);

  const handleShortSaved = useCallback((short: WisdomShort) => {
    setCustomShorts(prev => {
      const idx = prev.findIndex(s => s.id === short.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = short;
        return next;
      }
      return [...prev, short];
    });
    setShowAddShort(false);
    setEditShort(null);
  }, []);

  const handleMoodPress = useCallback((mood: Mood) => {
    setSelectedMoodId(prev => prev === mood.id ? null : mood.id);
    setSelectedEmotion(null); // clear emotion filter when mood changes
  }, []);

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
                  onPress={() => setSelectedEmotion(null)}
                >
                  <Feather name="x" size={11} color="#0a1223" style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
          {/* Saved toggle */}
          <TouchableOpacity
            style={[styles.savedToggle, showSaved && styles.savedToggleActive]}
            onPress={() => setShowSaved(v => !v)}
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

      {/* ── Feed ── */}
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
          data={feed}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ShortCard
              short={item}
              isSaved={savedIds.has(item.id)}
              onSave={handleSave}
              onUnsave={handleUnsave}
              onReflect={handleReflect}
              onShare={handleShare}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* ── Mood picker scrolls with the feed ── */}
              {!showSaved && (
                <View style={styles.moodSection}>
                  <Text style={styles.moodLabel}>How are you feeling?</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.moodRow}
                  >
                    {MOODS.map(mood => {
                      const active = selectedMoodId === mood.id;
                      return (
                        <TouchableOpacity
                          key={mood.id}
                          style={[styles.moodChip, active && styles.moodChipActive]}
                          onPress={() => handleMoodPress(mood)}
                        >
                          <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                          <Text style={[styles.moodChipText, active && styles.moodChipTextActive]}>
                            {mood.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* ── Match banner ── */}
              {feedLabel && !showSaved && (
                <View style={styles.matchBanner}>
                  <Feather
                    name={selectedMood ? 'heart' : 'zap'}
                    size={12}
                    color="rgba(251, 191, 36, 0.7)"
                  />
                  <Text style={styles.matchBannerText}>{feedLabel}</Text>
                  {(selectedMood || selectedEmotion) && (
                    <TouchableOpacity
                      onPress={() => { setSelectedMoodId(null); setSelectedEmotion(null); }}
                      style={styles.clearBannerBtn}
                    >
                      <Feather name="x" size={11} color="rgba(251, 191, 36, 0.6)" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          }
        />
      )}

      {/* ── Publisher FAB ── */}
      {isPublisher && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => { setEditShort(null); setShowAddShort(true); }}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={22} color="rgba(224, 242, 254, 0.95)" />
        </TouchableOpacity>
      )}

      {/* ── Reflect modal ── */}
      <ReflectPromptModal
        short={reflectShort}
        visible={reflectShort !== null}
        onClose={() => setReflectShort(null)}
      />

      {/* ── Share modal ── */}
      <ShareModal
        short={shareShort}
        visible={shareShort !== null}
        onClose={() => setShareShort(null)}
      />

      {/* ── Add / Edit short (publisher) ── */}
      <AddShortModal
        visible={showAddShort}
        editShort={editShort}
        onClose={() => { setShowAddShort(false); setEditShort(null); }}
        onSaved={handleShortSaved}
      />

      {/* ── Filter sheet ── */}
      <FilterSheet
        visible={showFilterSheet}
        selectedEmotion={selectedEmotion}
        onSelect={(emotion) => {
          setSelectedEmotion(emotion);
          setSelectedMoodId(null); // clear mood when filtering by emotion
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

  list: {
    paddingTop: 8,
    paddingBottom: 32,
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

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(9, 41, 173, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.40)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
});
