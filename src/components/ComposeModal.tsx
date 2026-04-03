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
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { StorageService } from '../services/StorageService';
import { extractAndSaveExpenses } from '../services/ExpenseService';
import { TranscriptEntry } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (entry: TranscriptEntry) => void;
  /** If provided the modal opens in edit mode pre-filled with this entry */
  editEntry?: TranscriptEntry & { date: string };
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
function formatTargetDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function ComposeModal({ visible, onClose, onSaved, editEntry, targetDate }: Props) {
  const isEditing = !!editEntry;
  const [text, setText] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Pre-fill when opening in edit mode
  React.useEffect(() => {
    if (visible && editEntry) {
      setText(editEntry.text);
      setPhotoUri(editEntry.photoUri ?? null);
    }
  }, [visible, editEntry]);

  const reset = () => {
    setText('');
    setPhotoUri(null);
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickImage = (source: 'camera' | 'library') => {
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
        const updated: TranscriptEntry = {
          ...editEntry,
          text: text.trim(),
          photoUri: savedPhotoUri,
        };
        await StorageService.updateTranscript(updated, editEntry.date);
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
        await StorageService.addTranscript(entry);
        onSaved(entry);
        // Fire-and-forget expense extraction — passes photo for OCR if one is attached
        const date = new Date(entry.timestamp).toISOString().split('T')[0];
        extractAndSaveExpenses(entry.text, date, entry.id, savedPhotoUri).catch(() => {});
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
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>
                {isEditing ? 'Edit Entry' : 'New Entry'}
              </Text>
              {!isEditing && targetDate && (
                <View style={styles.datePill}>
                  <Feather name="calendar" size={10} color="rgba(152, 212, 250, 0.55)" />
                  <Text style={styles.datePillText}>{formatTargetDate(targetDate)}</Text>
                </View>
              )}
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
            contentContainerStyle={{ paddingBottom: 24 }}
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
              onPress={() => pickImage('library')}
            >
              <Feather name="camera" size={14} color="rgba(152, 212, 250, 0.65)" />
              <Text style={styles.photoButtonText}>
                {photoUri ? 'Change photo' : 'Add photo'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
});
