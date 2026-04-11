import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ImageBackground, Dimensions, ActivityIndicator, Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SW } = Dimensions.get('window');

// ── Step 0: Welcome ───────────────────────────────────────────────────────────
function StepWelcome({ onNext }: { onNext: () => void }) {
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 1100, delay: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 900,  delay: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <ImageBackground
      source={require('../../assets/ocean.avif')}
      style={s.welcomeBg}
      resizeMode="cover"
    >
      {/* Deep gradient overlay */}
      <LinearGradient
        colors={['rgba(0,10,30,0.25)', 'rgba(0,10,30,0.45)', 'rgba(2,6,14,0.88)']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={s.welcomeSafe} edges={['top', 'bottom']}>
        <View style={s.welcomeContent}>

          {/* Top wordmark */}
          <Animated.View style={[s.welcomeTop, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={s.wordmark}>untangle</Text>
          </Animated.View>

          {/* Glassmorphic centre card */}
          <Animated.View style={[s.glassWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={s.glassInner}>
              {/* Decorative wave lines */}
              <View style={s.waveRow}>
                {[0.15, 0.30, 0.22, 0.35, 0.18].map((o, i) => (
                  <View key={i} style={[s.waveLine, { opacity: o }]} />
                ))}
              </View>
              <Text style={s.glassHeadline}>
                Let's deep dive into{'\n'}the deep ocean{'\n'}within you.
              </Text>
              <Text style={s.glassSub}>
                Your thoughts, your patterns, your growth — all in one quiet place.
              </Text>
            </View>
          </Animated.View>

          {/* Bottom CTA */}
          <Animated.View style={[s.welcomeBottom, { opacity: fadeAnim }]}>
            <TouchableOpacity style={s.primaryBtn} onPress={onNext} activeOpacity={0.85}>
              <Text style={s.primaryBtnText}>Begin your journey</Text>
              <Feather name="arrow-right" size={16} color="rgba(224,242,254,0.95)" />
            </TouchableOpacity>
            <Text style={s.welcomeHint}>takes about 2 minutes</Text>
          </Animated.View>

        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

// ── Onboarding slide data ─────────────────────────────────────────────────────
const ONBOARDING_SLIDES = [
  {
    id: 'journal',
    icon: 'mic',
    iconColor: 'rgba(152,212,250,0.90)',
    iconBg: 'rgba(152,212,250,0.08)',
    accent: 'rgba(152,212,250,0.65)',
    title: 'Microjournal your day',
    subtitle: 'Speak or type. Untangle does the rest.',
    description:
      'Capture fleeting thoughts in seconds — while commuting, mid-workout, or winding down. No blank pages. No pressure. Just your voice.',
    features: [
      { icon: 'mic',       text: 'Voice notes transcribed instantly' },
      { icon: 'edit-2',    text: 'Quick text captures too' },
      { icon: 'zap',       text: 'No login, no setup — just tap and speak' },
    ],
  },
  {
    id: 'summaries',
    icon: 'sun',
    iconColor: 'rgba(251,191,36,0.90)',
    iconBg: 'rgba(251,191,36,0.08)',
    accent: 'rgba(251,191,36,0.65)',
    title: 'Your day, distilled',
    subtitle: 'AI weaves your moments into a story.',
    description:
      'Every evening, Untangle reads your notes and writes a thoughtful summary — your mood, highlights, what you ate, how you moved, what you spent.',
    features: [
      { icon: 'bar-chart-2', text: 'Mood & emotion arc across the day' },
      { icon: 'shopping-bag', text: 'Spending patterns spotted automatically' },
      { icon: 'activity',    text: 'Workout & meditation logged from your words' },
      { icon: 'coffee',      text: 'Meals & nutrition pieced together' },
    ],
  },
  {
    id: 'insights',
    icon: 'compass',
    iconColor: 'rgba(196,181,253,0.90)',
    iconBg: 'rgba(196,181,253,0.08)',
    accent: 'rgba(196,181,253,0.65)',
    title: 'Personality insights',
    subtitle: 'See the person behind the days.',
    description:
      'Month by month, Untangle maps your values, energy rhythms, recurring beliefs, and emotional patterns — helping you understand yourself at a deeper level.',
    features: [
      { icon: 'star',        text: 'Values constellation built from your words' },
      { icon: 'trending-up', text: 'Emotional trends and growth arcs' },
      { icon: 'repeat',      text: 'Recurring thoughts surfaced and named' },
      { icon: 'user',        text: 'Your evolving self-portrait' },
    ],
  },
  {
    id: 'wisdom',
    icon: 'film',
    iconColor: 'rgba(110,231,183,0.90)',
    iconBg: 'rgba(110,231,183,0.08)',
    accent: 'rgba(110,231,183,0.65)',
    title: 'Grow wiser with Shorts',
    subtitle: 'Bite-sized wisdom, curated for you.',
    description:
      'Untangle surfaces short reflections and ideas drawn from philosophy, psychology, and lived experience — personalised to where you are in your journey.',
    features: [
      { icon: 'play-circle', text: 'Story-format wisdom cards' },
      { icon: 'bookmark',    text: 'Save what resonates with you' },
      { icon: 'rotate-cw',   text: 'Fresh perspectives every day' },
    ],
  },
];

// ── Step 1–4: Feature slides ──────────────────────────────────────────────────
function StepFeature({ slide, onNext, isLast }: {
  slide: typeof ONBOARDING_SLIDES[0];
  onNext: () => void;
  isLast: boolean;
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.stepContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Icon */}
      <View style={[feat.iconCircle, { backgroundColor: slide.iconBg, borderColor: slide.accent.replace('0.65)', '0.22)') }]}>
        <Feather name={slide.icon as any} size={32} color={slide.iconColor} />
      </View>

      <Text style={s.stepTitle}>{slide.title}</Text>
      <Text style={[s.stepSub, { color: slide.accent }]}>{slide.subtitle}</Text>
      <Text style={feat.description}>{slide.description}</Text>

      {/* Feature list */}
      <View style={feat.list}>
        {slide.features.map(f => (
          <View key={f.icon} style={feat.row}>
            <View style={[feat.dot, { backgroundColor: slide.iconBg, borderColor: slide.accent.replace('0.65)', '0.20)') }]}>
              <Feather name={f.icon as any} size={13} color={slide.iconColor} />
            </View>
            <Text style={feat.rowText}>{f.text}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={[s.primaryBtn, { marginTop: 32 }]} onPress={onNext} activeOpacity={0.85}>
        <Text style={s.primaryBtnText}>{isLast ? 'Get set up' : 'Next'}</Text>
        <Feather name="arrow-right" size={16} color="rgba(224,242,254,0.95)" />
      </TouchableOpacity>
    </ScrollView>
  );
}

const feat = StyleSheet.create({
  iconCircle:  { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 24 },
  description: { fontSize: 14, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', lineHeight: 22, marginTop: 8, marginBottom: 20 },
  list:        { gap: 12 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot:         { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  rowText:     { flex: 1, fontSize: 14, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.80)', lineHeight: 20 },
});

// ── Step 5: Mic Permission ────────────────────────────────────────────────────
function StepMicPermission({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [requesting, setRequesting] = useState(false);

  const handleAllow = async () => {
    setRequesting(true);
    try { await Audio.requestPermissionsAsync(); } catch {}
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

// ── Step 6: All set ───────────────────────────────────────────────────────────
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
          { icon: 'film',        label: 'Wisdom shorts personalised to you' },
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

// Steps: 0=Welcome, 1-4=Feature slides, 5=Mic, 6=All Set
const TOTAL_STEPS = 7;

export default function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep]       = useState(0);
  const [finishing, setFinishing] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const goTo = (n: number) => {
    setStep(n);
    scrollRef.current?.scrollTo({ x: SW * n, animated: true });
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      await AsyncStorage.setItem('onboarding_complete', '1');
      onComplete();
    } catch {
      setFinishing(false);
    }
  };

  // Progress dots shown for steps 1–6 (not welcome)
  const progressSteps = TOTAL_STEPS - 1; // 6 dots
  const progressIndex = step - 1;        // 0-based within those 6

  return (
    <View style={{ flex: 1, backgroundColor: '#02060E' }}>
      {step > 0 && (
        <SafeAreaView edges={['top']} style={s.progressBar}>
          {Array.from({ length: progressSteps }).map((_, i) => (
            <View
              key={i}
              style={[
                s.progressDot,
                i < progressIndex
                  ? s.progressDotDone
                  : i === progressIndex
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

        {/* Steps 1–4 — Feature slides */}
        {ONBOARDING_SLIDES.map((slide, idx) => (
          <View key={slide.id} style={{ width: SW }}>
            <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
              <StepFeature
                slide={slide}
                onNext={() => goTo(idx + 2)}
                isLast={idx === ONBOARDING_SLIDES.length - 1}
              />
            </SafeAreaView>
          </View>
        ))}

        {/* Step 5 — Mic Permission */}
        <View style={{ width: SW }}>
          <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
            <StepMicPermission onNext={() => goTo(6)} onSkip={() => goTo(6)} />
          </SafeAreaView>
        </View>

        {/* Step 6 — All set */}
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
  welcomeContent: { flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingTop: 20 },
  welcomeTop:     { paddingTop: 8 },
  welcomeBottom:  { paddingBottom: 52, gap: 12 },
  welcomeHint:    { textAlign: 'center', fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.35)' },
  wordmark:       { fontSize: 42, fontFamily: 'Baskerville', fontStyle: 'italic', color: 'rgba(224,242,254,0.88)', letterSpacing: -0.5 },

  // Glassmorphic card
  glassWrap: {
    flex: 1,
    marginVertical: 24,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.18)',
    backgroundColor: 'rgba(2,6,14,0.35)',
    justifyContent: 'center',
  },
  glassInner: {
    padding: 28,
    gap: 14,
  },
  waveRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 8,
  },
  waveLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(152,212,250,0.70)',
  },
  glassHeadline: {
    fontSize: 30,
    fontFamily: 'Baskerville',
    fontStyle: 'italic',
    color: 'rgba(224,242,254,0.96)',
    lineHeight: 40,
    letterSpacing: -0.3,
  },
  glassSub: {
    fontSize: 14,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.60)',
    lineHeight: 21,
  },

  // Steps
  stepContainer:  { padding: 28, paddingBottom: 40 },
  stepTitle:      { fontSize: 28, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.95)', marginBottom: 6 },
  stepSub:        { fontSize: 14, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.65)', lineHeight: 21, marginBottom: 4 },
  centered:       { justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: '100%' },

  // Mic / all set icon
  bigIconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(152,212,250,0.08)', borderWidth: 1, borderColor: 'rgba(152,212,250,0.20)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },

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
