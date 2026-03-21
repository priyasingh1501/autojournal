import React, { useState, useCallback, useMemo } from 'react';
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
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { StorageService } from '../services/StorageService';
import { TranscriptEntry, PendingClip } from '../types';
import ComposeModal from '../components/ComposeModal';

// 'transcript' = voice (auto-recorded), 'manual' = typed/photo, 'clip' = pending audio
type JournalItem =
  | { kind: 'transcript'; data: TranscriptEntry; date: string }
  | { kind: 'manual'; data: TranscriptEntry; date: string }
  | { kind: 'clip'; data: PendingClip; date: string };

type DaySection = {
  date: string;
  title: string;
  data: JournalItem[];
};

export default function TranscriptsScreen() {
  const [sections, setSections] = useState<DaySection[]>([]);
  const [search, setSearch] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [editingEntry, setEditingEntry] = useState<(TranscriptEntry & { date: string }) | null>(null);

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

    // Group pending clips by date
    const clipsByDate: Record<string, PendingClip[]> = {};
    for (const clip of clips) {
      const date = new Date(clip.timestamp).toISOString().split('T')[0];
      if (!clipsByDate[date]) clipsByDate[date] = [];
      clipsByDate[date].push(clip);
    }

    const allDates = new Set([
      ...transcriptDates,
      ...Object.keys(clipsByDate),
    ]);

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

        // Sort by timestamp descending within the day (latest first)
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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelected(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const selectAll = () => {
    const allIds = filteredSections.flatMap((s) => s.data).map((i) => i.data.id);
    setSelected(new Set(allIds));
  };

  const deleteItems = async (items: JournalItem[]) => {
    setLoading(true);
    try {
      // Group transcript/manual IDs by date so each date key gets ONE atomic read-filter-write
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

      // One storage write per date key + one write for clips — no races
      await Promise.all([
        ...Array.from(byDate.entries()).map(([date, ids]) =>
          StorageService.deleteTranscripts(ids, date)
        ),
        clipIds.length > 0
          ? StorageService.removeManyPendingClips(clipIds)
          : Promise.resolve(),
      ]);

      // Clean up files after storage is updated
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
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            exitSelectMode();
            await deleteItems(toDelete);
          },
        },
      ]
    );
  };

  const handleDeleteSingle = (item: JournalItem) => {
    Alert.alert(
      item.kind === 'transcript' ? 'Delete Transcript' : 'Delete Clip',
      'Remove this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteItems([item]),
        },
      ]
    );
  };

  const handleDeleteDay = (section: DaySection) => {
    Alert.alert(
      `Delete ${section.title}`,
      `Delete all ${section.data.length} items from this day?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => deleteItems(section.data),
        },
      ]
    );
  };

  const formatDateHeading = (date: string): string => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (date === today) return 'Today';
    if (date === yesterday) return 'Yesterday';
    return new Date(date + 'T12:00:00').toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const ICON_NAME: Record<JournalItem['kind'], string> = {
    transcript: 'mic',
    manual: 'edit-3',
    clip: 'music',
  };

  const renderItem = ({ item }: { item: JournalItem }) => {
    const id = item.data.id;
    const isSelected = selected.has(id);
    const isClip = item.kind === 'clip';
    const isManual = item.kind === 'manual';
    const entry = item.kind !== 'clip' ? (item.data as TranscriptEntry) : null;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          isSelected && styles.cardSelected,
        ]}
        onPress={() => (selectMode ? toggleSelect(id) : undefined)}
        onLongPress={() => {
          if (!selectMode) {
            enterSelectMode();
            toggleSelect(id);
          }
        }}
        activeOpacity={selectMode ? 0.6 : 1}
      >
        {selectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Feather name="check" size={11} color="rgba(224, 242, 254, 0.95)" />}
          </View>
        )}
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Feather name={ICON_NAME[item.kind] as any} size={11} color="rgba(147, 210, 232, 0.65)" />
              <Text style={styles.cardTime}>{formatTime(item.data.timestamp)}</Text>
              {!isManual && (
                <Text style={styles.cardDuration}> · {item.data.duration.toFixed(1)}s</Text>
              )}
            </View>
            {!selectMode && (
              <View style={styles.cardActions}>
                {!isClip && (
                  <TouchableOpacity
                    onPress={() =>
                      setEditingEntry({ ...(item.data as TranscriptEntry), date: item.date })
                    }
                    style={styles.editBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="edit-2" size={10} color="rgba(147, 210, 232, 0.85)" />
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

          {isClip && (
            <Text style={styles.clipLabel}>Pending · not yet transcribed</Text>
          )}

          {entry && entry.text.length > 0 && (
            <Text style={styles.cardText}>{entry.text}</Text>
          )}

          {entry?.photoUri && (
            <Image
              source={{ uri: entry.photoUri }}
              style={styles.photoThumb}
              resizeMode="cover"
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: DaySection }) => {
    const voiceCount = section.data.filter((i) => i.kind === 'transcript').length;
    const manualCount = section.data.filter((i) => i.kind === 'manual').length;
    const clipCount = section.data.filter((i) => i.kind === 'clip').length;
    const parts: string[] = [];
    if (voiceCount > 0) parts.push(`${voiceCount} voice`);
    if (manualCount > 0) parts.push(`${manualCount} manual`);
    if (clipCount > 0) parts.push(`${clipCount} clip${clipCount !== 1 ? 's' : ''}`);
    return (
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionCount}>{parts.join(' · ')}</Text>
        </View>
        {!selectMode && (
          <TouchableOpacity
            onPress={() => handleDeleteDay(section)}
            style={styles.deleteDayBtn}
          >
            <Text style={styles.deleteDayBtnText}>Delete day</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const totalItems = sections.reduce((n, s) => n + s.data.length, 0);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.searchBox}>
          <Feather name="search" size={13} color="rgba(147, 210, 232, 0.55)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transcripts…"
            placeholderTextColor="rgba(147, 210, 232, 0.40)"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Feather name="x" size={13} color="rgba(147, 210, 232, 0.55)" />
            </TouchableOpacity>
          )}
        </View>
        {selectMode ? (
          <TouchableOpacity onPress={exitSelectMode}>
            <Text style={styles.actionBtn}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={enterSelectMode} disabled={totalItems === 0}>
            <Text style={[styles.actionBtn, totalItems === 0 && styles.disabled]}>
              Select
            </Text>
          </TouchableOpacity>
        )}
      </View>

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
            <TouchableOpacity
              onPress={handleDeleteSelected}
              disabled={selected.size === 0}
            >
              <Text style={[styles.deleteAllBtn, selected.size === 0 && styles.disabled]}>
                Delete
              </Text>
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

      <ComposeModal
        visible={editingEntry !== null}
        editEntry={editingEntry ?? undefined}
        onClose={() => setEditingEntry(null)}
        onSaved={(updated) => {
          setEditingEntry(null);
          loadAll();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#010c1a' },

  // ── Top bar ───────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(3, 18, 40, 0.72)',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 40,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.13)',
  },
  searchInput: { flex: 1, color: 'rgba(224, 242, 254, 0.95)', fontSize: 14, fontFamily: 'Avenir' },
  actionBtn: { color: 'rgba(147, 210, 232, 0.85)', fontSize: 15, fontWeight: '600', fontFamily: 'Avenir' },
  disabled: { opacity: 0.35 },

  // ── Select bar ────────────────────────────────────────────────────────────
  selectBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(6, 26, 55, 0.55)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(72, 202, 228, 0.10)',
  },
  selectBarBtn: { color: 'rgba(147, 210, 232, 0.65)', fontSize: 14, fontWeight: '600', minWidth: 40, fontFamily: 'Avenir' },
  selectCount: { color: 'rgba(224, 242, 254, 0.95)', fontSize: 14, fontWeight: '500', fontFamily: 'Avenir' },
  deleteAllBtn: { color: '#e63946', fontSize: 14, fontWeight: '600', minWidth: 40, textAlign: 'right', fontFamily: 'Avenir' },

  // ── Section headers ───────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(1, 12, 26, 0.95)',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 35, 102, 0.08)',
  },
  sectionHeaderLeft: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: 'rgba(224, 242, 254, 0.95)', fontFamily: 'Avenir' },
  sectionCount: { fontSize: 12, color: 'rgba(147, 210, 232, 0.60)', marginTop: 2, fontFamily: 'Avenir' },
  deleteDayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(230, 57, 70, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(230, 57, 70, 0.35)',
  },
  deleteDayBtnText: { color: '#e63946', fontSize: 12, fontWeight: '600', fontFamily: 'Avenir' },

  // ── Cards ─────────────────────────────────────────────────────────────────
  listContent: { paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(3, 18, 40, 0.72)',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.13)',
    shadowColor: '#48cae4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardSelected: {
    backgroundColor: 'rgba(0, 35, 102, 0.08)',
    borderColor: 'rgba(72, 202, 228, 0.30)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(147, 210, 232, 0.35)',
    marginRight: 10,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxSelected: { backgroundColor: 'rgba(72, 202, 228, 0.18)', borderColor: '#48cae4' },
  cardBody: { flex: 1 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardTime: { fontSize: 12, color: 'rgba(147, 210, 232, 0.65)', fontFamily: 'Avenir' },
  cardDuration: { fontSize: 11, color: 'rgba(147, 210, 232, 0.60)', fontFamily: 'Avenir' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 35, 102, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(230, 57, 70, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(230, 57, 70, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipLabel: { fontSize: 13, color: '#f4a261', fontStyle: 'italic', fontFamily: 'Avenir' },
  cardText: { fontSize: 14, color: 'rgba(147, 210, 232, 0.65)', lineHeight: 20, fontFamily: 'Avenir' },
  photoThumb: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyText: {
    color: 'rgba(147, 210, 232, 0.60)',
    textAlign: 'center',
    marginTop: 80,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: 'Avenir',
  },
});
