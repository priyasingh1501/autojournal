import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Animated,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { StorageService } from '../services/StorageService';
import { TranscriptEntry, PendingClip } from '../types';
import ComposeModal from '../components/ComposeModal';

// ── Highlights every occurrence of `query` inside `text` ─────────────────────
function HighlightText({ text, query, style }: { text: string; query: string; style: any }) {
  if (!query.trim()) return <Text style={style}>{text}</Text>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <Text key={i} style={highlightStyle}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

const highlightStyle = {
  backgroundColor: 'rgba(152, 212, 250, 0.25)',
  color: 'rgba(224, 242, 254, 0.95)',
  borderRadius: 3,
};

type JournalItem =
  | { kind: 'transcript'; data: TranscriptEntry; date: string }
  | { kind: 'manual'; data: TranscriptEntry; date: string }
  | { kind: 'clip'; data: PendingClip; date: string };

type DaySection = { date: string; title: string; data: JournalItem[] };

// Entry being moved between days
type MovingEntry = { entry: TranscriptEntry; fromDate: string };

export default function TranscriptsScreen() {
  const [sections, setSections]         = useState<DaySection[]>([]);
  const [search, setSearch]             = useState('');
  const [selectMode, setSelectMode]     = useState(false);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [loading, setLoading]           = useState(false);
  const [editingEntry, setEditingEntry] = useState<(TranscriptEntry & { date: string }) | null>(null);

  // ── Drag-to-move state ─────────────────────────────────────────────────────
  const [movingEntry, setMovingEntry]   = useState<MovingEntry | null>(null);
  const liftAnim = useRef(new Animated.Value(0)).current; // 0 = resting, 1 = lifted

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

  const loadAll = async () => {
    const [transcriptDates, clips] = await Promise.all([
      StorageService.getTranscriptDates(),
      StorageService.getPendingClips(),
    ]);

    const transcriptsByDate = await Promise.all(
      transcriptDates.map(async (date) => ({
        date,
        entries: await StorageService.getTranscriptsForDate(date),
      }))
    );

    const clipsByDate: Record<string, PendingClip[]> = {};
    for (const clip of clips) {
      const date = new Date(clip.timestamp).toISOString().split('T')[0];
      if (!clipsByDate[date]) clipsByDate[date] = [];
      clipsByDate[date].push(clip);
    }

    const allDates = new Set([...transcriptDates, ...Object.keys(clipsByDate)]);

    const built: DaySection[] = Array.from(allDates)
      .sort()
      .reverse()
      .map((date) => {
        const txItems: JournalItem[] = (
          transcriptsByDate.find((t) => t.date === date)?.entries ?? []
        ).map((data) => ({
          kind: (data.kind === 'manual' ? 'manual' : 'transcript') as 'transcript' | 'manual',
          data,
          date,
        }));

        const clipItems: JournalItem[] = (clipsByDate[date] ?? []).map(
          (data) => ({ kind: 'clip' as const, data, date })
        );

        const merged = [...txItems, ...clipItems].sort(
          (a, b) => b.data.timestamp - a.data.timestamp
        );

        return { date, title: formatDateHeading(date), data: merged };
      })
      .filter((s) => s.data.length > 0);

    setSections(built);
  };

  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase();
    return sections
      .map((s) => ({
        ...s,
        data: s.data.filter((item) => {
          if (item.kind === 'transcript' || item.kind === 'manual') {
            return item.data.text.toLowerCase().includes(q);
          }
          return formatTime(item.data.timestamp).includes(q);
        }),
      }))
      .filter((s) => s.data.length > 0);
  }, [sections, search]);

  // ── Lift animation ─────────────────────────────────────────────────────────
  const animateLift = (up: boolean) => {
    Animated.spring(liftAnim, {
      toValue: up ? 1 : 0,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
  };

  const startMove = (entry: TranscriptEntry, fromDate: string) => {
    setMovingEntry({ entry, fromDate });
    animateLift(true);
  };

  const cancelMove = () => {
    animateLift(false);
    setTimeout(() => setMovingEntry(null), 200);
  };

  // ── Drop onto a target date section ───────────────────────────────────────
  const dropOnto = async (toDate: string) => {
    if (!movingEntry) return;
    const { entry, fromDate } = movingEntry;

    if (toDate === fromDate) {
      cancelMove();
      return;
    }

    // Animate down first, then do the move
    animateLift(false);
    setMovingEntry(null);
    setLoading(true);

    try {
      // 1. Remove from old date
      await StorageService.deleteTranscript(entry.id, fromDate);

      // 2. Re-add with noon timestamp on new date (preserves all other fields)
      const newTimestamp = new Date(toDate + 'T12:00:00').getTime();
      const movedEntry: TranscriptEntry = { ...entry, timestamp: newTimestamp };
      await StorageService.addTranscript(movedEntry);

      await loadAll();
    } catch {
      Alert.alert('Error', 'Could not move the note. Please try again.');
      await loadAll();
    } finally {
      setLoading(false);
    }
  };

  // ── Select mode ────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const enterSelectMode = () => { setSelectMode(true); setSelected(new Set()); };
  const exitSelectMode  = () => { setSelectMode(false); setSelected(new Set()); };
  const selectAll = () => {
    setSelected(new Set(filteredSections.flatMap((s) => s.data).map((i) => i.data.id)));
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteItems = async (items: JournalItem[]) => {
    setLoading(true);
    try {
      const byDate = new Map<string, string[]>();
      const clipIds: string[] = [];
      const photoUris: string[] = [];
      const audioUris: string[] = [];

      for (const item of items) {
        if (item.kind === 'transcript' || item.kind === 'manual') {
          const group = byDate.get(item.date) ?? [];
          group.push(item.data.id);
          byDate.set(item.date, group);
          const photoUri = (item.data as TranscriptEntry).photoUri;
          if (photoUri) photoUris.push(photoUri);
        } else {
          clipIds.push(item.data.id);
          audioUris.push((item.data as PendingClip).uri);
        }
      }

      await Promise.all([
        ...Array.from(byDate.entries()).map(([date, ids]) =>
          StorageService.deleteTranscripts(ids, date)
        ),
        clipIds.length > 0 ? StorageService.removeManyPendingClips(clipIds) : Promise.resolve(),
      ]);

      await Promise.all([
        ...photoUris.map(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})),
        ...audioUris.map(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})),
      ]);

      await loadAll();
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSelected = () => {
    if (selected.size === 0) return;
    const allItems = filteredSections.flatMap((s) => s.data);
    const toDelete = allItems.filter((item) => selected.has(item.data.id));
    Alert.alert(
      'Delete Items',
      `Delete ${selected.size} selected item${selected.size !== 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { exitSelectMode(); await deleteItems(toDelete); } },
      ]
    );
  };

  const handleDeleteSingle = (item: JournalItem) => {
    Alert.alert(
      item.kind === 'transcript' ? 'Delete Transcript' : 'Delete Clip',
      'Remove this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteItems([item]) },
      ]
    );
  };

  const handleDeleteDay = (section: DaySection) => {
    Alert.alert(
      `Delete ${section.title}`,
      `Delete all ${section.data.length} items from this day?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete All', style: 'destructive', onPress: () => deleteItems(section.data) },
      ]
    );
  };

  // ── Formatting ─────────────────────────────────────────────────────────────
  const formatDateHeading = (date: string): string => {
    const today     = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (date === today)     return 'Today';
    if (date === yesterday) return 'Yesterday';
    return new Date(date + 'T12:00:00').toLocaleDateString([], {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const ICON_NAME: Record<JournalItem['kind'], string> = {
    transcript: 'mic', manual: 'edit-3', clip: 'music',
  };

  // ── Section header ─────────────────────────────────────────────────────────
  const renderSectionHeader = ({ section }: { section: DaySection }) => {
    const voiceCount  = section.data.filter((i) => i.kind === 'transcript').length;
    const manualCount = section.data.filter((i) => i.kind === 'manual').length;
    const clipCount   = section.data.filter((i) => i.kind === 'clip').length;
    const parts: string[] = [];
    if (voiceCount  > 0) parts.push(`${voiceCount} voice`);
    if (manualCount > 0) parts.push(`${manualCount} manual`);
    if (clipCount   > 0) parts.push(`${clipCount} clip${clipCount !== 1 ? 's' : ''}`);

    const isDroppingHere = !!movingEntry && movingEntry.fromDate !== section.date;
    const isSource       = !!movingEntry && movingEntry.fromDate === section.date;

    return (
      <TouchableOpacity
        activeOpacity={isDroppingHere ? 0.6 : 1}
        onPress={() => isDroppingHere ? dropOnto(section.date) : undefined}
        style={[
          styles.sectionHeader,
          isDroppingHere && styles.sectionHeaderDropTarget,
          isSource       && styles.sectionHeaderSource,
        ]}
      >
        <View style={styles.sectionHeaderLeft}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {isDroppingHere ? (
            <Text style={styles.dropHereLabel}>
              <Feather name="corner-down-right" size={11} color="rgba(152, 212, 250, 0.8)" /> Drop here
            </Text>
          ) : isSource ? (
            <Text style={styles.sourceLabel}>Moving from here…</Text>
          ) : (
            <Text style={styles.sectionCount}>{parts.join(' · ')}</Text>
          )}
        </View>
        {!selectMode && !movingEntry && (
          <TouchableOpacity
            onPress={() => handleDeleteDay(section)}
            style={styles.deleteDayBtn}
          >
            <Text style={styles.deleteDayBtnText}>Delete day</Text>
          </TouchableOpacity>
        )}
        {movingEntry && (
          <TouchableOpacity onPress={cancelMove} style={styles.cancelMoveBtn}>
            <Feather name="x" size={13} color="rgba(152, 212, 250, 0.55)" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // ── Card ───────────────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: JournalItem }) => {
    const id         = item.data.id;
    const isSelected = selected.has(id);
    const isClip     = item.kind === 'clip';
    const isManual   = item.kind === 'manual';
    const entry      = item.kind !== 'clip' ? (item.data as TranscriptEntry) : null;
    const isMoving   = movingEntry?.entry.id === id;

    const cardStyle = [
      styles.card,
      isSelected && styles.cardSelected,
      isMoving   && styles.cardMoving,
    ];

    return (
      <Animated.View
        style={[
          { transform: isMoving ? [{ scale: liftAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }] : [] },
        ]}
      >
        <TouchableOpacity
          style={cardStyle}
          onPress={() => {
            if (movingEntry) return; // ignore taps on cards while moving
            if (selectMode) toggleSelect(id);
          }}
          onLongPress={() => {
            if (selectMode || isClip || movingEntry) return;
            startMove(item.data as TranscriptEntry, item.date);
          }}
          delayLongPress={350}
          activeOpacity={movingEntry ? 1 : (selectMode ? 0.6 : 0.92)}
        >
          {selectMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Feather name="check" size={11} color="rgba(224, 242, 254, 0.95)" />}
            </View>
          )}

          {/* Drag handle indicator — shown when this card is lifted */}
          {isMoving && (
            <View style={styles.dragHandle}>
              <Feather name="move" size={13} color="rgba(152, 212, 250, 0.8)" />
            </View>
          )}

          <View style={styles.cardBody}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Feather name={ICON_NAME[item.kind] as any} size={11} color="rgba(152, 212, 250, 0.65)" />
                <Text style={styles.cardTime}>{formatTime(item.data.timestamp)}</Text>
                {!isManual && (
                  <Text style={styles.cardDuration}> · {item.data.duration.toFixed(1)}s</Text>
                )}
              </View>
              {!selectMode && !movingEntry && (
                <View style={styles.cardActions}>
                  {!isClip && (
                    <TouchableOpacity
                      onPress={() => setEditingEntry({ ...(item.data as TranscriptEntry), date: item.date })}
                      style={styles.editBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="edit-2" size={10} color="rgba(152, 212, 250, 0.85)" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => handleDeleteSingle(item)}
                    style={styles.deleteBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={9} color="#e63946" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {isClip && <Text style={styles.clipLabel}>Pending · not yet transcribed</Text>}

            {entry && entry.text.length > 0 && (
              <HighlightText text={entry.text} query={search} style={styles.cardText} />
            )}

            {entry?.photoUri && (
              <Image source={{ uri: entry.photoUri }} style={styles.photoThumb} resizeMode="cover" />
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const totalItems = sections.reduce((n, s) => n + s.data.length, 0);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.searchBox}>
          <Feather name="search" size={13} color="rgba(152, 212, 250, 0.55)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transcripts…"
            placeholderTextColor="rgba(152, 212, 250, 0.40)"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Feather name="x" size={13} color="rgba(152, 212, 250, 0.55)" />
            </TouchableOpacity>
          )}
        </View>
        {movingEntry ? (
          <TouchableOpacity onPress={cancelMove}>
            <Text style={styles.actionBtn}>Cancel</Text>
          </TouchableOpacity>
        ) : selectMode ? (
          <TouchableOpacity onPress={exitSelectMode}>
            <Text style={styles.actionBtn}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={enterSelectMode} disabled={totalItems === 0}>
            <Text style={[styles.actionBtn, totalItems === 0 && styles.disabled]}>Select</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Moving mode banner */}
      {movingEntry && (
        <View style={styles.movingBanner}>
          <Feather name="move" size={13} color="rgba(152, 212, 250, 0.85)" />
          <Text style={styles.movingBannerText} numberOfLines={1}>
            Moving note — tap a day header to drop it there
          </Text>
          <TouchableOpacity onPress={cancelMove}>
            <Feather name="x" size={15} color="rgba(152, 212, 250, 0.55)" />
          </TouchableOpacity>
        </View>
      )}

      {/* Select-mode toolbar */}
      {selectMode && (
        <View style={styles.selectBar}>
          <TouchableOpacity onPress={selectAll}>
            <Text style={styles.selectBarBtn}>All</Text>
          </TouchableOpacity>
          <Text style={styles.selectCount}>
            {selected.size === 0 ? 'Tap to select' : `${selected.size} selected`}
          </Text>
          {loading ? (
            <ActivityIndicator color="#e63946" size="small" />
          ) : (
            <TouchableOpacity onPress={handleDeleteSelected} disabled={selected.size === 0}>
              <Text style={[styles.deleteAllBtn, selected.size === 0 && styles.disabled]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <SectionList
        sections={filteredSections}
        keyExtractor={(item) => item.data.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {search ? 'No results found' : 'No recordings yet'}
          </Text>
        }
      />

      {/* Edit existing entry */}
      <ComposeModal
        visible={editingEntry !== null}
        editEntry={editingEntry ?? undefined}
        onClose={() => setEditingEntry(null)}
        onSaved={() => { setEditingEntry(null); loadAll(); }}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 10,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(3, 18, 40, 0.72)',
    borderRadius: 12, paddingHorizontal: 10, height: 40, gap: 6,
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.13)',
  },
  searchInput: { flex: 1, color: 'rgba(224, 242, 254, 0.95)', fontSize: 14, fontFamily: 'GillSans-Light' },
  actionBtn: { color: 'rgba(152, 212, 250, 0.85)', fontSize: 15, fontWeight: '500', fontFamily: 'GillSans-Light' },
  disabled: { opacity: 0.35 },

  // ── Moving banner ─────────────────────────────────────────────────────────
  movingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: 'rgba(9, 41, 173, 0.18)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(152, 212, 250, 0.15)',
  },
  movingBannerText: {
    flex: 1, color: 'rgba(152, 212, 250, 0.85)', fontSize: 13,
    fontFamily: 'GillSans-Light',
  },

  // ── Select bar ────────────────────────────────────────────────────────────
  selectBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: 'rgba(6, 26, 55, 0.55)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(152, 212, 250, 0.10)',
  },
  selectBarBtn: { color: 'rgba(152, 212, 250, 0.65)', fontSize: 14, fontWeight: '500', minWidth: 40, fontFamily: 'GillSans-Light' },
  selectCount:  { color: 'rgba(224, 242, 254, 0.95)', fontSize: 14, fontWeight: '500', fontFamily: 'GillSans-Light' },
  deleteAllBtn: { color: '#e63946', fontSize: 14, fontWeight: '500', minWidth: 40, textAlign: 'right', fontFamily: 'GillSans-Light' },

  // ── Section headers ───────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(1, 12, 26, 0.95)',
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(9, 41, 173, 0.08)',
  },
  sectionHeaderDropTarget: {
    backgroundColor: 'rgba(9, 41, 173, 0.55)',
    borderBottomColor: 'rgba(152, 212, 250, 0.70)',
    borderBottomWidth: 2,
    borderTopWidth: 2,
    borderTopColor: 'rgba(152, 212, 250, 0.70)',
  },
  sectionHeaderSource: {
    backgroundColor: 'rgba(3, 18, 40, 0.98)',
    borderBottomColor: 'rgba(152, 212, 250, 0.10)',
  },
  sectionHeaderLeft: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 16, fontWeight: '500', color: 'rgba(224, 242, 254, 0.95)', fontFamily: 'Baskerville' },
  sectionCount: { fontSize: 12, color: 'rgba(152, 212, 250, 0.60)', marginTop: 2, fontFamily: 'GillSans-Light' },
  dropHereLabel: { fontSize: 12, color: 'rgba(224, 242, 254, 0.95)', marginTop: 2, fontFamily: 'GillSans-Light', fontWeight: '700', letterSpacing: 0.3 },
  sourceLabel:   { fontSize: 12, color: 'rgba(152, 212, 250, 0.45)', marginTop: 2, fontFamily: 'GillSans-Light', fontStyle: 'italic' },
  deleteDayBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: 'rgba(230, 57, 70, 0.18)',
    borderWidth: 1, borderColor: 'rgba(230, 57, 70, 0.35)',
  },
  deleteDayBtnText: { color: '#e63946', fontSize: 12, fontWeight: '500', fontFamily: 'GillSans-Light' },
  cancelMoveBtn: { padding: 6 },

  // ── Cards ─────────────────────────────────────────────────────────────────
  listContent: { paddingBottom: 32 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginHorizontal: 16, marginTop: 8,
    borderRadius: 16, padding: 12,
    backgroundColor: 'transparent',
  },
  cardSelected: {
    backgroundColor: 'rgba(9, 41, 173, 0.08)',
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.30)',
  },
  cardMoving: {
    backgroundColor: 'rgba(9, 41, 173, 0.15)',
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.45)',
    borderRadius: 16,
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  dragHandle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(152, 212, 250, 0.12)',
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10, marginTop: 1, flexShrink: 0,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: 'rgba(152, 212, 250, 0.35)',
    marginRight: 10, marginTop: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxSelected: { backgroundColor: 'rgba(152, 212, 250, 0.18)', borderColor: '#98D4FA' },
  cardBody: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardTime:     { fontSize: 12, color: 'rgba(152, 212, 250, 0.65)', marginLeft: 5, fontFamily: 'GillSans-Light' },
  cardDuration: { fontSize: 11, color: 'rgba(152, 212, 250, 0.60)', fontFamily: 'GillSans-Light' },
  cardActions:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editBtn: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(9, 41, 173, 0.08)',
    borderWidth: 1, borderColor: 'rgba(152, 212, 250, 0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtn: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(230, 57, 70, 0.12)',
    borderWidth: 1, borderColor: 'rgba(230, 57, 70, 0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  clipLabel: { fontSize: 13, color: '#f4a261', fontStyle: 'italic', fontFamily: 'GillSans-Light' },
  cardText: { fontSize: 14, color: 'rgba(152, 212, 250, 0.65)', lineHeight: 20, fontFamily: 'GillSans-Light' },
  photoThumb: { width: '100%', height: 160, borderRadius: 8, marginTop: 8 },
  emptyText: {
    color: 'rgba(152, 212, 250, 0.60)', textAlign: 'center',
    marginTop: 80, fontSize: 15, lineHeight: 24, fontFamily: 'GillSans-Light',
  },
});
