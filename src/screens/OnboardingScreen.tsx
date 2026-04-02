import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ImageBackground, Dimensions, Platform,
  KeyboardAvoidingView, Linking, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from '../services/StorageService';
import { AppSettings } from '../types';

const { width: SW } = Dimensions.get('window');

// ── What untangle tracks ──────────────────────────────────────────────────────
const TRACKABLE = [
  { icon: 'sun',          label: 'Mood & emotions',     color: 'rgba(251,191,36,0.88)',   bg: 'rgba(251,191,36,0.08)'   },
  { icon: 'activity',     label: 'Movement & exercise',  color: 'rgba(110,231,183,0.88)',  bg: 'rgba(110,231,183,0.08)'  },
  { icon: 'coffee',       label: 'Meals & nutrition',    color: 'rgba(249,168,212,0.88)',  bg: 'rgba(249,168,212,0.08)'  },
  { icon: 'credit-card',  label: 'Spending',             color: 'rgba(147,197,253,0.88)',  bg: 'rgba(147,197,253,0.08)'  },
  { icon: 'moon',         label: 'Meditation & rest',    color: 'rgba(196,181,253,0.88)',  bg: 'rgba(196,181,253,0.08)'  },
  { icon: 'book-open',    label: 'Learnings',            color: 'rgba(253,186,116,0.88)',  bg: 'rgba(253,186,116,0.08)'  },
  { icon: 'repeat',       label: 'Recurring thoughts',   color: 'rgba(252,165,165,0.88)',  bg: 'rgba(252,165,165,0.08)'  },
  { icon: 'user',         label: 'Who you are',          color: 'rgba(224,242,254,0.80)',  bg: 'rgba(224,242,254,0.05)'  },
];

