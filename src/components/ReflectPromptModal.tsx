/**
 * ReflectPromptModal — seeded journaling prompt from a Wisdom Short.
 *
 * Flow:
 *   1. Opens with a loading state while generateReflectPrompt() runs.
 *   2. Displays the generated prompt (≤20 words) + a free-text input.
 *   3. "Done" dismisses. The typed text is handed back via onSave for
 *      the caller to persist however it likes (no storage done here).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WisdomShort } from '../types';
import { generateReflectPrompt } from '../services/WisdomService';

interface Props {
  short: WisdomShort | null;
  visible: boolean;
  onClose: () => void;
  /** Called with the reflection text when the user taps Done (may be empty). */
  onSave?: (shortId: string, text: string) => void;
}

const FALLBACK_PROMPTS: Record<string, string> = {
  'entry': 'What is this moment asking you to notice?',
  'mid':   'What assumption underneath this feeling can you examine?',
  'deep':  'Who is the one observing this experience right now?',
};

export default function ReflectPromptModal({ short, visible, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const [prompt, setPrompt]     = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [reflection, setReflection] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible || !short) return;
    setPrompt(null);
    setReflection('');
    setLoading(true);

    generateReflectPrompt(short)
      .then(p => setPrompt(p ?? FALLBACK_PROMPTS[short.depth] ?? FALLBACK_PROMPTS['mid']))
      .catch(() => setPrompt(FALLBACK_PROMPTS[short.depth] ?? FALLBACK_PROMPTS['mid']))
      .finally(() => setLoading(false));
  }, [visible, short?.id]);

  const handleDone = () => {
    if (short && onSave && reflection.trim()) {
      onSave(short.id, reflection.trim());
    }
    onClose();
  };

  if (!short) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          {/* ── Handle ── */}
          <View style={styles.handle} />

          {/* ── Close ── */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Feather name="x" size={20} color="rgba(152, 212, 250, 0.5)" />
          </TouchableOpacity>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Source ── */}
            <Text style={styles.sourceLabel}>{short.source_author}</Text>
            <Text style={styles.sourceTitle} numberOfLines={2}>{short.title}</Text>

            {/* ── Prompt ── */}
            <View style={styles.promptBox}>
              {loading ? (
                <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.6)" />
              ) : (
                <Text style={styles.promptText}>{prompt}</Text>
              )}
            </View>

            {/* ── Input ── */}
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Write freely…"
              placeholderTextColor="rgba(152, 212, 250, 0.25)"
              multiline
              value={reflection}
              onChangeText={setReflection}
              autoFocus={!loading}
              selectionColor="rgba(152, 212, 250, 0.5)"
            />
          </ScrollView>

          {/* ── Done ── */}
          <TouchableOpacity style={[styles.doneBtn, { marginBottom: Math.max(16, insets.bottom) }]} onPress={handleDone}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
    paddingBottom: 0, // handled dynamically via insets in component
    paddingHorizontal: 20,
    minHeight: 380,
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
    paddingBottom: 16,
  },
  sourceLabel: {
    fontSize: 12,
    color: 'rgba(152, 212, 250, 0.5)',
    fontStyle: 'italic',
    marginBottom: 4,
    marginTop: 8,
  },
  sourceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(224, 242, 254, 0.85)',
    marginBottom: 20,
    fontFamily: 'Baskerville',
    lineHeight: 21,
  },
  promptBox: {
    backgroundColor: 'rgba(152, 212, 250, 0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.15)',
    padding: 16,
    marginBottom: 18,
    minHeight: 56,
    justifyContent: 'center',
  },
  promptText: {
    fontSize: 16,
    color: 'rgba(224, 242, 254, 0.92)',
    fontStyle: 'italic',
    lineHeight: 23,
    fontFamily: 'Baskerville',
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'rgba(152, 212, 250, 0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.12)',
    padding: 14,
    color: 'rgba(224, 242, 254, 0.88)',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  doneBtn: {
    backgroundColor: 'rgba(152, 212, 250, 0.12)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.2)',
  },
  doneBtnText: {
    color: 'rgba(224, 242, 254, 0.9)',
    fontSize: 15,
    fontWeight: '600',
  },
});
