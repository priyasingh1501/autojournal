/**
 * WisdomScreen — vertical scroll feed of curated Wisdom Shorts.
 *
 * Features:
 *   • Full library feed, ordered by signal match (if available) or variety
 *   • Emotion-state filter chips to browse by feeling
 *   • Saved toggle to view bookmarked shorts
 *   • Reflect action opens ReflectPromptModal
 *   • Save / unsave persisted via StorageService
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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { WisdomShort, JournalSignal } from '../types';
import { SHORTS_LIBRARY, ALL_EMOTIONAL_STATES } from '../data/shortsLibrary';
import { StorageService } from '../services/StorageService';
import { buildFeed, flattenFeed } from '../services/WisdomService';
import ShortCard from '../components/ShortCard';
import ReflectPromptModal from '../components/ReflectPromptModal';

// Curated filter emotions for the chip strip (subset of all states)
const FILTER_EMOTIONS = [
  'anxious', 'overwhelmed', 'unfulfilled', 'lonely', 'stuck',
  'angry', 'restless', 'hopeless', 'comparing', 'striving',
];

export default function WisdomScreen() {
  const [savedIds, setSavedIds]             = useState<Set<string>>(new Set());
  const [seenIds, setSeenIds]               = useState<Set<string>>(new Set());
  const [signal, setSignal]                 = useState<JournalSignal | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [showSaved, setShowSaved]           = useState(false);
  const [reflectShort, setReflectShort]     = useState<WisdomShort | null>(null);

  // ── Load stored state on focus ─────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [saved, seen, sig] = await Promise.all([
          StorageService.getSavedShorts(),
          StorageService.getSeenShortIds(),
          StorageService.getJournalSignal(),
        ]);
        if (!active) return;
        setSavedIds(new Set(saved.map(s => s.shortId)));
        setSeenIds(new Set(seen));
        setSignal(sig);
      })();
      return () => { active = false; };
    }, []),
  );

  // ── Build feed ─────────────────────────────────────────────────────────────
  const feed = useMemo<WisdomShort[]>(() => {
    if (showSaved) {
      return SHORTS_LIBRARY.filter(s => savedIds.has(s.id));
    }
    const feedSelection = buildFeed(signal, savedIds, seenIds, selectedEmotion ?? undefined);
    return flattenFeed(feedSelection);
  }, [signal, savedIds, seenIds, selectedEmotion, showSaved]);

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
    // Mark as seen when the user engages via Reflect
    StorageService.markShortSeen(short.id).catch(() => {});
    setSeenIds(prev => new Set([...prev, short.id]));
  }, []);

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

      {/* ── Emotion filter chips ── */}
      {!showSaved && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
          {FILTER_EMOTIONS.map(emotion => {
            const active = selectedEmotion === emotion;
            return (
              <TouchableOpacity
                key={emotion}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedEmotion(active ? null : emotion)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {emotion}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

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
              <Text style={styles.emptyBody}>
                Try a different emotion or clear the filter.
              </Text>
              <TouchableOpacity onPress={() => setSelectedEmotion(null)}>
                <Text style={styles.clearFilter}>Clear filter</Text>
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
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            signal && !showSaved ? (
              <View style={styles.matchBanner}>
                <Feather name="zap" size={12} color="rgba(251, 191, 36, 0.7)" />
                <Text style={styles.matchBannerText}>Matched to your recent entries</Text>
              </View>
            ) : null
          }
        />
      )}

      {/* ── Reflect modal ── */}
      <ReflectPromptModal
        short={reflectShort}
        visible={reflectShort !== null}
        onClose={() => setReflectShort(null)}
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
    paddingBottom: 10,
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

  chipScroll: {
    maxHeight: 46,
  },
  chipRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    backgroundColor: 'rgba(152, 212, 250, 0.05)',
  },
  chipActive: {
    backgroundColor: 'rgba(152, 212, 250, 0.18)',
    borderColor: 'rgba(152, 212, 250, 0.55)',
  },
  chipText: {
    fontSize: 13,
    color: 'rgba(152, 212, 250, 0.55)',
    fontWeight: '500',
  },
  chipTextActive: {
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
