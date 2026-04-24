/**
 * OnboardingScreen — first-launch intro, shown before login/signup.
 *
 * 6 screens total: Welcome + 5 feature screens. Each has a video background
 * (looping, muted) and a single line of body copy. On the final step the
 * CTA completes onboarding and hands off to the auth flow.
 *
 * Videos are sourced from `assets/video/`. Until per-step videos are
 * produced, every step points at `ocean_home.mp4` — swap the `video`
 * field on each entry of ONBOARDING_STEPS to use a different clip.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Animated, StyleProp, ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SW } = Dimensions.get('window');

// ── Step data ────────────────────────────────────────────────────────────────
// To change which clip plays on which screen, swap the `require(...)` paths
// below — everything else (looping, mute, resize, overlay) is shared.

const WELCOME_VIDEO = require('../../assets/video/jellyfish video.mp4');

interface StepData {
  video: number;           // require()'d .mp4
  body: string;
}

const ONBOARDING_STEPS: StepData[] = [
  {
    video: require('../../assets/video/128421-741495470_medium.mp4'),
    body: "But first, let's capture the surface. Speak to the app about what's happening.",
  },
  {
    video: require('../../assets/video/137572-766938284_medium.mp4'),
    body: 'Look at your day distilled with the summary created for you at the end of each day.',
  },
  {
    video: require('../../assets/video/16185-269541580_medium.mp4'),
    body: 'Go deeper by talking to wise minds that help you get clarity with ancient wisdom of eastern philosophy.',
  },
  {
    video: require('../../assets/video/218364_medium.mp4'),
    body: 'Over time, see your patterns and know what you miss in plain sight.',
  },
  {
    video: require('../../assets/video/310227_medium.mp4'),
    body: 'Read wisdom bites and understand yourself better.',
  },
];

// ── Shared video background ─────────────────────────────────────────────────

function VideoBackdrop({ source }: { source: number }) {
  return (
    <>
      <Video
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        isLooping
        isMuted
        shouldPlay
        useNativeControls={false}
      />
      <LinearGradient
        colors={['rgba(2,6,14,0.25)', 'rgba(2,6,14,0.55)', 'rgba(2,6,14,0.95)']}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}

// ── Fade-in container used by every screen's content block ──────────────────

function FadeIn({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 900, delay: 200, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 800, delay: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[style, { opacity: fade, transform: [{ translateY: slide }] }]}>
      {children}
    </Animated.View>
  );
}

// ── Welcome step ────────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <View style={s.screen}>
      <VideoBackdrop source={WELCOME_VIDEO} />

      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.wordmarkWrap}>
          <Text style={s.wordmark}>untangle</Text>
        </View>

        <FadeIn style={s.welcomeBody}>
          <Text style={s.welcomeHook}>
            We are like deep oceans.{'\n'}
            We know there is so much to us than the surface.
          </Text>
          <Text style={s.welcomeLead}>
            Let's deep dive into the ocean you are.
          </Text>
        </FadeIn>

        <FadeIn style={s.ctaWrap}>
          <TouchableOpacity style={s.primaryBtn} onPress={onNext} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Begin</Text>
            <Feather name="arrow-right" size={16} color="rgba(224,242,254,0.95)" />
          </TouchableOpacity>
        </FadeIn>
      </SafeAreaView>
    </View>
  );
}

// ── Feature step (1–5) ──────────────────────────────────────────────────────

function StepFeature({
  step,
  index,
  total,
  isLast,
  onNext,
}: {
  step: StepData;
  index: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
}) {
  return (
    <View style={s.screen}>
      <VideoBackdrop source={step.video} />

      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.wordmarkWrap}>
          <Text style={s.wordmarkSmall}>untangle</Text>
        </View>

        <FadeIn style={s.featureBody} key={index /* re-trigger fade per step */}>
          <Text style={s.featureBody_text}>{step.body}</Text>
        </FadeIn>

        <View style={s.ctaWrap}>
          <View style={s.dots}>
            {Array.from({ length: total }).map((_, i) => (
              <View
                key={i}
                style={[s.dot, i === index && s.dotActive]}
              />
            ))}
          </View>

          <TouchableOpacity style={s.primaryBtn} onPress={onNext} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>{isLast ? 'Create your account' : 'Next'}</Text>
            <Feather name="arrow-right" size={16} color="rgba(224,242,254,0.95)" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

interface Props {
  /**
   * Called when the user finishes the last step. Implementations should
   * persist the "onboarded" flag (we do that here too as a safety net)
   * and route the user on to signup.
   */
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  // 0 = welcome; 1..5 = feature steps; length+1 total screens.
  const [index, setIndex] = useState(0);

  const handleFinish = async () => {
    try { await AsyncStorage.setItem('onboarding_complete', '1'); } catch {}
    onComplete();
  };

  if (index === 0) {
    return <StepWelcome onNext={() => setIndex(1)} />;
  }

  const stepIdx = index - 1;
  const isLast = stepIdx === ONBOARDING_STEPS.length - 1;

  return (
    <StepFeature
      step={ONBOARDING_STEPS[stepIdx]}
      index={stepIdx}
      total={ONBOARDING_STEPS.length}
      isLast={isLast}
      onNext={isLast ? handleFinish : () => setIndex(index + 1)}
    />
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#02060E' },

  safe: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 32,
  },

  wordmarkWrap: {
    alignItems: 'center',
  },
  wordmark: {
    fontSize: 22,
    letterSpacing: 2.5,
    color: 'rgba(224,242,254,0.88)',
    fontFamily: 'Baskerville',
  },
  wordmarkSmall: {
    fontSize: 14,
    letterSpacing: 2.0,
    color: 'rgba(224,242,254,0.55)',
    fontFamily: 'Baskerville',
  },

  // ── Welcome ────────────────────────────────────────────────────────────────
  welcomeBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
  },
  welcomeHook: {
    fontSize: 22,
    lineHeight: 32,
    color: 'rgba(224,242,254,0.92)',
    fontFamily: 'Baskerville',
    textAlign: 'center',
  },
  welcomeLead: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(152,212,250,0.80)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
  },

  // ── Feature ────────────────────────────────────────────────────────────────
  featureBody: {
    flex: 1,
    justifyContent: 'center',
  },
  featureBody_text: {
    fontSize: 20,
    lineHeight: 30,
    color: 'rgba(224,242,254,0.92)',
    fontFamily: 'Baskerville',
    textAlign: 'center',
  },

  // ── CTA block ──────────────────────────────────────────────────────────────
  ctaWrap: {
    alignItems: 'center',
    gap: 20,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(152,212,250,0.22)',
  },
  dotActive: {
    backgroundColor: 'rgba(224,242,254,0.85)',
    width: 18,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: 'rgba(9,41,173,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.35)',
    minWidth: SW * 0.6,
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    color: 'rgba(224,242,254,0.95)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.3,
  },
});