// ── DayPicker ─────────────────────────────────────────────────────────────────
function DayPicker({ value, onChange, max = 7 }: { value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <View style={dp.row}>
      {Array.from({ length: max }, (_, i) => i + 1).map(d => {
        const on = d <= value;
        return (
          <TouchableOpacity
            key={d}
            onPress={() => onChange(value === d ? 0 : d)}
            style={[dp.circle, on ? dp.on : dp.off]}
            activeOpacity={0.7}
          >
            <Text style={[dp.label, on ? dp.labelOn : dp.labelOff]}>{d}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const dp = StyleSheet.create({
  row:      { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  circle:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  on:       { backgroundColor: 'rgba(9,41,173,0.50)', borderColor: 'rgba(152,212,250,0.65)' },
  off:      { backgroundColor: 'rgba(152,212,250,0.04)', borderColor: 'rgba(152,212,250,0.16)' },
  label:    { fontSize: 13, fontFamily: 'GillSans-Light' },
  labelOn:  { color: 'rgba(224,242,254,0.95)' },
  labelOff: { color: 'rgba(152,212,250,0.35)' },
});

// ── Step 0: Welcome ───────────────────────────────────────────────────────────
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <ImageBackground
      source={require('../../assets/jellyfish.jpg')}
      style={s.welcomeBg}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(2,6,14,0.30)', 'rgba(2,6,14,0.72)', '#02060E']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={s.welcomeSafe} edges={['top', 'bottom']}>
        <View style={s.welcomeContent}>
          <View style={s.welcomeTop}>
            <Text style={s.wordmark}>untangle</Text>
            <Text style={s.tagline}>Your thoughts, organised.</Text>
          </View>
          <View style={s.welcomeBottom}>
            <TouchableOpacity style={s.primaryBtn} onPress={onNext} activeOpacity={0.85}>
              <Text style={s.primaryBtnText}>Get Started</Text>
              <Feather name="arrow-right" size={16} color="rgba(224,242,254,0.95)" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

// ── Step 1: What you can track ────────────────────────────────────────────────
function StepWhatYouCanTrack({ onNext }: { onNext: () => void }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.stepContainer}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.stepTitle}>What untangle tracks</Text>
      <Text style={s.stepSub}>
        Just speak or write naturally. Untangle listens and builds a picture of your life over time.
      </Text>

      {/* Trackable grid */}
      <View style={track.grid}>
        {TRACKABLE.map(t => (
          <View key={t.label} style={[track.chip, { backgroundColor: t.bg, borderColor: t.color.replace('0.88)', '0.20)') }]}>
            <Feather name={t.icon as any} size={14} color={t.color} />
            <Text style={[track.chipLabel, { color: t.color }]}>{t.label}</Text>
          </View>
        ))}
      </View>

      {/* Privacy badge */}
      <View style={priv.card}>
        <View style={priv.iconRow}>
          <View style={priv.lockWrap}>
            <Feather name="lock" size={16} color="rgba(110,231,183,0.90)" />
          </View>
          <Text style={priv.title}>Your data never leaves your phone</Text>
        </View>
        <Text style={priv.body}>
          Everything — your notes, summaries, and insights — is stored locally on this device.
          No account required. No cloud sync. No one else can see it.
        </Text>
        <View style={priv.pills}>
          {['No servers', 'No account', 'Local only'].map(p => (
            <View key={p} style={priv.pill}>
              <Text style={priv.pillText}>{p}</Text>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity style={[s.primaryBtn, { marginTop: 8 }]} onPress={onNext} activeOpacity={0.85}>
        <Text style={s.primaryBtnText}>Continue</Text>
        <Feather name="arrow-right" size={16} color="rgba(224,242,254,0.95)" />
      </TouchableOpacity>
    </ScrollView>
  );
}

const track = StyleSheet.create({
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24, marginBottom: 24 },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  chipLabel: { fontSize: 13, fontFamily: 'GillSans-Light', fontWeight: '500' },
});

const priv = StyleSheet.create({
  card:     { backgroundColor: 'rgba(110,231,183,0.06)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(110,231,183,0.18)', padding: 16, gap: 10, marginBottom: 24 },
  iconRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(110,231,183,0.10)', alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 15, fontFamily: 'Baskerville', color: 'rgba(224,242,254,0.92)', flex: 1 },
  body:     { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.70)', lineHeight: 20 },
  pills:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(110,231,183,0.10)', borderWidth: 1, borderColor: 'rgba(110,231,183,0.22)' },
  pillText: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(110,231,183,0.80)' },
});

// ── Step 2: API Keys ──────────────────────────────────────────────────────────
function StepApiKeys({
  anthropicKey, setAnthropicKey,
  openaiKey, setOpenaiKey,
  onNext,
}: {
  anthropicKey: string; setAnthropicKey: (v: string) => void;
  openaiKey: string; setOpenaiKey: (v: string) => void;
  onNext: () => void;
}) {
  const [showAnth, setShowAnth] = useState(false);
  const [showOAI, setShowOAI] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const canProceed = anthropicKey.trim().length > 0 && openaiKey.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.stepContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.stepTitle}>API Keys</Text>
        <Text style={s.stepSub}>
          Untangle uses Claude and Whisper to understand your journal. You'll need your own API keys.
        </Text>

        {/* Keys stay on device note */}
        <View style={s.keysSafeNote}>
          <Feather name="shield" size={12} color="rgba(110,231,183,0.80)" />
          <Text style={s.keysSafeText}>
            Keys are stored locally on your phone and never sent to any server other than Anthropic and OpenAI directly.
          </Text>
        </View>

        {/* Anthropic */}
        <Text style={s.keyLabel}>Anthropic API Key · Claude</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={anthropicKey}
            onChangeText={setAnthropicKey}
            placeholder="sk-ant-..."
            placeholderTextColor="rgba(152,212,250,0.28)"
            secureTextEntry={!showAnth}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={s.eyeBtn} onPress={() => setShowAnth(v => !v)}>
            <Feather name={showAnth ? 'eye-off' : 'eye'} size={15} color="rgba(152,212,250,0.55)" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => Linking.openURL('https://console.anthropic.com')}>
          <Text style={s.linkText}>Get key at console.anthropic.com →</Text>
        </TouchableOpacity>

        <View style={s.divider} />

        {/* OpenAI */}
        <Text style={s.keyLabel}>OpenAI API Key · Whisper transcription</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={openaiKey}
            onChangeText={setOpenaiKey}
            placeholder="sk-..."
            placeholderTextColor="rgba(152,212,250,0.28)"
            secureTextEntry={!showOAI}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={s.eyeBtn} onPress={() => setShowOAI(v => !v)}>
            <Feather name={showOAI ? 'eye-off' : 'eye'} size={15} color="rgba(152,212,250,0.55)" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => Linking.openURL('https://platform.openai.com/api-keys')}>
          <Text style={s.linkText}>Get key at platform.openai.com →</Text>
        </TouchableOpacity>

        {/* Why expandable */}
        <TouchableOpacity style={s.whyRow} onPress={() => setExpanded(v => !v)} activeOpacity={0.75}>
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color="rgba(152,212,250,0.45)" />
          <Text style={s.whyToggle}>Why do I need this?</Text>
        </TouchableOpacity>
        {expanded && (
          <View style={s.whyBox}>
            <Text style={s.whyText}>
              Untangle runs entirely on your device — there is no backend server. Your API keys
              connect directly to Anthropic (for Claude summaries and insights) and OpenAI
              (for Whisper voice transcription). Keys are stored locally and never shared.
              You only pay for what you use — typical daily usage costs a few paise.
            </Text>
          </View>
        )}

        <View style={s.divider} />

        <TouchableOpacity
          style={[s.primaryBtn, !canProceed && s.primaryBtnDisabled]}
          onPress={canProceed ? onNext : undefined}
          activeOpacity={canProceed ? 0.85 : 1}
        >
          <Text style={[s.primaryBtnText, !canProceed && { color: 'rgba(224,242,254,0.30)' }]}>
            Continue
          </Text>
          <Feather name="arrow-right" size={16} color={canProceed ? 'rgba(224,242,254,0.95)' : 'rgba(224,242,254,0.30)'} />
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Step 3: Mic Permission ────────────────────────────────────────────────────
function StepMicPermission({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [requesting, setRequesting] = useState(false);

  const handleAllow = async () => {
    setRequesting(true);
    try {
      await Audio.requestPermissionsAsync();
    } catch {}
    setRequesting(false);
    onNext();
  };

  return (
    <View style={[s.stepContainer, s.centered]}>
      <View style={s.bigIconWrap}>
        <Feather name="mic" size={48} color="rgba(152,212,250,0.90)" />
      </View>
      <Text style={s.stepTitle}>Allow microphone</Text>
      <Text style={[s.stepSub, { textAlign: 'center' }]}>
        Untangle needs your microphone to record voice notes. Audio is transcribed locally and
        never uploaded anywhere beyond your chosen AI providers.
      </Text>

      <TouchableOpacity style={[s.primaryBtn, { marginTop: 32 }]} onPress={handleAllow} activeOpacity={0.85} disabled={requesting}>
        {requesting
          ? <ActivityIndicator color="rgba(224,242,254,0.95)" size="small" />
          : <>
              <Feather name="mic" size={16} color="rgba(224,242,254,0.95)" />
              <Text style={s.primaryBtnText}>Allow Microphone</Text>
            </>
        }
      </TouchableOpacity>

      <TouchableOpacity style={s.skipBtn} onPress={onSkip}>
        <Text style={s.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Step 4: Goals ─────────────────────────────────────────────────────────────
function StepGoals({
  strengthDays, setStrengthDays,
  calorieTarget, setCalorieTarget,
  spendBudget, setSpendBudget,
  onNext, onSkip,
}: {
  strengthDays: number; setStrengthDays: (v: number) => void;
  calorieTarget: string; setCalorieTarget: (v: string) => void;
  spendBudget: string; setSpendBudget: (v: string) => void;
  onNext: () => void; onSkip: () => void;
}) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.stepContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.stepTitle}>Set your goals</Text>
        <Text style={s.stepSub}>
          Optional — helps untangle give you personalised insights. You can update these any time.
        </Text>

        {/* Strength */}
        <View style={s.goalBlock}>
          <Text style={s.goalLabel}>Strength sessions / week</Text>
          <DayPicker value={strengthDays} onChange={setStrengthDays} />
        </View>

        {/* Calories */}
        <View style={s.goalBlock}>
          <Text style={s.goalLabel}>Daily calorie target</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={calorieTarget}
              onChangeText={setCalorieTarget}
              placeholder="e.g. 1600"
              placeholderTextColor="rgba(152,212,250,0.28)"
              keyboardType="numeric"
              returnKeyType="done"
            />
            <Text style={s.unit}>kcal</Text>
          </View>
        </View>

        {/* Spend */}
        <View style={s.goalBlock}>
          <Text style={s.goalLabel}>Monthly spend budget</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={spendBudget}
              onChangeText={setSpendBudget}
              placeholder="e.g. 15000"
              placeholderTextColor="rgba(152,212,250,0.28)"
              keyboardType="numeric"
              returnKeyType="done"
            />
            <Text style={s.unit}>₹</Text>
          </View>
        </View>

        <TouchableOpacity style={[s.primaryBtn, { marginTop: 24 }]} onPress={onNext} activeOpacity={0.85}>
          <Text style={s.primaryBtnText}>Continue</Text>
          <Feather name="arrow-right" size={16} color="rgba(224,242,254,0.95)" />
        </TouchableOpacity>

        <TouchableOpacity style={s.skipBtn} onPress={onSkip}>
          <Text style={s.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Step 5: All set ───────────────────────────────────────────────────────────
function StepAllSet({ onFinish, finishing }: { onFinish: () => void; finishing: boolean }) {
  return (
    <View style={[s.stepContainer, s.centered]}>
      <View style={[s.bigIconWrap, { backgroundColor: 'rgba(110,231,183,0.10)', borderColor: 'rgba(110,231,183,0.25)' }]}>
        <Feather name="check" size={48} color="rgba(110,231,183,0.90)" />
      </View>
      <Text style={s.stepTitle}>You're all set</Text>
      <Text style={[s.stepSub, { textAlign: 'center' }]}>
        Tap the mic to start recording. Untangle will transcribe, summarise, and find patterns in your day.
      </Text>

      <View style={s.featureList}>
        {[
          { icon: 'mic',         label: 'Record voice notes anytime' },
          { icon: 'star',        label: 'Daily summary auto-generates at midnight' },
          { icon: 'trending-up', label: 'Monthly insights update as you journal' },
          { icon: 'phone',       label: 'Call or chat to reflect on your day' },
          { icon: 'lock',        label: 'All data stored privately on your phone' },
        ].map(f => (
          <View key={f.icon} style={s.featureListRow}>
            <Feather name={f.icon as any} size={14} color="rgba(152,212,250,0.65)" />
            <Text style={s.featureListLabel}>{f.label}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[s.primaryBtn, { marginTop: 32 }, finishing && { opacity: 0.6 }]}
        onPress={finishing ? undefined : onFinish}
        activeOpacity={0.85}
      >
        {finishing
          ? <ActivityIndicator color="rgba(224,242,254,0.95)" size="small" />
          : <>
              <Text style={s.primaryBtnText}>Start journaling</Text>
              <Feather name="arrow-right" size={16} color="rgba(224,242,254,0.95)" />
            </>
        }
      </TouchableOpacity>
    </View>
  );
}

// ── Main OnboardingScreen ─────────────────────────────────────────────────────
interface Props { onComplete: () => void; }

const STEPS = 6;

export default function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep]                   = useState(0);
  const [anthropicKey, setAnthropicKey]   = useState('');
  const [openaiKey, setOpenaiKey]         = useState('');
  const [strengthDays, setStrengthDays]   = useState(0);
  const [calorieTarget, setCalorieTarget] = useState('');
  const [spendBudget, setSpendBudget]     = useState('');
  const [finishing, setFinishing]         = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const goTo = (n: number) => {
    setStep(n);
    scrollRef.current?.scrollTo({ x: SW * n, animated: true });
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      // Save API keys
      const existing = await StorageService.getSettings();
      const settings: AppSettings = {
        openaiApiKey:    openaiKey.trim(),
        anthropicApiKey: anthropicKey.trim(),
        vadThreshold:    existing?.vadThreshold    ?? -35,
        silenceDuration: existing?.silenceDuration ?? 2000,
        summaryTime:     existing?.summaryTime     ?? '21:00',
        batchSize:       existing?.batchSize       ?? 0,
        ...(existing?.elevenLabsApiKey   ? { elevenLabsApiKey:   existing.elevenLabsApiKey   } : {}),
        ...(existing?.elevenLabsVoiceId  ? { elevenLabsVoiceId:  existing.elevenLabsVoiceId  } : {}),
        ...(existing?.ttsVoiceId         ? { ttsVoiceId:         existing.ttsVoiceId         } : {}),
      };
      await StorageService.saveSettings(settings);

      // Save goals if any set
      const cal = parseFloat(calorieTarget);
      const bud = parseFloat(spendBudget.replace(/,/g, ''));
      const hasGoals = strengthDays > 0 || (!isNaN(cal) && cal > 0) || (!isNaN(bud) && bud > 0);
      if (hasGoals) {
        const goals: any = {};
        if (strengthDays > 0)           goals.strengthDaysPerWeek = strengthDays;
        if (!isNaN(cal) && cal > 0)     goals.dailyCalorieTarget  = cal;
        if (!isNaN(bud) && bud > 0)     goals.monthlySpendBudget  = bud;
        await StorageService.saveGoals(goals);
      }

      // Mark onboarding complete
      await AsyncStorage.setItem('onboarding_complete', '1');
      onComplete();
    } catch {
      setFinishing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#02060E' }}>
      {/* Progress dots (hidden on welcome) */}
      {step > 0 && (
        <SafeAreaView edges={['top']} style={s.progressBar}>
          {Array.from({ length: STEPS - 1 }).map((_, i) => (
            <View
              key={i}
              style={[
                s.progressDot,
                i < step - 1
                  ? s.progressDotDone
                  : i === step - 1
                    ? s.progressDotActive
                    : s.progressDotOff,
              ]}
            />
          ))}
        </SafeAreaView>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {/* Step 0 — Welcome */}
        <View style={{ width: SW, flex: 1 }}>
          <StepWelcome onNext={() => goTo(1)} />
        </View>

        {/* Step 1 — What you can track + Privacy */}
        <View style={{ width: SW }}>
          <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
            <StepWhatYouCanTrack onNext={() => goTo(2)} />
          </SafeAreaView>
        </View>

        {/* Step 2 — API Keys */}
        <View style={{ width: SW }}>
          <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
            <StepApiKeys
              anthropicKey={anthropicKey} setAnthropicKey={setAnthropicKey}
              openaiKey={openaiKey} setOpenaiKey={setOpenaiKey}
              onNext={() => goTo(3)}
            />
          </SafeAreaView>
        </View>

        {/* Step 3 — Mic Permission */}
        <View style={{ width: SW }}>
          <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
            <StepMicPermission onNext={() => goTo(4)} onSkip={() => goTo(4)} />
          </SafeAreaView>
        </View>

        {/* Step 4 — Goals */}
        <View style={{ width: SW }}>
          <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
            <StepGoals
              strengthDays={strengthDays} setStrengthDays={setStrengthDays}
              calorieTarget={calorieTarget} setCalorieTarget={setCalorieTarget}
              spendBudget={spendBudget} setSpendBudget={setSpendBudget}
              onNext={() => goTo(5)} onSkip={() => goTo(5)}
            />
          </SafeAreaView>
        </View>

        {/* Step 5 — All set */}
        <View style={{ width: SW }}>
          <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
            <StepAllSet onFinish={handleFinish} finishing={finishing} />
          </SafeAreaView>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Welcome
  welcomeBg:      { flex: 1, width: SW },
  welcomeSafe:    { flex: 1 },
  welcomeContent: { flex: 1, paddingHorizontal: 32, justifyContent: 'space-between' },
  welcomeTop:     { flex: 1, justifyContent: 'center', alignItems: 'flex-start' },
  welcomeBottom:  { paddingBottom: 48 },
  wordmark:       { fontSize: 56, fontFamily: 'Baskerville', fontStyle: 'italic', color: 'rgba(224,242,254,0.95)', letterSpacing: -1 },
  tagline:        { fontSize: 18, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.75)', marginTop: 10 },

  // Steps
  stepContainer:  { padding: 28, paddingBottom: 40 },
  stepTitle:      { fontSize: 28, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.95)', marginBottom: 8 },
  stepSub:        { fontSize: 14, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.65)', lineHeight: 21, marginBottom: 8 },
  centered:       { justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: '100%' },

  // API keys safety note
  keysSafeNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginTop: 12, marginBottom: 4,
    backgroundColor: 'rgba(110,231,183,0.06)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(110,231,183,0.16)',
    padding: 10,
  },
  keysSafeText: { flex: 1, fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(110,231,183,0.75)', lineHeight: 18 },

  // Inputs
  keyLabel:  { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  inputRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(1,8,18,0.80)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.14)', paddingRight: 12 },
  input:     { flex: 1, color: 'rgba(224,242,254,0.95)', fontSize: 14, paddingHorizontal: 14, paddingVertical: 13, fontFamily: 'GillSans-Light' },
  eyeBtn:    { padding: 4 },
  unit:      { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)', paddingRight: 4 },
  linkText:  { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', marginTop: 7, textDecorationLine: 'underline' },
  divider:   { height: 1, backgroundColor: 'rgba(152,212,250,0.08)', marginVertical: 20 },
  whyRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  whyToggle: { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)' },
  whyBox:    { marginTop: 10, backgroundColor: 'rgba(9,41,173,0.10)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)', padding: 14 },
  whyText:   { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.65)', lineHeight: 19 },

  // Mic / all set icon
  bigIconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(152,212,250,0.08)', borderWidth: 1, borderColor: 'rgba(152,212,250,0.20)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },

  // Goals
  goalBlock: { marginTop: 20, gap: 8 },
  goalLabel: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', letterSpacing: 0.5, textTransform: 'uppercase' },

  // All set feature list
  featureList:      { gap: 12, marginTop: 24, alignSelf: 'stretch' },
  featureListRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureListLabel: { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.70)' },

  // Buttons
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0929AD', borderRadius: 16, paddingVertical: 15,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.25)', alignSelf: 'stretch',
  },
  primaryBtnDisabled: { backgroundColor: 'rgba(9,41,173,0.18)', borderColor: 'rgba(152,212,250,0.08)' },
  primaryBtnText: { fontSize: 16, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.95)', fontWeight: '500' },
  skipBtn:  { alignItems: 'center', paddingVertical: 14 },
  skipText: { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)' },

  // Progress bar
  progressBar:       { flexDirection: 'row', gap: 4, paddingHorizontal: 28, paddingTop: 14, paddingBottom: 4 },
  progressDot:       { flex: 1, height: 3, borderRadius: 2 },
  progressDotOff:    { backgroundColor: 'rgba(152,212,250,0.10)' },
  progressDotActive: { backgroundColor: 'rgba(152,212,250,0.55)' },
  progressDotDone:   { backgroundColor: 'rgba(152,212,250,0.90)' },
});
