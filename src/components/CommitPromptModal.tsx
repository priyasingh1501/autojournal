/**
 * CommitPromptModal — captures cadence + why when promoting an intention
 * to a tracked commitment. Two inputs only, both optional in shape but
 * cadence is required to confirm.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Intention, IntentionCadence } from '../types';

type Cadence = Exclude<IntentionCadence, null>;

interface Props {
  intention: Intention | null;
  visible: boolean;
  onClose: () => void;
  onConfirm: (cadence: Cadence, whyText: string) => void;
}

const CADENCE_OPTIONS: Array<{ value: Cadence; label: string; sub: string }> = [
  { value: 'daily',  label: 'Daily',  sub: 'every day-ish' },
  { value: 'weekly', label: 'Weekly', sub: 'a few times a week' },
  { value: 'loose',  label: 'Loose',  sub: 'when it fits' },
];

export default function CommitPromptModal({ intention, visible, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const [cadence, setCadence] = useState<Cadence | null>(null);
  const [why, setWhy]         = useState('');

  useEffect(() => {
    if (!visible) return;
    setCadence(intention?.cadence ?? null);
    setWhy(intention?.whyText ?? '');
  }, [visible, intention?.id]);

  if (!intention) return null;

  const canConfirm = cadence !== null;

  const handleConfirm = () => {
    if (!cadence) return;
    onConfirm(cadence, why.trim());
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.sheet}>
          <View style={s.handle} />
          <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={20} color="rgba(152, 212, 250, 0.5)" />
          </TouchableOpacity>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={s.eyebrow}>COMMIT TO</Text>
            <Text style={s.intentionText}>"{intention.text}"</Text>

            <Text style={s.sectionLabel}>Cadence</Text>
            <View style={s.cadenceRow}>
              {CADENCE_OPTIONS.map(opt => {
                const selected = cadence === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.cadenceChip, selected && s.cadenceChipSelected]}
                    onPress={() => setCadence(opt.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.cadenceLabel, selected && s.cadenceLabelSelected]}>{opt.label}</Text>
                    <Text style={s.cadenceSub}>{opt.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.sectionLabel}>Why this matters <Text style={s.optional}>(optional)</Text></Text>
            <TextInput
              style={s.input}
              placeholder="One line is enough — what makes this worth doing?"
              placeholderTextColor="rgba(152, 212, 250, 0.30)"
              multiline
              value={why}
              onChangeText={setWhy}
              maxLength={200}
              selectionColor="rgba(152, 212, 250, 0.5)"
            />
          </ScrollView>

          <TouchableOpacity
            style={[
              s.confirmBtn,
              { marginBottom: Math.max(16, insets.bottom) },
              !canConfirm && s.confirmBtnDisabled,
            ]}
            onPress={handleConfirm}
            disabled={!canConfirm}
            activeOpacity={0.75}
          >
            <Text style={[s.confirmText, !canConfirm && s.confirmTextDisabled]}>
              Commit
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 14, 0.72)',
  },
  sheet: {
    backgroundColor: '#0a1223',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(152, 212, 250, 0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 18,
    right: 20,
    padding: 4,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1,
    color: 'rgba(152, 212, 250, 0.55)',
    fontFamily: 'GillSans-Light',
    marginTop: 4,
    marginBottom: 6,
  },
  intentionText: {
    fontSize: 18,
    lineHeight: 25,
    color: 'rgba(224, 242, 254, 0.92)',
    fontFamily: 'Baskerville',
    fontStyle: 'italic',
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 12,
    color: 'rgba(152, 212, 250, 0.65)',
    fontFamily: 'GillSans-Light',
    marginBottom: 10,
    marginTop: 6,
  },
  optional: {
    color: 'rgba(152, 212, 250, 0.35)',
  },
  cadenceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  cadenceChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
    backgroundColor: 'rgba(152, 212, 250, 0.04)',
    alignItems: 'center',
    gap: 2,
  },
  cadenceChipSelected: {
    borderColor: 'rgba(152, 212, 250, 0.55)',
    backgroundColor: 'rgba(9, 41, 173, 0.30)',
  },
  cadenceLabel: {
    fontSize: 14,
    color: 'rgba(224, 242, 254, 0.78)',
    fontFamily: 'GillSans-Light',
  },
  cadenceLabelSelected: {
    color: 'rgba(224, 242, 254, 0.98)',
  },
  cadenceSub: {
    fontSize: 11,
    color: 'rgba(152, 212, 250, 0.50)',
    fontFamily: 'GillSans-Light',
  },
  input: {
    backgroundColor: 'rgba(152, 212, 250, 0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.12)',
    padding: 14,
    color: 'rgba(224, 242, 254, 0.88)',
    fontSize: 14,
    lineHeight: 20,
    minHeight: 72,
    textAlignVertical: 'top',
    fontFamily: 'GillSans-Light',
  },
  confirmBtn: {
    backgroundColor: 'rgba(9, 41, 173, 0.45)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.32)',
  },
  confirmBtnDisabled: {
    backgroundColor: 'rgba(152, 212, 250, 0.05)',
    borderColor: 'rgba(152, 212, 250, 0.10)',
  },
  confirmText: {
    color: 'rgba(224, 242, 254, 0.95)',
    fontSize: 15,
    fontFamily: 'GillSans-Light',
  },
  confirmTextDisabled: {
    color: 'rgba(152, 212, 250, 0.35)',
  },
});
