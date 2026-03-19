import React, { useState, useRef } from 'react';
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
import * as FileSystem from 'expo-file-system';
import { StorageService } from '../services/StorageService';
import { TranscriptEntry } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (entry: TranscriptEntry) => void;
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
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const filename = `photo_${Date.now()}.${ext}`;
  const dest = PHOTOS_DIR + filename;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export default function ComposeModal({ visible, onClose, onSaved }: Props) {
  const [text, setText] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

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
          text: '📷 Camera',
          onPress: () => launchPicker('camera'),
        },
        {
          text: '🖼️ Photo Library',
          onPress: () => launchPicker('library'),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const launchPicker = async (source: 'camera' | 'library') => {
    let result: ImagePicker.ImagePickerResult;
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    };

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
  };

  const handleSave = async () => {
    if (!text.trim() && !photoUri) return;
    setSaving(true);
    try {
      let savedPhotoUri: string | undefined;
      if (photoUri) {
        savedPhotoUri = await copyPhotoToApp(photoUri);
      }

      const entry: TranscriptEntry = {
        id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        text: text.trim(),
        duration: 0,
        kind: 'manual',
        photoUri: savedPhotoUri,
      };

      await StorageService.addTranscript(entry);
      onSaved(entry);
      reset();
      onClose();
    } catch (e) {
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
            <Text style={styles.title}>New Entry</Text>
            {saving ? (
              <ActivityIndicator color="#e94560" style={styles.headerBtn} />
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
              placeholderTextColor="#4b5563"
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
                  <Text style={styles.removePhotoText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Photo button */}
            <TouchableOpacity
              style={styles.photoButton}
              onPress={() => pickImage('library')}
            >
              <Text style={styles.photoButtonIcon}>📷</Text>
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#16213e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
    borderBottomColor: '#1f2d4e',
  },
  headerBtn: { minWidth: 56 },
  title: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  cancelText: { color: '#9ca3af', fontSize: 15 },
  saveText: { color: '#e94560', fontSize: 15, fontWeight: '700', textAlign: 'right' },
  saveTextDisabled: { opacity: 0.35 },
  body: { paddingHorizontal: 18, paddingTop: 14 },
  textInput: {
    color: '#e5e7eb',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    marginBottom: 14,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    alignSelf: 'flex-start',
  },
  photoButtonIcon: { fontSize: 16 },
  photoButtonText: { color: '#9ca3af', fontSize: 14, fontWeight: '500' },
});
