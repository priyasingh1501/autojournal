import React, { useState, useRef } from 'react';
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

export default function PinLockScreen({ onUnlock }: Props) {
  const [digits, setDigits] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;

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
    if (digits.length >= DOT_COUNT) return;
    setErrorMsg('');
    const next = [...digits, d];
    setDigits(next);

    if (next.length === DOT_COUNT) {
      const entered = next.join('');
      const ok = await StorageService.verifyPin(entered);
      if (ok) {
        onUnlock();
      } else {
        triggerShake('Incorrect PIN — try again');
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
          <Text style={s.subtitle}>Enter your PIN to continue</Text>

          {/* PIN dots */}
          <Animated.View style={[s.dots, { transform: [{ translateX: shakeAnim }] }]}>
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

          {/* Fixed-height error placeholder so dots don't shift */}
          <Text style={s.errorText}>{errorMsg}</Text>

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
                      >
                        <Feather name="delete" size={22} color="rgba(152, 212, 250, 0.80)" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={ki}
                      style={s.key}
                      onPress={() => handleDigit(key)}
                      activeOpacity={0.55}
                    >
                      <Text style={s.keyText}>{key}</Text>
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
});
