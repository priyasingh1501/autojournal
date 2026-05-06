/**
 * CuratedMindPicker — the flag-on "new perspective" picker.
 *
 * Layout:
 *   • Companion at top, rendered with its curated copy. Brand-accent stroke
 *     on the left to visually distinguish it from the specialists.
 *   • 0–2 curated specialists below Companion, each with its rule-specific
 *     one-liner.
 *   • If `showSeeAllMinds` is true (i.e. not acute distress), a "See all
 *     minds" toggle that reveals the remaining specialists alphabetical.
 *
 * This component is stateless w.r.t. data fetching — the caller builds a
 * CurationContext, runs `curate()`, and passes the result in. Keeps the
 * component easy to slot into any "new perspective" tap site.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import type { CurationResult } from '../services/mindCuration';
import { MINDS_V2 } from '../services/mindsConfigV2';
import type { MindV2, WellbeingState } from '../types';

interface Props {
  visible: boolean;
  result: CurationResult | null;
  onPick: (mindId: string | null) => void; // null => Companion (legacy wire protocol)
  onClose: () => void;
  /**
   * When 'hard_stretch', taps on a specialist (including via "See all minds")
   * show a soft interception dialog offering Companion first. The user can
   * still proceed to the specialist if they choose.
   */
  wellbeingState?: WellbeingState;
}

export default function CuratedMindPicker({ visible, result, onPick, onClose, wellbeingState }: Props) {
  const [showAll, setShowAll] = useState(false);

  // Soft interception: in 'hard_stretch', specialist taps show a confirm
  // dialog offering Companion first. Companion taps proceed normally.
  const handlePick = (mindId: string | null) => {
    if (mindId === null) {
      onPick(null);
      return;
    }
    if (wellbeingState === 'hard_stretch') {
      Alert.alert(
        "You've been in a hard stretch",
        'Would you like to sit with Companion first? The others will be here when you\'re ready.',
        [
          { text: 'Open Companion', onPress: () => onPick(null) },
          { text: 'Go ahead anyway', style: 'destructive', onPress: () => onPick(mindId) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    onPick(mindId);
  };

  const { surfacedIds, otherMinds } = useMemo(() => {
    if (!result) return { surfacedIds: new Set<string>(), otherMinds: [] as MindV2[] };
    const surfaced = new Set<string>([
      'companion',
      ...result.specialists.map(s => s.id),
    ]);
    const others = MINDS_V2
      .filter(m => !surfaced.has(m.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    return { surfacedIds: surfaced, otherMinds: others };
  }, [result]);

  // Reset showAll each time the modal closes so a repeat open starts collapsed.
  React.useEffect(() => {
    if (!visible) setShowAll(false);
  }, [visible]);

  if (!result) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>A new perspective</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={18} color="rgba(152,212,250,0.55)" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
            {/* Companion — always first, brand accent stroke */}
            <TouchableOpacity
              style={styles.companionRow}
              onPress={() => handlePick(null)}
              activeOpacity={0.85}
            >
              <View style={[styles.avatarCompanion, styles.avatar]}>
                <Feather name="heart" size={18} color="rgba(224,242,254,0.90)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nameCompanion}>{result.companion.displayName}</Text>
                <Text style={styles.copy}>{result.companion.copy}</Text>
              </View>
              <Feather name="chevron-right" size={16} color="rgba(152,212,250,0.55)" />
            </TouchableOpacity>

            {/* Curated specialists */}
            {result.specialists.map(s => {
              const mind = MINDS_V2.find(m => m.id === s.id);
              return (
                <SpecialistRow
                  key={s.id}
                  mind={mind}
                  fallbackName={s.displayName}
                  copy={s.copy}
                  onPress={() => handlePick(s.id)}
                />
              );
            })}

            {/* See all minds toggle */}
            {result.showSeeAllMinds && otherMinds.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.seeAllBtn}
                  onPress={() => setShowAll(v => !v)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.seeAllText}>
                    {showAll ? 'Hide other minds' : 'See all minds'}
                  </Text>
                  <Feather
                    name={showAll ? 'chevron-up' : 'chevron-down'}
                    size={13}
                    color="rgba(152,212,250,0.65)"
                  />
                </TouchableOpacity>

                {showAll && (
                  <View style={styles.othersWrap}>
                    {otherMinds.map(mind => (
                      <SpecialistRow
                        key={mind.id}
                        mind={mind}
                        fallbackName={mind.name}
                        copy={mind.teaser}
                        muted
                        onPress={() => handlePick(mind.id)}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Specialist row ──────────────────────────────────────────────────────────

function SpecialistRow({
  mind,
  fallbackName,
  copy,
  onPress,
  muted,
}: {
  mind: MindV2 | undefined;
  fallbackName: string;
  copy: string;
  onPress: () => void;
  muted?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, muted && styles.rowMuted]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {mind?.image ? (
        <Image source={mind.image} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarSymbol}>{mind?.symbol ?? '✦'}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{mind?.name ?? fallbackName}</Text>
        <Text style={styles.copy} numberOfLines={2}>{copy}</Text>
      </View>
      <Feather name="chevron-right" size={16} color="rgba(152,212,250,0.45)" />
    </TouchableOpacity>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,14,0.82)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#02060E',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 20, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: 'rgba(152,212,250,0.18)',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 17, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.95)',
  },

  // Companion row — brand accent stroke + subtle tint
  companionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, paddingLeft: 14,
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.30)',
    backgroundColor: 'rgba(9,41,173,0.20)',
    borderLeftWidth: 3, borderLeftColor: 'rgba(152,212,250,0.80)',
    marginBottom: 12,
  },
  avatarCompanion: {
    backgroundColor: 'rgba(9,41,173,0.55)',
  },
  nameCompanion: {
    fontSize: 15, fontWeight: '500',
    color: 'rgba(224,242,254,0.95)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.2,
    marginBottom: 2,
  },

  // Specialist row
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)',
    backgroundColor: 'rgba(3,18,40,0.55)',
    marginBottom: 8,
  },
  rowMuted: { opacity: 0.75 },
  name: {
    fontSize: 14, fontWeight: '500',
    color: 'rgba(224,242,254,0.92)',
    fontFamily: 'GillSans-Light',
    marginBottom: 2,
  },
  copy: {
    fontSize: 12, lineHeight: 17,
    color: 'rgba(152,212,250,0.70)',
    fontFamily: 'GillSans-Light',
  },

  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarFallback: {
    backgroundColor: 'rgba(9,41,173,0.25)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.22)',
  },
  avatarSymbol: {
    fontSize: 18, color: 'rgba(224,242,254,0.90)',
  },

  // See all
  seeAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, marginTop: 4,
  },
  seeAllText: {
    fontSize: 12, letterSpacing: 0.3,
    color: 'rgba(152,212,250,0.75)',
    fontFamily: 'GillSans-Light',
  },
  othersWrap: { marginTop: 4 },
});
