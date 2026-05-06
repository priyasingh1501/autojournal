import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { StorageService } from '../services/StorageService';
import { track } from '../services/AnalyticsService';

interface Props {
  onUnlock: () => void;
}

const DOT_COUNT = 4;

const PAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
] as const;

function formatLockoutRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.ceil(totalSec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.ceil(min / 60);
  return `${hr} hr`;
}

export default function PinLockScreen({ onUnlock }: Props) {
  const [digits, setDigits] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [lockoutUntilMs, setLockoutUntilMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // On mount, restore any persisted lockout (so force-quit can't bypass it).
  useEffect(() => {
    StorageService.getPinLockoutState().then(state => {
      if (state.lockoutUntilMs > Date.now()) {
        setLockoutUntilMs(state.lockoutUntilMs);
      }
    });
  }, []);

  // Tick every second while locked out so the countdown updates.
  useEffect(() => {
    if (lockoutUntilMs <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockoutUntilMs, now]);

  const remainingMs = Math.max(0, lockoutUntilMs - now);
  const isLockedOut = remainingMs > 0;

  const triggerShake = (msg: string) => {
    setErrorMsg(msg);
    if (Platform.OS !== 'web') Vibration.vibrate(300);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start(() => setDigits([]));
  };

  const handleDigit = async (d: string) => {
    if (isLockedOut) return;
    if (digits.length >= DOT_COUNT) return;
    setErrorMsg('');
    const next = [...digits, d];
    setDigits(next);

    if (next.length === DOT_COUNT) {
      const entered = next.join('');
      const ok = await StorageService.verifyPin(entered);
      if (ok) {
        track('pin_unlocked', { method: 'pin' });
        onUnlock();
      } else {
        const state = await StorageService.recordFailedPinAttempt();
        if (state.lockoutUntilMs > Date.now()) {
          setLockoutUntilMs(state.lockoutUntilMs);
          setNow(Date.now());
          triggerShake(`Too many attempts — try again in ${formatLockoutRemaining(state.lockoutUntilMs - Date.now())}`);
        } else {
          triggerShake('Incorrect PIN — try again');
        }
      }
    }
  };

  const handleBackspace = () => {
    setErrorMsg('');
    setDigits(prev => prev.slice(0, -1));
  };

  return (
    <View style={s.overlay}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.inner}>
          {/* Branding */}
          <Text style={s.appName}>untangle</Text>
          <Text style={s.subtitle}>
            {isLockedOut
              ? `Locked. Try again in ${formatLockoutRemaining(remainingMs)}`
              : 'Enter your PIN to continue'}
          </Text>

          {/* PIN dots — hidden from screen readers so progress (number of
              digits entered, error state) isn't announced aloud to anyone
              within earshot of the device speaker. */}
          <Animated.View
            style={[s.dots, { transform: [{ translateX: shakeAnim }] }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {Array.from({ length: DOT_COUNT }).map((_, i) => (
              <View
                key={i}
                style={[
                  s.dot,
                  i < digits.length && s.dotFilled,
                  !!errorMsg && s.dotError,
                ]}
              />
            ))}
          </Animated.View>

          {/* Fixed-height error placeholder so dots don't shift. Live region
              ensures incorrect-PIN / lockout messages reach screen readers. */}
          <Text
            style={s.errorText}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {errorMsg}
          </Text>

          {/* Number pad */}
          <View style={s.pad}>
            {PAD_ROWS.map((row, ri) => (
              <View key={ri} style={s.padRow}>
                {row.map((key, ki) => {
                  if (key === '') {
                    return <View key={ki} style={s.keyPlaceholder} />;
                  }
                  if (key === 'del') {
                    return (
                      <TouchableOpacity
                        key={ki}
                        style={s.key}
                        onPress={handleBackspace}
                        activeOpacity={0.55}
                        accessibilityRole="button"
                        accessibilityLabel="Delete"
                        accessibilityHint="Removes the last entered digit"
                      >
                        <Feather name="delete" size={22} color="rgba(152, 212, 250, 0.80)" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={ki}
                      style={[s.key, isLockedOut && s.keyDisabled]}
                      onPress={() => handleDigit(key)}
                      activeOpacity={0.55}
                      disabled={isLockedOut}
                      accessibilityRole="button"
                      accessibilityLabel={key}
                      accessibilityState={{ disabled: isLockedOut }}
                    >
                      <Text style={[s.keyText, isLockedOut && s.keyTextDisabled]}>{key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#02060E',
    zIndex: 9999,
  },
  safe: { flex: 1 },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },

  appName: {
    fontSize: 34,
    fontFamily: 'Baskerville',
    color: 'rgba(224, 242, 254, 0.95)',
    letterSpacing: 3,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.60)',
    marginBottom: 52,
  },

  dots: {
    flexDirection: 'row',
    gap: 22,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(152, 212, 250, 0.35)',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: 'rgba(152, 212, 250, 0.90)',
    borderColor: 'rgba(152, 212, 250, 0.90)',
  },
  dotError: {
    borderColor: '#e63946',
  },
  errorText: {
    height: 20,
    marginTop: 12,
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: '#e63946',
    textAlign: 'center',
  },

  pad: {
    marginTop: 52,
    gap: 18,
    width: '100%',
  },
  padRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
  },
  key: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(3, 18, 40, 0.80)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.13)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  keyPlaceholder: {
    width: 76,
    height: 76,
  },
  keyText: {
    fontSize: 26,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.92)',
  },
  keyDisabled: {
    opacity: 0.35,
  },
  keyTextDisabled: {
    color: 'rgba(224, 242, 254, 0.55)',
  },
});
