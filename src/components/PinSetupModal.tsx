/**
 * PinSetupModal — full-screen modal for creating, changing, or removing the
 * 4-digit app PIN.
 *
 * Setup mode (requireCurrent=false, verifyOnly=false):
 *   Step 1: User enters a 4-digit PIN.
 *   Step 2: User confirms by re-entering the same PIN.
 *   On final match → saves via StorageService.savePin() and calls onDone().
 *
 * Change mode (requireCurrent=true, verifyOnly=false):
 *   Step 0: User enters their CURRENT PIN — verified against StorageService.
 *           Wrong PIN shakes and clears, doesn't advance.
 *   Step 1: User enters a new 4-digit PIN.
 *   Step 2: User confirms by re-entering the same PIN.
 *   On final match → saves new PIN and calls onDone().
 *
 * Verify-only mode (verifyOnly=true):
 *   Single step: User enters their current PIN — verified.
 *   Wrong PIN shakes; correct PIN calls onDone() immediately. The CALLER is
 *   responsible for the action that follows (e.g. removing the PIN).
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
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
  visible: boolean;
  /** Called after PIN is successfully saved */
  onDone: () => void;
  /** Called when the user cancels without saving */
  onCancel: () => void;
  /**
   * If true, the user must first enter their current PIN before being allowed
   * to set a new one. Use this when the user is changing an existing PIN.
   */
  requireCurrent?: boolean;
  /**
   * If true, the modal asks for the current PIN ONLY and calls onDone() on
   * verification success without prompting for a new PIN. Use this when the
   * caller wants to gate a destructive action (e.g. disabling App Lock)
   * behind PIN verification. Implies requireCurrent.
   */
  verifyOnly?: boolean;
  /** Title shown in verify-only mode. Defaults to "Enter your PIN". */
  verifyTitle?: string;
  /** Subtitle shown in verify-only mode. Optional. */
  verifySubtitle?: string;
}

type Step = 'verify' | 'enter' | 'confirm';

const DOT_COUNT = 4;

const PAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
] as const;

function PinDots({
  count,
  filled,
  hasError,
  shakeAnim,
}: {
  count: number;
  filled: number;
  hasError: boolean;
  shakeAnim: Animated.Value;
}) {
  return (
    <Animated.View style={[s.dots, { transform: [{ translateX: shakeAnim }] }]}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            s.dot,
            i < filled && s.dotFilled,
            hasError && s.dotError,
          ]}
        />
      ))}
    </Animated.View>
  );
}

export default function PinSetupModal({
  visible,
  onDone,
  onCancel,
  requireCurrent = false,
  verifyOnly = false,
  verifyTitle,
  verifySubtitle,
}: Props) {
  const needsVerify = requireCurrent || verifyOnly;
  const initialStep: Step = needsVerify ? 'verify' : 'enter';
  const [step, setStep] = useState<Step>(initialStep);
  const [firstPin, setFirstPin] = useState('');
  const [digits, setDigits] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // When the modal is re-opened (visibility flips on), restart from the
  // correct initial step for the current mode. Without this, a previous
  // "verify" run could leave step stuck on 'enter' when the same component
  // instance is reused.
  useEffect(() => {
    if (visible) {
      setStep(initialStep);
      setFirstPin('');
      setDigits([]);
      setErrorMsg('');
      shakeAnim.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, requireCurrent, verifyOnly]);

  const reset = () => {
    setStep(initialStep);
    setFirstPin('');
    setDigits([]);
    setErrorMsg('');
    shakeAnim.setValue(0);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const triggerShake = (msg: string) => {
    setErrorMsg(msg);
    if (Platform.OS !== 'web') Vibration.vibrate(200);
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

    if (next.length < DOT_COUNT) return;

    const entered = next.join('');

    if (step === 'verify') {
      // Verify the user knows the current PIN before letting them change it
      // (or before letting them perform whatever destructive action the
      // caller is gating on this modal in verify-only mode).
      const ok = await StorageService.verifyPin(entered);
      if (ok) {
        if (verifyOnly) {
          reset();
          onDone();
        } else {
          setStep('enter');
          setDigits([]);
        }
      } else {
        triggerShake('Incorrect PIN — try again');
      }
    } else if (step === 'enter') {
      // Move to confirm step
      setFirstPin(entered);
      setStep('confirm');
      setDigits([]);
    } else {
      // Confirm step
      if (entered === firstPin) {
        await StorageService.savePin(entered);
        reset();
        onDone();
      } else {
        triggerShake("PINs don't match — try again");
        setStep('enter');
        setFirstPin('');
      }
    }
  };

  const handleBackspace = () => {
    setErrorMsg('');
    setDigits(prev => prev.slice(0, -1));
  };

  const title =
    step === 'verify'  ? (verifyOnly ? (verifyTitle ?? 'Enter your PIN') : 'Enter your current PIN')
    : step === 'enter' ? (requireCurrent ? 'Choose a new PIN' : 'Create a PIN')
    :                    'Confirm your PIN';
  const subtitle =
    step === 'verify'  ? (verifyOnly ? (verifySubtitle ?? '') : 'Confirm it’s you before changing the PIN')
    : step === 'enter' ? 'Choose a 4-digit PIN to lock the app'
    :                    'Re-enter the same PIN to confirm';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCancel}
    >
      <View style={s.bg}>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={handleCancel} style={s.cancelBtn}>
              <Feather name="x" size={20} color="rgba(152, 212, 250, 0.65)" />
            </TouchableOpacity>
          </View>

          <View style={s.inner}>
            {/* Step indicator — hidden in verify-only mode (single step) */}
            {!verifyOnly && (
              <View style={s.stepDots}>
                {requireCurrent && (
                  <View style={[s.stepDot, step === 'verify' && s.stepDotActive]} />
                )}
                <View style={[s.stepDot, step === 'enter' && s.stepDotActive]} />
                <View style={[s.stepDot, step === 'confirm' && s.stepDotActive]} />
              </View>
            )}

            <Text style={s.title}>{title}</Text>
            <Text style={s.subtitle}>{subtitle}</Text>

            {/* PIN dots */}
            <PinDots
              count={DOT_COUNT}
              filled={digits.length}
              hasError={!!errorMsg}
              shakeAnim={shakeAnim}
            />

            {/* Fixed-height error line */}
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
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#02060E' },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  cancelBtn: { padding: 8 },

  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 24,
  },

  stepDots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(152, 212, 250, 0.18)',
  },
  stepDotActive: {
    backgroundColor: 'rgba(152, 212, 250, 0.80)',
  },

  title: {
    fontSize: 26,
    fontFamily: 'Baskerville',
    color: 'rgba(224, 242, 254, 0.95)',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.60)',
    marginBottom: 48,
    textAlign: 'center',
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
