import React, { useState, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { StorageService } from '../services/StorageService';
import { extractAndSaveExpenses, quickExtractExpense } from '../services/ExpenseService';
import { generateDailySummary } from '../services/SummaryService';
import { UserContextService } from '../services/UserContextService';
import { ActionablesService } from '../services/ActionablesService';
import { detectAndSuggestIntention } from '../services/IntentionsService';
import { detectEmotions } from '../services/BatchTranscriptionService';
import { effectiveDateStr } from '../services/dayRollover';
import { invalidateDigest } from '../services/DigestService';
import { TranscriptEntry } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (entry: TranscriptEntry) => void;
  /** Called after expense extraction completes so the caller can refresh spend totals */
  onExpensesExtracted?: () => void;
  /** If provided the modal opens in edit mode pre-filled with this entry */
  editEntry?: TranscriptEntry & { date: string };
  /** Called after the entry is deleted in edit mode */
  onDelete?: () => void;
  /**
   * If provided (YYYY-MM-DD), the new entry is saved to that date instead of today.
   * Has no effect when editEntry is set.
   */
  targetDate?: string;
}

const PHOTOS_DIR = FileSystem.documentDirectory + 'photos/';

async function ensurePhotosDir() {
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

async function copyPhotoToApp(uri: string): Promise<string> {
  await ensurePhotosDir();

  // Strip query-string before extracting extension (handles content:// URIs)
  const cleanUri = uri.split('?')[0];
  const rawExt = cleanUri.split('.').pop()?.toLowerCase() ?? '';
  const ext = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(rawExt)
    ? rawExt
    : 'jpg';
  const dest = PHOTOS_DIR + `photo_${Date.now()}.${ext}`;

  if (uri.startsWith('content://')) {
    // content:// URIs can't be copied with FileSystem.copyAsync on Android —
    // use downloadAsync which handles them correctly
    const result = await FileSystem.downloadAsync(uri, dest);
    return result.uri;
  }

  // file:// URI (standard path from expo-image-picker v16+)
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

/** Format YYYY-MM-DD as a short human-readable label, e.g. "Mon, 12 May" */
function formatDateLabel(date: string): string {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (date === today)     return 'Today';
  if (date === yesterday) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString([], {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

/** Returns the last `count` calendar days as YYYY-MM-DD strings, newest first. */
function getPastDates(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  });
}

export default function ComposeModal({ visible, onClose, onSaved, onExpensesExtracted, editEntry, onDelete, targetDate }: Props) {
  const insets = useSafeAreaInsets();
  const isEditing = !!editEntry;
  const [text, setText] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Reset or pre-fill whenever the modal opens
  const prevVisibleRef = React.useRef(false);
  React.useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      if (editEntry) {
        setText(editEntry.text);
        setPhotoUri(editEntry.photoUri ?? null);
        setSelectedDate(editEntry.date);
      } else {
        reset();
      }
    }
    prevVisibleRef.current = visible;
  }, [visible, editEntry]);

  const reset = () => {
    setText('');
    setPhotoUri(null);
    setSaving(false);
    setSelectedDate('');
    setShowDatePicker(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDelete = () => {
    if (!editEntry || !onDelete) return;
    Alert.alert(
      'Delete entry',
      'Remove this entry? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await StorageService.deleteTranscript(editEntry.id, editEntry.date);
            reset();
            onDelete();
          },
        },
      ],
    );
  };

  const pickImage = () => {
    Alert.alert(
      'Add Photo',
      undefined,
      [
        {
          text: 'Camera',
          onPress: () => launchPicker('camera'),
        },
        {
          text: 'Photo Library',
          onPress: () => launchPicker('library'),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const launchPicker = async (source: 'camera' | 'library') => {
    try {
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      };

      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera access is required to take photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Photo library access is required to pick photos.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      if (!result.canceled && result.assets.length > 0) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (e: any) {
      Alert.alert('Could not open picker', e?.message ?? 'Please try again.');
    }
  };

  const handleSave = async () => {
    if (!text.trim() && !photoUri) return;
    setSaving(true);
    try {
      let savedPhotoUri: string | undefined;
      if (photoUri) {
        // Only copy if it's a new photo (not the existing permanent one)
        const alreadySaved = editEntry && photoUri === editEntry.photoUri;
        if (alreadySaved) {
          savedPhotoUri = photoUri;
        } else {
          try {
            savedPhotoUri = await copyPhotoToApp(photoUri);
          } catch (copyErr) {
            console.warn('[ComposeModal] copyPhotoToApp failed, using original URI:', copyErr);
            savedPhotoUri = photoUri;
          }
        }
      }

      if (isEditing && editEntry) {
        const dateChanged = selectedDate && selectedDate !== editEntry.date;
        const updated: TranscriptEntry = {
          ...editEntry,
          text: text.trim(),
          photoUri: savedPhotoUri,
          // If date changed, move timestamp to noon on the new day
          timestamp: dateChanged
            ? new Date(selectedDate + 'T12:00:00').getTime()
            : editEntry.timestamp,
        };

        if (dateChanged) {
          await StorageService.deleteTranscript(editEntry.id, editEntry.date);
          await StorageService.addTranscript(updated);
          // Regenerate summaries for both days fire-and-forget
          const [fromT, toT] = await Promise.all([
            StorageService.getTranscriptsForDate(editEntry.date),
            StorageService.getTranscriptsForDate(selectedDate),
          ]);
          if (fromT.length > 0) {
            generateDailySummary(fromT, editEntry.date).catch((err) =>
              console.error('[ComposeModal] summary regen failed for', editEntry.date, err)
            );
          }
          generateDailySummary(toT, selectedDate).catch((err) =>
            console.error('[ComposeModal] summary regen failed for', selectedDate, err)
          );
        } else {
          await StorageService.updateTranscript(updated, editEntry.date);
        }
        onSaved(updated);
      } else {
        // Use noon on targetDate if provided; otherwise now.
        const timestamp = targetDate
          ? new Date(targetDate + 'T12:00:00').getTime()
          : Date.now();
        const entry: TranscriptEntry = {
          id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp,
          text: text.trim(),
          duration: 0,
          kind: 'manual',
          photoUri: savedPhotoUri,
        };
        // Manual entries before 3am roll back a day (same as voice path in
        // BatchTranscriptionService).
        const date = effectiveDateStr(entry.timestamp);
        await StorageService.addTranscript(entry, { storageDate: date });
        UserContextService.invalidate();
        ActionablesService.invalidate();
        invalidateDigest(date).catch(() => {});
        onSaved(entry);
        // 1. Instant regex extraction — no API call, updates home immediately
        const quick = quickExtractExpense(entry.text, date, entry.id);
        if (quick) {
          StorageService.addExpenses([quick])
            .then(() => onExpensesExtracted?.())
            .catch(() => {});
        }
        // 2. Async Claude extraction — enriches category/description, deduped against quick entry
        extractAndSaveExpenses(entry.text, date, entry.id, savedPhotoUri)
          .then(() => onExpensesExtracted?.())
          .catch(() => {});
        // Intention detection — weekly-throttled inside the service.
        detectAndSuggestIntention(entry).catch(() => {});
        // Emotion tags — async Haiku classification, persisted after save.
        detectEmotions(entry.text)
          .then(tags => {
            if (tags.length === 0) return;
            return StorageService.updateTranscript({ ...entry, emotionTags: tags }, date);
          })
          .catch(() => {});
      }

      reset();
      onClose();
    } catch (e) {
      console.error('[ComposeModal] handleSave failed:', e);
      Alert.alert('Error', 'Failed to save entry. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canSave = (text.trim().length > 0 || photoUri !== null) && !saving;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
      onShow={() => setTimeout(() => inputRef.current?.focus(), 100)}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={[styles.sheet, { marginBottom: keyboardHeight }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>
                {isEditing ? 'Edit Entry' : 'New Entry'}
              </Text>
              {isEditing && selectedDate ? (
                <TouchableOpacity
                  style={styles.datePill}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Feather name="calendar" size={10} color="rgba(152, 212, 250, 0.55)" />
                  <Text style={styles.datePillText}>{formatDateLabel(selectedDate)}</Text>
                  <Feather name="chevron-down" size={10} color="rgba(152, 212, 250, 0.40)" />
                </TouchableOpacity>
              ) : (!isEditing && targetDate) ? (
                <View style={styles.datePill}>
                  <Feather name="calendar" size={10} color="rgba(152, 212, 250, 0.55)" />
                  <Text style={styles.datePillText}>{formatDateLabel(targetDate)}</Text>
                </View>
              ) : null}
            </View>
            {saving ? (
              <ActivityIndicator color="rgba(152, 212, 250, 0.85)" style={styles.headerBtn} />
            ) : (
              <TouchableOpacity
                onPress={handleSave}
                style={styles.headerBtn}
                disabled={!canSave}
              >
                <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>
                  Save
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: Math.max(24, insets.bottom) }}
          >
            {/* Text input */}
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder="What's on your mind?"
              placeholderTextColor="rgba(152, 212, 250, 0.40)"
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="top"
              scrollEnabled={false}
            />

            {/* Photo preview */}
            {photoUri && (
              <View style={styles.photoPreviewContainer}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.removePhoto}
                  onPress={() => setPhotoUri(null)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Feather name="x" size={11} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* Photo button */}
            <TouchableOpacity
              style={styles.photoButton}
              onPress={() => pickImage()}
            >
              <Feather name="camera" size={14} color="rgba(152, 212, 250, 0.65)" />
              <Text style={styles.photoButtonText}>
                {photoUri ? 'Change photo' : 'Add photo'}
              </Text>
            </TouchableOpacity>

            {/* Delete — edit mode only */}
            {isEditing && onDelete && (
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Feather name="trash-2" size={14} color="rgba(239,68,68,0.75)" />
                <Text style={styles.deleteButtonText}>Delete entry</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Date picker sheet — edit mode only */}
      <Modal
        visible={showDatePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableOpacity
          style={styles.datePickerBackdrop}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        />
        <View style={styles.datePickerSheet}>
          <View style={styles.datePickerHandle} />
          <Text style={styles.datePickerTitle}>Move to date</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {getPastDates(30).map(date => {
              const active = date === selectedDate;
              return (
                <TouchableOpacity
                  key={date}
                  style={[styles.dateRow, active && styles.dateRowActive]}
                  onPress={() => {
                    setSelectedDate(date);
                    setShowDatePicker(false);
                  }}
                >
                  <Text style={[styles.dateRowText, active && styles.dateRowTextActive]}>
                    {formatDateLabel(date)}
                  </Text>
                  {active && <Feather name="check" size={14} color="rgba(152, 212, 250, 0.85)" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={{ height: 24 }} />
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  sheet: {
    backgroundColor: '#040d1e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152, 212, 250, 0.18)',
    maxHeight: '90%',
    minHeight: 320,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(152, 212, 250, 0.08)',
  },
  headerBtn: { minWidth: 56 },
  titleWrap: { alignItems: 'center', gap: 4 },
  title: { fontSize: 16, fontWeight: '500', color: 'rgba(224, 242, 254, 0.95)', fontFamily: 'Baskerville' },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(152, 212, 250, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  datePillText: { fontSize: 11, color: 'rgba(152, 212, 250, 0.55)', fontFamily: 'GillSans-Light' },

  // ── Date picker sheet ─────────────────────────────────────────────────────
  datePickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.60)',
  },
  datePickerSheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#040d1e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152, 212, 250, 0.15)',
    maxHeight: '60%',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  datePickerHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(152, 212, 250, 0.25)',
    alignSelf: 'center', marginBottom: 14,
  },
  datePickerTitle: {
    fontSize: 15, fontWeight: '600',
    color: 'rgba(224, 242, 254, 0.85)',
    fontFamily: 'Baskerville',
    marginBottom: 10,
  },
  dateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: 'rgba(152, 212, 250, 0.07)',
  },
  dateRowActive: { borderBottomColor: 'transparent' },
  dateRowText: {
    fontSize: 15, color: 'rgba(152, 212, 250, 0.60)',
    fontFamily: 'GillSans-Light',
  },
  dateRowTextActive: { color: 'rgba(224, 242, 254, 0.95)', fontWeight: '500' },
  cancelText: { color: 'rgba(152, 212, 250, 0.65)', fontSize: 15, fontFamily: 'GillSans-Light' },
  saveText: { color: 'rgba(152, 212, 250, 0.85)', fontSize: 15, fontWeight: '500', textAlign: 'right', fontFamily: 'GillSans-Light' },
  saveTextDisabled: { opacity: 0.35 },
  body: { paddingHorizontal: 18, paddingTop: 14 },
  textInput: {
    color: 'rgba(224, 242, 254, 0.95)',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    marginBottom: 14,
    backgroundColor: 'transparent',
    fontFamily: 'GillSans-Light',
  },
  photoPreviewContainer: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  removePhoto: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(9, 41, 173, 0.18)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
    alignSelf: 'flex-start',
  },
  photoButtonText: { color: 'rgba(152, 212, 250, 0.65)', fontSize: 14, fontWeight: '500', fontFamily: 'GillSans-Light' },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    alignSelf: 'flex-start',
  },
  deleteButtonText: {
    color: 'rgba(239,68,68,0.80)',
    fontSize: 14,
    fontFamily: 'GillSans-Light',
  },
});
