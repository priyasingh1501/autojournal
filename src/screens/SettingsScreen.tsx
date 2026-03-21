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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StorageService } from '../services/StorageService';
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

  useEffect(() => {
    loadSettings();
  }, []);

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
              placeholderTextColor="rgba(72, 202, 228, 0.3)"
              secureTextEntry={!showOpenAIKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowOpenAIKey(!showOpenAIKey)}
            >
              <Feather name={showOpenAIKey ? 'eye-off' : 'eye'} size={18} color="rgba(147, 210, 232, 0.65)" />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Anthropic API Key (for Claude summaries)</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={settings.anthropicApiKey}
              onChangeText={(v) => setSettings(prev => ({ ...prev, anthropicApiKey: v }))}
              placeholder="sk-ant-..."
              placeholderTextColor="rgba(72, 202, 228, 0.3)"
              secureTextEntry={!showAnthropicKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowAnthropicKey(!showAnthropicKey)}
            >
              <Feather name={showAnthropicKey ? 'eye-off' : 'eye'} size={18} color="rgba(147, 210, 232, 0.65)" />
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
  container: { flex: 1, backgroundColor: '#010c1a' },
  content: { padding: 20 },

  // ── Section cards ─────────────────────────────────────────────────────────
  section: {
    backgroundColor: 'rgba(3, 18, 40, 0.72)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.13)',
    shadowColor: '#48cae4',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(224, 242, 254, 0.95)',
    marginBottom: 6,
    fontFamily: 'Avenir',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: 'rgba(147, 210, 232, 0.65)',
    marginBottom: 16,
    fontFamily: 'Avenir',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(224, 242, 254, 0.95)',
    marginTop: 14,
    marginBottom: 6,
    fontFamily: 'Avenir',
  },
  hint: { fontSize: 12, color: 'rgba(147, 210, 232, 0.35)', marginBottom: 10, fontFamily: 'Avenir' },

  // ── Input rows ─────────────────────────────────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(1, 8, 18, 0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.13)',
    paddingRight: 12,
  },
  input: {
    flex: 1,
    color: 'rgba(224, 242, 254, 0.95)',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Avenir',
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
    backgroundColor: 'rgba(72, 202, 228, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.2)',
    alignItems: 'center',
  },
  thresholdButtonSelected: {
    backgroundColor: '#48cae4',
    borderColor: '#48cae4',
  },
  thresholdButtonText: { color: '#48cae4', fontSize: 13, fontWeight: '500', fontFamily: 'Avenir' },
  thresholdButtonTextSelected: { color: '#010c1a', fontWeight: '700' },

  // ── Save button ────────────────────────────────────────────────────────────
  saveButton: {
    backgroundColor: '#48cae4',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#48cae4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  saveButtonText: { color: '#010c1a', fontSize: 17, fontWeight: '700', fontFamily: 'Avenir' },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: { alignItems: 'center', marginTop: 24, marginBottom: 12 },
  footerText: { color: 'rgba(147, 210, 232, 0.35)', fontSize: 13, textAlign: 'center', fontFamily: 'Avenir' },
});
