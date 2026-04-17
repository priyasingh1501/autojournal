/**
 * IntentionsScreen — settings-area management for user-declared intentions.
 *
 * Surfaced from Settings (when ff_intentions is on). Shows:
 *   • Any pending detected suggestion at the top — accept/dismiss
 *   • Active intentions with edit + disable
 *   • Inactive (disabled) intentions collapsed at the bottom
 *   • "Add intention" CTA → simple text input sheet
 *   • Starter-pack migration banner on first open (one-time)
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import {
  getAllIntentions,
  addIntention,
  updateIntention,
  deleteIntention,
  setActive,
  getPendingSuggestion,
  acceptSuggestion,
  dismissSuggestion,
  runStarterPackMigration,
  isStarterPackDone,
} from '../services/IntentionsService';
import { Intention, IntentionCadence, SuggestedIntention } from '../types';

const CADENCES: Array<{ key: IntentionCadence; label: string }> = [
  { key: 'daily',  label: 'Daily'  },
  { key: 'weekly', label: 'Weekly' },
  { key: 'loose',  label: 'Loose'  },
  { key: null,     label: 'No cadence' },
];

interface Props {
  onBack?: () => void;
}

export default function IntentionsScreen({ onBack }: Props) {
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [pending, setPending]       = useState<SuggestedIntention | null>(null);

  const [editing, setEditing] = useState<Intention | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [draftText, setDraftText]       = useState('');
  const [draftCadence, setDraftCadence] = useState<IntentionCadence>(null);
  const [saving, setSaving] = useState(false);

  const [starterBannerOpen, setStarterBannerOpen] = useState(false);
  const [starterRunning, setStarterRunning]       = useState(false);

  const load = useCallback(async () => {
    const [all, p, done] = await Promise.all([
      getAllIntentions(),
      getPendingSuggestion(),
      isStarterPackDone(),
    ]);
    setIntentions(all);
    setPending(p);
    setStarterBannerOpen(!done);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Pending suggestion ─────────────────────────────────────────────────────
  const onAcceptSuggestion = async () => {
    if (!pending) return;
    await acceptSuggestion(pending);
    await load();
  };
  const onDismissSuggestion = async () => {
    if (!pending) return;
    await dismissSuggestion(pending);
    await load();
  };

  // ── Add / edit sheet ───────────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setDraftText('');
    setDraftCadence(null);
    setShowAdd(true);
  };

  const openEdit = (i: Intention) => {
    setEditing(i);
    setDraftText(i.text);
    setDraftCadence(i.cadence);
    setShowAdd(true);
  };

  const onSave = async () => {
    const text = draftText.trim();
    if (!text) return;
    setSaving(true);
    try {
      if (editing) {
        await updateIntention(editing.id, { text, cadence: draftCadence });
      } else {
        await addIntention({ text, source: 'manual', cadence: draftCadence });
      }
      setShowAdd(false);
      await load();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const onDeletePress = (i: Intention) => {
    Alert.alert(
      'Delete intention',
      `Remove "${i.text}"? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteIntention(i.id);
            await load();
          },
        },
      ],
    );
  };

  const onToggleActive = async (i: Intention) => {
    await setActive(i.id, !i.active);
    await load();
  };

  // ── Starter pack ───────────────────────────────────────────────────────────
  const runStarter = async () => {
    setStarterRunning(true);
    try {
      const res = await runStarterPackMigration();
      if (res.created.length > 0) {
        Alert.alert(
          'Starter pack added',
          `Converted ${res.created.length} tracker${res.created.length === 1 ? '' : 's'} to intentions. Edit or disable anytime.`,
        );
      } else if (res.alreadyDone) {
        Alert.alert('Already set up', 'Your starter pack has already been applied.');
      } else {
        Alert.alert('Nothing to convert', 'No enabled trackers in settings to convert.');
      }
      setStarterBannerOpen(false);
      await load();
    } finally {
      setStarterRunning(false);
    }
  };

  const skipStarter = async () => {
    await runStarterPackMigration(); // marks as done with no creates
    setStarterBannerOpen(false);
    await load();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const active   = intentions.filter(i => i.active);
  const inactive = intentions.filter(i => !i.active);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        {onBack && (
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={22} color="rgba(152,212,250,0.80)" />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Intentions</Text>
        <TouchableOpacity onPress={openAdd} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="plus" size={20} color="rgba(224,242,254,0.85)" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Goals you're trying to live toward. They'll show up in your summaries
          when your entries touch on them — not as a scoreboard, as a mirror.
        </Text>

        {/* Starter pack banner */}
        {starterBannerOpen && (
          <View style={styles.starterCard}>
            <Text style={styles.starterTitle}>Convert your trackers?</Text>
            <Text style={styles.starterBody}>
              You had trackers turned on. Want to carry them over as starter
              intentions with sensible cadences? You can edit any of them.
            </Text>
            <View style={styles.starterRow}>
              <TouchableOpacity
                style={styles.starterBtnPrimary}
                onPress={runStarter}
                disabled={starterRunning}
                activeOpacity={0.85}
              >
                {starterRunning
                  ? <ActivityIndicator size="small" color="rgba(224,242,254,0.90)" />
                  : <Text style={styles.starterBtnPrimaryText}>Convert my trackers</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.starterBtnSkip} onPress={skipStarter}>
                <Text style={styles.starterBtnSkipText}>No thanks</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Pending detected suggestion */}
        {pending && (
          <View style={styles.suggestCard}>
            <Text style={styles.suggestLabel}>I NOTICED SOMETHING</Text>
            <Text style={styles.suggestText}>"{pending.text}"</Text>
            <Text style={styles.suggestHint}>
              Sounds like a goal from one of your recent entries. Want to track it?
            </Text>
            <View style={styles.suggestRow}>
              <TouchableOpacity style={styles.suggestBtnPrimary} onPress={onAcceptSuggestion} activeOpacity={0.85}>
                <Text style={styles.suggestBtnPrimaryText}>Yes, track it</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.suggestBtnSkip} onPress={onDismissSuggestion}>
                <Text style={styles.suggestBtnSkipText}>Not quite</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Active intentions */}
        <Text style={styles.sectionLabel}>ACTIVE · {active.length}</Text>
        {active.length === 0 ? (
          <Text style={styles.empty}>
            No active intentions yet. Add one, or wait — when you speak about a
            goal in a note, I'll offer it as a suggestion.
          </Text>
        ) : (
          active.map(i => (
            <IntentionRow
              key={i.id}
              intention={i}
              onEdit={() => openEdit(i)}
              onToggleActive={() => onToggleActive(i)}
              onDelete={() => onDeletePress(i)}
            />
          ))
        )}

        {/* Inactive intentions */}
        {inactive.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 22 }]}>
              INACTIVE · {inactive.length}
            </Text>
            {inactive.map(i => (
              <IntentionRow
                key={i.id}
                intention={i}
                onEdit={() => openEdit(i)}
                onToggleActive={() => onToggleActive(i)}
                onDelete={() => onDeletePress(i)}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* Add / edit sheet */}
      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setShowAdd(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>
              {editing ? 'Edit intention' : 'New intention'}
            </Text>
            <TextInput
              style={styles.sheetInput}
              value={draftText}
              onChangeText={setDraftText}
              placeholder="e.g. Stop doom-scrolling before bed"
              placeholderTextColor="rgba(152,212,250,0.45)"
              multiline
              autoFocus
              maxLength={120}
            />
            <Text style={styles.sheetLabel}>Cadence</Text>
            <View style={styles.cadenceRow}>
              {CADENCES.map(c => {
                const selected = draftCadence === c.key;
                return (
                  <TouchableOpacity
                    key={String(c.key)}
                    style={[styles.cadencePill, selected && styles.cadencePillActive]}
                    onPress={() => setDraftCadence(c.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.cadenceText, selected && styles.cadenceTextActive]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.sheetRow}>
              <TouchableOpacity
                style={styles.sheetBtnPrimary}
                onPress={onSave}
                disabled={saving || !draftText.trim()}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator size="small" color="rgba(224,242,254,0.90)" />
                  : <Text style={styles.sheetBtnPrimaryText}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetBtnCancel} onPress={() => setShowAdd(false)}>
                <Text style={styles.sheetBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ── Row component ───────────────────────────────────────────────────────────

function IntentionRow({
  intention,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  intention: Intention;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[row.wrap, !intention.active && row.wrapInactive]}>
      <View style={{ flex: 1 }}>
        <Text style={[row.text, !intention.active && row.textInactive]}>
          {intention.text}
        </Text>
        <View style={row.metaRow}>
          {intention.cadence && (
            <Text style={row.meta}>{intention.cadence}</Text>
          )}
          <Text style={row.meta}>
            {intention.source === 'detected'     ? 'from your notes'
             : intention.source === 'starter_pack' ? 'starter'
             : 'manual'}
          </Text>
        </View>
      </View>
      <TouchableOpacity onPress={onEdit} style={row.action} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="edit-2" size={14} color="rgba(152,212,250,0.70)" />
      </TouchableOpacity>
      <TouchableOpacity onPress={onToggleActive} style={row.action} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather
          name={intention.active ? 'pause' : 'play'}
          size={14}
          color="rgba(152,212,250,0.70)"
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} style={row.action} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="trash-2" size={14} color="rgba(252,165,165,0.70)" />
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
  },
  title: {
    flex: 1,
    fontSize: 20, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.95)', textAlign: 'center',
  },

  content: { padding: 18, paddingBottom: 40 },
  subtitle: {
    fontSize: 13, lineHeight: 20,
    color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
    marginBottom: 20,
  },

  sectionLabel: {
    fontSize: 10, letterSpacing: 0.8, fontWeight: '500',
    color: 'rgba(152, 212, 250, 0.55)',
    fontFamily: 'GillSans-Light',
    marginBottom: 10,
  },
  empty: {
    fontSize: 13, lineHeight: 20,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    fontStyle: 'italic',
    padding: 6,
  },

  // Starter banner
  starterCard: {
    padding: 14, marginBottom: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(9,41,173,0.20)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.25)',
  },
  starterTitle: {
    fontSize: 14, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.92)',
    marginBottom: 4,
  },
  starterBody: {
    fontSize: 13, lineHeight: 19,
    color: 'rgba(152,212,250,0.75)',
    fontFamily: 'GillSans-Light',
    marginBottom: 10,
  },
  starterRow: { flexDirection: 'row', gap: 10 },
  starterBtnPrimary: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(9,41,173,0.60)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.35)',
  },
  starterBtnPrimaryText: {
    fontSize: 13, color: 'rgba(224,242,254,0.92)',
    fontFamily: 'GillSans-Light',
  },
  starterBtnSkip: { paddingHorizontal: 8, paddingVertical: 8 },
  starterBtnSkipText: {
    fontSize: 13, color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
  },

  // Pending suggestion
  suggestCard: {
    padding: 14, marginBottom: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(3,18,40,0.72)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.22)',
  },
  suggestLabel: {
    fontSize: 10, letterSpacing: 0.8, fontWeight: '500',
    color: 'rgba(152, 212, 250, 0.60)',
    fontFamily: 'GillSans-Light',
    marginBottom: 6,
  },
  suggestText: {
    fontSize: 15, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.92)',
    marginBottom: 6,
  },
  suggestHint: {
    fontSize: 13, lineHeight: 19,
    color: 'rgba(152,212,250,0.70)',
    fontFamily: 'GillSans-Light',
    marginBottom: 10,
  },
  suggestRow: { flexDirection: 'row', gap: 10 },
  suggestBtnPrimary: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(9,41,173,0.60)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.35)',
  },
  suggestBtnPrimaryText: {
    fontSize: 13, color: 'rgba(224,242,254,0.92)',
    fontFamily: 'GillSans-Light',
  },
  suggestBtnSkip: { paddingHorizontal: 8, paddingVertical: 9 },
  suggestBtnSkipText: {
    fontSize: 13, color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
  },

  // Add/edit sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,14,0.82)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#02060E',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32,
    borderTopWidth: 1, borderTopColor: 'rgba(152,212,250,0.18)',
  },
  sheetTitle: {
    fontSize: 17, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.92)',
    marginBottom: 12,
  },
  sheetInput: {
    minHeight: 64, maxHeight: 140,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.20)',
    backgroundColor: 'rgba(9,41,173,0.08)',
    color: 'rgba(224,242,254,0.92)',
    fontSize: 15, lineHeight: 22,
    fontFamily: 'GillSans-Light',
    textAlignVertical: 'top',
  },
  sheetLabel: {
    marginTop: 14, marginBottom: 8,
    fontSize: 11, letterSpacing: 0.5,
    color: 'rgba(152,212,250,0.60)',
    fontFamily: 'GillSans-Light',
  },
  cadenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cadencePill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.20)',
    backgroundColor: 'rgba(9,41,173,0.08)',
  },
  cadencePillActive: {
    borderColor: 'rgba(152,212,250,0.60)',
    backgroundColor: 'rgba(9,41,173,0.40)',
  },
  cadenceText: {
    fontSize: 12,
    color: 'rgba(152,212,250,0.70)',
    fontFamily: 'GillSans-Light',
  },
  cadenceTextActive: { color: 'rgba(224,242,254,0.92)' },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  sheetBtnPrimary: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(9,41,173,0.60)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.35)',
  },
  sheetBtnPrimaryText: {
    fontSize: 13, color: 'rgba(224,242,254,0.92)',
    fontFamily: 'GillSans-Light',
  },
  sheetBtnCancel: { paddingHorizontal: 12, paddingVertical: 10 },
  sheetBtnCancelText: {
    fontSize: 13, color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
  },
});

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(3,18,40,0.55)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)',
    marginBottom: 8,
  },
  wrapInactive: { opacity: 0.55 },
  text: {
    fontSize: 14, lineHeight: 20,
    color: 'rgba(224,242,254,0.88)',
    fontFamily: 'GillSans-Light',
  },
  textInactive: { textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  meta: {
    fontSize: 10, letterSpacing: 0.4,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    textTransform: 'uppercase',
  },
  action: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
});
