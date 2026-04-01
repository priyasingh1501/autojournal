import React, { useState, useEffect } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StorageService } from '../services/StorageService';
import { fetchElevenLabsVoices, ELVoice } from '../services/ElevenLabsService';
import { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  openaiApiKey: '',
  anthropicApiKey: '',
  vadThreshold: -35,
  silenceDuration: 2000,
  summaryTime: '21:00',
  batchSize: 0,
};

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);
  const [elVoices, setElVoices] = useState<ELVoice[]>([]);
  const [loadingElVoices, setLoadingElVoices] = useState(false);
  const [elVoiceError, setElVoiceError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadElVoices = async (key: string) => {
    if (!key.trim()) return;
    setLoadingElVoices(true);
    setElVoiceError(null);
    try {
      const list = await fetchElevenLabsVoices(key.trim());
      setElVoices(list.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e: any) {
      setElVoiceError(e?.message ?? 'Could not load voices.');
    } finally {
      setLoadingElVoices(false);
    }
  };

  const loadSettings = async () => {
    const s = await StorageService.getSettings();
    if (s) setSettings(s);
  };

  const saveSettings = async () => {
    if (!settings.openaiApiKey || !settings.anthropicApiKey) {
      Alert.alert('Missing Keys', 'Please fill in both API keys.');
      return;
    }
    await StorageService.saveSettings(settings);
    Alert.alert('Saved', 'Settings saved successfully.');
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* API Keys */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API Keys</Text>
          <Text style={styles.sectionSubtitle}>
            Required to enable transcription and summaries.
          </Text>

          <Text style={styles.label}>OpenAI API Key (for Whisper transcription)</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={settings.openaiApiKey}
              onChangeText={(v) => setSettings(prev => ({ ...prev, openaiApiKey: v }))}
              placeholder="sk-..."
              placeholderTextColor="rgba(152, 212, 250, 0.40)"
              secureTextEntry={!showOpenAIKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowOpenAIKey(!showOpenAIKey)}
            >
              <Feather name={showOpenAIKey ? 'eye-off' : 'eye'} size={16} color="rgba(152, 212, 250, 0.65)" />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Anthropic API Key (for Claude summaries)</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={settings.anthropicApiKey}
              onChangeText={(v) => setSettings(prev => ({ ...prev, anthropicApiKey: v }))}
              placeholder="sk-ant-..."
              placeholderTextColor="rgba(152, 212, 250, 0.40)"
              secureTextEntry={!showAnthropicKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowAnthropicKey(!showAnthropicKey)}
            >
              <Feather name={showAnthropicKey ? 'eye-off' : 'eye'} size={16} color="rgba(152, 212, 250, 0.65)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Voice Detection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Voice Detection</Text>

          <Text style={styles.label}>
            Sensitivity: {settings.vadThreshold} dB
          </Text>
          <Text style={styles.hint}>
            Lower = more sensitive (picks up quiet sounds). Higher = less sensitive.
          </Text>

          <View style={styles.thresholdButtons}>
            {[-55, -45, -35, -25].map((val) => (
              <TouchableOpacity
                key={val}
                style={[
                  styles.thresholdButton,
                  settings.vadThreshold === val && styles.thresholdButtonSelected,
                ]}
                onPress={() => setSettings(prev => ({ ...prev, vadThreshold: val }))}
              >
                <Text style={[
                  styles.thresholdButtonText,
                  settings.vadThreshold === val && styles.thresholdButtonTextSelected,
                ]}>
                  {val} dB
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>
            Silence timeout: {(settings.silenceDuration / 1000).toFixed(1)}s
          </Text>
          <Text style={styles.hint}>
            How long to wait after silence before saving the recording.
          </Text>
          <View style={styles.thresholdButtons}>
            {[1000, 1500, 2000, 3000].map((val) => (
              <TouchableOpacity
                key={val}
                style={[
                  styles.thresholdButton,
                  settings.silenceDuration === val && styles.thresholdButtonSelected,
                ]}
                onPress={() => setSettings(prev => ({ ...prev, silenceDuration: val }))}
              >
                <Text style={[
                  styles.thresholdButtonText,
                  settings.silenceDuration === val && styles.thresholdButtonTextSelected,
                ]}>
                  {val / 1000}s
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ElevenLabs — Call voice */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Call Voice · ElevenLabs</Text>
          <Text style={styles.sectionSubtitle}>
            Add your ElevenLabs API key for a lifelike voice during Call mode. Leave blank to use the device voice.
          </Text>

          <Text style={styles.label}>ElevenLabs API Key</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={settings.elevenLabsApiKey ?? ''}
              onChangeText={v => setSettings(prev => ({ ...prev, elevenLabsApiKey: v }))}
              placeholder="sk_..."
              placeholderTextColor="rgba(152, 212, 250, 0.40)"
              secureTextEntry={!showElevenLabsKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowElevenLabsKey(v => !v)}>
              <Feather name={showElevenLabsKey ? 'eye-off' : 'eye'} size={16} color="rgba(152, 212, 250, 0.65)" />
            </TouchableOpacity>
          </View>

          {/* Manual voice ID entry */}
          <Text style={styles.label}>Voice ID</Text>
          <Text style={styles.hint}>
            Paste an ElevenLabs voice ID directly, or pick one from the list below.
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={settings.elevenLabsVoiceId ?? ''}
              onChangeText={v => setSettings(prev => ({ ...prev, elevenLabsVoiceId: v }))}
              placeholder="e.g. EXAVITQu4vr4xnSDxMaL"
              placeholderTextColor="rgba(152, 212, 250, 0.40)"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!!settings.elevenLabsVoiceId && (
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setSettings(prev => ({ ...prev, elevenLabsVoiceId: '' }))}
              >
                <Feather name="x" size={15} color="rgba(152, 212, 250, 0.50)" />
              </TouchableOpacity>
            )}
          </View>

          {/* Load from API */}
          <TouchableOpacity
            style={styles.loadVoicesBtn}
            onPress={() => loadElVoices(settings.elevenLabsApiKey ?? '')}
            disabled={loadingElVoices || !settings.elevenLabsApiKey?.trim()}
          >
            {loadingElVoices
              ? <ActivityIndicator size="small" color="rgba(152, 212, 250, 0.80)" />
              : <Text style={styles.loadVoicesBtnText}>Load voices from API</Text>
            }
          </TouchableOpacity>

          {elVoiceError && <Text style={styles.elError}>{elVoiceError}</Text>}

          {elVoices.length > 0 && (
            <>
              <Text style={[styles.hint, { marginTop: 10 }]}>Tap a voice to use its ID ↓</Text>
              {elVoices.map(voice => {
                const isSelected = settings.elevenLabsVoiceId === voice.voice_id;
                return (
                  <TouchableOpacity
                    key={voice.voice_id}
                    style={[styles.voiceRow, isSelected && styles.voiceRowSelected]}
                    onPress={() => setSettings(prev => ({ ...prev, elevenLabsVoiceId: voice.voice_id }))}
                    activeOpacity={0.75}
                  >
                    <View style={styles.voiceInfo}>
                      <Text style={[styles.voiceName, isSelected && styles.voiceNameSelected]}>{voice.name}</Text>
                      <Text style={styles.voiceMeta}>{voice.category} · {voice.voice_id}</Text>
                    </View>
                    {isSelected && (
                      <Feather name="check" size={14} color="rgba(152, 212, 250, 0.90)" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={saveSettings}>
          <Text style={styles.saveButtonText}>Save Settings</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            API keys are stored locally on your device only.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },
  content: { padding: 20 },

  // ── Section cards ─────────────────────────────────────────────────────────
  section: {
    backgroundColor: 'rgba(3, 18, 40, 0.72)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.13)',
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)',
    marginBottom: 6,
    fontFamily: 'Baskerville',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: 'rgba(152, 212, 250, 0.65)',
    marginBottom: 16,
    fontFamily: 'GillSans-Light',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)',
    marginTop: 14,
    marginBottom: 6,
    fontFamily: 'GillSans-Light',
  },
  hint: { fontSize: 12, color: 'rgba(152, 212, 250, 0.60)', marginBottom: 10, fontFamily: 'GillSans-Light' },

  // ── Input rows ─────────────────────────────────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(1, 8, 18, 0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.13)',
    paddingRight: 12,
  },
  input: {
    flex: 1,
    color: 'rgba(224, 242, 254, 0.95)',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'GillSans-Light',
  },
  eyeButton: { padding: 4 },

  // ── Threshold buttons ──────────────────────────────────────────────────────
  thresholdButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  thresholdButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(9, 41, 173, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
    alignItems: 'center',
  },
  thresholdButtonSelected: {
    backgroundColor: 'rgba(9, 41, 173, 0.22)',
    borderColor: 'rgba(152, 212, 250, 0.50)',
  },
  thresholdButtonText: { color: 'rgba(152, 212, 250, 0.85)', fontSize: 13, fontWeight: '500', fontFamily: 'GillSans-Light' },
  thresholdButtonTextSelected: { color: 'rgba(224, 242, 254, 0.95)', fontWeight: '500' },

  // ── Voice picker ───────────────────────────────────────────────────────────
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 6,
    backgroundColor: 'rgba(9, 41, 173, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.10)',
  },
  voiceRowSelected: {
    backgroundColor: 'rgba(9, 41, 173, 0.20)',
    borderColor: 'rgba(152, 212, 250, 0.40)',
  },
  voiceInfo: { flex: 1 },
  voiceName: {
    fontSize: 14,
    color: 'rgba(224, 242, 254, 0.75)',
    fontFamily: 'GillSans-Light',
  },
  voiceNameSelected: {
    color: 'rgba(224, 242, 254, 0.95)',
  },
  voiceMeta: {
    fontSize: 11,
    color: 'rgba(152, 212, 250, 0.50)',
    fontFamily: 'GillSans-Light',
    marginTop: 2,
  },
  previewBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(152, 212, 250, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── ElevenLabs ─────────────────────────────────────────────────────────────
  loadVoicesBtn: {
    marginTop: 12,
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(9, 41, 173, 0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.22)',
    alignSelf: 'flex-start',
    alignItems: 'center',
    minWidth: 110,
  },
  loadVoicesBtnText: { color: 'rgba(152, 212, 250, 0.85)', fontSize: 13, fontFamily: 'GillSans-Light' },
  elError: { fontSize: 12, color: '#e63946', marginTop: 8, fontFamily: 'GillSans-Light' },

  // ── Save button ────────────────────────────────────────────────────────────
  saveButton: {
    backgroundColor: 'rgba(9, 41, 173, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.35)',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  saveButtonText: { color: 'rgba(224, 242, 254, 0.95)', fontSize: 17, fontWeight: '500', fontFamily: 'GillSans-Light' },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: { alignItems: 'center', marginTop: 24, marginBottom: 12 },
  footerText: { color: 'rgba(152, 212, 250, 0.60)', fontSize: 13, textAlign: 'center', fontFamily: 'GillSans-Light' },
});
