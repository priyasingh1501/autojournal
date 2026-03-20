import React, { useState, useEffect } from 'react';
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
              placeholderTextColor="#6b7280"
              secureTextEntry={!showOpenAIKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowOpenAIKey(!showOpenAIKey)}
            >
              <Text>{showOpenAIKey ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Anthropic API Key (for Claude summaries)</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={settings.anthropicApiKey}
              onChangeText={(v) => setSettings(prev => ({ ...prev, anthropicApiKey: v }))}
              placeholder="sk-ant-..."
              placeholderTextColor="#6b7280"
              secureTextEntry={!showAnthropicKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowAnthropicKey(!showAnthropicKey)}
            >
              <Text>{showAnthropicKey ? '🙈' : '👁️'}</Text>
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
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  content: { padding: 20 },
  section: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d1d5db',
    marginTop: 14,
    marginBottom: 6,
  },
  hint: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    paddingRight: 12,
  },
  input: {
    flex: 1,
    color: '#e5e7eb',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  eyeButton: { padding: 4 },
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
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  thresholdButtonSelected: {
    backgroundColor: '#e94560',
    borderColor: '#e94560',
  },
  thresholdButtonText: { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  thresholdButtonTextSelected: { color: '#ffffff' },
  saveButton: {
    backgroundColor: '#e94560',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  footer: { alignItems: 'center', marginTop: 24, marginBottom: 12 },
  footerText: { color: '#6b7280', fontSize: 13, textAlign: 'center' },
});
