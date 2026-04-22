import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';

export type MicState = 'idle' | 'recording' | 'processing';

interface Props {
  state: MicState;
  audioLevel?: number;
  onPress: () => void;
  onCompose?: () => void;
  idleLabel?: string;
  recordingElapsed?: number;
}

const MAX_RECORDING_S = 25 * 60;

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const ORB = 64;
const INNER = 86;
const OUTER = 106;
const HIT = { top: 20, bottom: 20, left: 20, right: 20 };

// Max waveform heights per bar position (symmetric, tallest near orb)
const MAX_H = [7, 13, 20, 16, 24, 24, 16, 20, 13, 7];

export default function MicOrb({ state, audioLevel, onPress, onCompose, idleLabel, recordingElapsed }: Props) {
  const outerScale   = useRef(new Animated.Value(1)).current;
  const outerOpacity = useRef(new Animated.Value(0.25)).current;
  const innerScale   = useRef(new Animated.Value(1)).current;
  const innerOpacity = useRef(new Animated.Value(0.15)).current;

  const redDotOpacity = useRef(new Animated.Value(0)).current;
  const micOpacity    = useRef(new Animated.Value(1)).current;
  const barsOpacity   = useRef(new Animated.Value(0)).current;
  const dotsOpacity   = useRef(new Animated.Value(0)).current;

  const barHeights = useRef(
    Array.from({ length: 10 }, () => new Animated.Value(4)),
  ).current;

  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  const ringAnim    = useRef<Animated.CompositeAnimation | null>(null);
  const barAnims    = useRef<Animated.CompositeAnimation[]>([]);
  const barTimers   = useRef<ReturnType<typeof setTimeout>[]>([]);
  const extraAnims  = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    // Stop everything
    ringAnim.current?.stop();
    barAnims.current.forEach(a => a.stop());
    barTimers.current.forEach(t => clearTimeout(t));
    extraAnims.current.forEach(a => a.stop());
    barAnims.current = [];
    barTimers.current = [];
    extraAnims.current = [];
    barHeights.forEach(h => h.setValue(4));

    const dur250 = (v: Animated.Value, to: number) =>
      Animated.timing(v, { toValue: to, duration: 250, useNativeDriver: true });

    if (state === 'idle') {
      dur250(redDotOpacity, 0).start();
      dur250(micOpacity, 1).start();
      Animated.timing(barsOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      Animated.timing(dotsOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();

      const d = 2000;
      const a = Animated.loop(Animated.sequence([
        Animated.parallel([
          Animated.timing(outerScale,   { toValue: 1.15, duration: d, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(outerOpacity, { toValue: 0.07, duration: d, useNativeDriver: true }),
          Animated.timing(innerScale,   { toValue: 1.0,  duration: d, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(innerOpacity, { toValue: 0.15, duration: d, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(outerScale,   { toValue: 1.0,  duration: d, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(outerOpacity, { toValue: 0.25, duration: d, useNativeDriver: true }),
          Animated.timing(innerScale,   { toValue: 1.12, duration: d, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(innerOpacity, { toValue: 0.06, duration: d, useNativeDriver: true }),
        ]),
      ]));
      a.start();
      ringAnim.current = a;

    } else if (state === 'recording') {
      dur250(micOpacity, 1).start();
      Animated.timing(barsOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      Animated.timing(dotsOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();

      // Faster rings
      const d = 900;
      const a = Animated.loop(Animated.sequence([
        Animated.parallel([
          Animated.timing(outerScale,   { toValue: 1.12, duration: d, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(outerOpacity, { toValue: 0.45, duration: d, useNativeDriver: true }),
          Animated.timing(innerScale,   { toValue: 1.0,  duration: d, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(innerOpacity, { toValue: 0.30, duration: d, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(outerScale,   { toValue: 1.0,  duration: d, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(outerOpacity, { toValue: 0.25, duration: d, useNativeDriver: true }),
          Animated.timing(innerScale,   { toValue: 1.12, duration: d, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(innerOpacity, { toValue: 0.45, duration: d, useNativeDriver: true }),
        ]),
      ]));
      a.start();
      ringAnim.current = a;

      // Red dot pulse
      const dotPulse = Animated.loop(Animated.sequence([
        Animated.timing(redDotOpacity, { toValue: 0.35, duration: 600, useNativeDriver: true }),
        Animated.timing(redDotOpacity, { toValue: 1,    duration: 600, useNativeDriver: true }),
      ]));
      dotPulse.start();
      extraAnims.current.push(dotPulse);

      // Waveform bars — staggered start
      barHeights.forEach((bar, i) => {
        const level = audioLevel !== undefined && audioLevel > 0
          ? audioLevel
          : 1;
        const maxH = Math.max(4, level * MAX_H[i]);
        const dur  = 320 + i * 35;
        const anim = Animated.loop(Animated.sequence([
          Animated.timing(bar, { toValue: maxH, duration: dur, useNativeDriver: false }),
          Animated.timing(bar, { toValue: 4,    duration: dur, useNativeDriver: false }),
        ]));
        const tid = setTimeout(() => anim.start(), i * 70);
        barTimers.current.push(tid);
        barAnims.current.push(anim);
      });

    } else { // processing
      dur250(micOpacity, 0).start();
      dur250(redDotOpacity, 0).start();
      Animated.timing(barsOpacity,  { toValue: 0, duration: 200, useNativeDriver: true }).start();
      Animated.timing(dotsOpacity,  { toValue: 1, duration: 250, useNativeDriver: true }).start();

      // Slow rings
      const d = 2200;
      const a = Animated.loop(Animated.sequence([
        Animated.parallel([
          Animated.timing(outerScale,   { toValue: 1.08, duration: d, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(outerOpacity, { toValue: 0.10, duration: d, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(outerScale,   { toValue: 1.0,  duration: d, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(outerOpacity, { toValue: 0.22, duration: d, useNativeDriver: true }),
        ]),
      ]));
      a.start();
      ringAnim.current = a;

      // 3-dot sequential pulse
      [dot1, dot2, dot3].forEach((d, i) => {
        const da = Animated.loop(Animated.sequence([
          Animated.delay(i * 220),
          Animated.timing(d, { toValue: 1.0,  duration: 320, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.25, duration: 320, useNativeDriver: true }),
          Animated.delay((2 - i) * 220), // keep cycle length consistent
        ]));
        da.start();
        extraAnims.current.push(da);
      });
    }

    return () => {
      ringAnim.current?.stop();
      barAnims.current.forEach(a => a.stop());
      barTimers.current.forEach(t => clearTimeout(t));
      extraAnims.current.forEach(a => a.stop());
    };
    // audioLevel intentionally excluded — bar heights recalculate on state change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const nearLimit = state === 'recording' && (recordingElapsed ?? 0) >= MAX_RECORDING_S - 60;
  const label =
    state === 'processing' ? 'thinking...'
    : (idleLabel ?? 'tap to speak');

  const OrbCore = (
    <>
      {/* Mic icon */}
      <Animated.View style={[StyleSheet.absoluteFill, s.center, { opacity: micOpacity }]}>
        <Feather name="mic" size={24} color="rgba(255,255,255,0.92)" />
      </Animated.View>
      {/* Processing dots */}
      <Animated.View style={[StyleSheet.absoluteFill, s.center, { opacity: dotsOpacity }]}>
        <View style={s.dotsRow}>
          <Animated.View style={[s.dot, { opacity: dot1 }]} />
          <Animated.View style={[s.dot, { opacity: dot2 }]} />
          <Animated.View style={[s.dot, { opacity: dot3 }]} />
        </View>
      </Animated.View>
    </>
  );

  const showCompose = state === 'idle' && !!onCompose;

  return (
    <View style={s.container}>
      <View style={s.row}>
        {/* Left waveform bars — innermost (index 4) closest to orb */}
        <Animated.View style={[s.barSide, { opacity: barsOpacity }]}>
          {barHeights.slice(0, 5).reverse().map((h, i) => (
            <Animated.View key={i} style={[s.bar, { height: h }]} />
          ))}
        </Animated.View>

        {/* Orb section — narrower layout box when compose is shown so the
            mic orb and edit button sit symmetrically around the card center.
            Rings render at full size via absoluteFill regardless of box width. */}
        <View style={[s.orbSection, showCompose && s.orbSectionCompact]}>
          {/* Rings — absoluteFill centered */}
          <View style={[StyleSheet.absoluteFill, s.center]} pointerEvents="none">
            <Animated.View style={[s.outerRing, { transform: [{ scale: outerScale }], opacity: outerOpacity }]} />
          </View>
          <View style={[StyleSheet.absoluteFill, s.center]} pointerEvents="none">
            <Animated.View style={[s.innerRing, { transform: [{ scale: innerScale }], opacity: innerOpacity }]} />
          </View>

          {/* Core orb + red dot */}
          <View>
            <TouchableOpacity
              onPress={onPress}
              activeOpacity={0.82}
              hitSlop={HIT}
            >
              {Platform.OS === 'ios' ? (
                <BlurView intensity={25} tint="dark" style={s.orb}>
                  <View style={[StyleSheet.absoluteFill, s.orbBorderOverlay]} />
                  {OrbCore}
                </BlurView>
              ) : (
                <View style={[s.orb, s.orbAndroid]}>
                  {OrbCore}
                </View>
              )}
            </TouchableOpacity>
            <Animated.View style={[s.redDot, { opacity: redDotOpacity }]} />
          </View>
        </View>

        {/* Compose button — mirrors orb appearance */}
        {showCompose && (
          <TouchableOpacity onPress={onCompose} activeOpacity={0.82} hitSlop={HIT}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={25} tint="dark" style={s.composeLink}>
                <View style={[StyleSheet.absoluteFill, s.orbBorderOverlay]} />
                <Feather name="edit-2" size={22} color="rgba(255,255,255,0.92)" />
              </BlurView>
            ) : (
              <View style={[s.composeLink, s.composeLinkAndroid]}>
                <Feather name="edit-2" size={22} color="rgba(255,255,255,0.92)" />
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Right waveform bars — innermost (index 5) closest to orb */}
        <Animated.View style={[s.barSide, { opacity: barsOpacity }]}>
          {barHeights.slice(5).map((h, i) => (
            <Animated.View key={i} style={[s.bar, { height: h }]} />
          ))}
        </Animated.View>
      </View>

      <View style={s.labelBg}>
        {state === 'recording' ? (
          <Text style={[s.label, nearLimit && s.labelWarn]}>
            {nearLimit ? 'stopping soon · ' : 'listening... · '}
            {formatElapsed(recordingElapsed ?? 0)}
            {' / 25:00'}
          </Text>
        ) : (
          <Text style={s.label}>{label}</Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { alignItems: 'center' },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  center:    { alignItems: 'center', justifyContent: 'center' },

  orbSection: {
    width:  OUTER + 10,
    height: OUTER + 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbSectionCompact: {
    width: ORB,
  },

  outerRing: {
    width: OUTER, height: OUTER, borderRadius: OUTER / 2,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  innerRing: {
    width: INNER, height: INNER, borderRadius: INNER / 2,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)',
  },

  orb: {
    width: ORB, height: ORB, borderRadius: ORB / 2,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  orbBorderOverlay: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.40)',
    borderRadius: ORB / 2,
  },
  orbAndroid: {
    backgroundColor: 'rgba(15,25,50,0.78)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },

  redDot: {
    position: 'absolute', top: -2, right: -2,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#ef4444',
  },

  barSide: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bar:     { width: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.55)' },

  dotsRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot:     { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.90)' },

  composeLink: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeLinkAndroid: {
    backgroundColor: 'rgba(15,25,50,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },

  labelBg: {
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
    width: '100%',
  },
  label: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
    lineHeight: 20,
  },
  labelWarn: {
    color: 'rgba(251,191,36,0.90)',
  },
});
