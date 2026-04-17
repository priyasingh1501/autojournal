import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  ImageBackground, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { signUp, resendVerification, verifyOtp } from '../services/AuthService';
import { track } from '../services/AnalyticsService';

interface Props {
  onSuccess:  () => void;
  onGoLogin:  () => void;
}

export default function SignupScreen({ onSuccess, onGoLogin }: Props) {
  const [name,          setName]          = useState('');
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [pwFocused,     setPwFocused]     = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const pwRules = [
    { label: 'At least 8 characters',       met: password.length >= 8 },
    { label: 'One uppercase letter (A–Z)',   met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter (a–z)',   met: /[a-z]/.test(password) },
    { label: 'One number (0–9)',             met: /[0-9]/.test(password) },
    { label: 'One special character (!@#…)', met: /[^A-Za-z0-9]/.test(password) },
  ];
  const pwStrength = pwRules.filter(r => r.met).length; // 0–5
  const pwValid    = pwStrength === 5;

  // Verification-pending state
  const [pendingEmail,   setPendingEmail]   = useState<string | null>(null);
  const [otp,            setOtp]            = useState(['', '', '', '', '', '']);
  const [otpLoading,     setOtpLoading]     = useState(false);
  const [otpError,       setOtpError]       = useState<string | null>(null);
  const otpRefs = useRef<Array<TextInput | null>>([null, null, null, null, null, null]);

  const [resendLoading,  setResendLoading]  = useState(false);
  const [resendSent,     setResendSent]     = useState(false);
  const [resendError,    setResendError]    = useState<string | null>(null);

  // Cool-down: prevent spamming resend (30 s)
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = (seconds: number) => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setResendCooldown(seconds);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); cooldownRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const handleOtpChange = (val: string, idx: number) => {
    // Accept paste of full 6-digit code
    if (val.length === 6 && /^\d{6}$/.test(val)) {
      const digits = val.split('');
      setOtp(digits);
      otpRefs.current[5]?.focus();
      handleVerify(val);
      return;
    }
    const digit = val.replace(/[^0-9]/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
    if (next.every(d => d !== '')) handleVerify(next.join(''));
  };

  const handleOtpKeyPress = (key: string, idx: number) => {
    if (key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = async (code: string) => {
    if (!pendingEmail || code.length !== 6) return;
    setOtpError(null);
    setOtpLoading(true);
    try {
      await verifyOtp(pendingEmail, code);
      track('user_signed_up');
      onSuccess();
    } catch (e: any) {
      setOtpError('Invalid code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSignUp = async () => {
    setError(null);
    if (!name.trim())  { setError('Please enter your name.');  return; }
    if (!email.trim()) { setError('Please enter your email.'); return; }
    if (!pwValid)      { setError('Please meet all password requirements.'); return; }

    setLoading(true);
    try {
      const { needsVerification } = await signUp(email.trim().toLowerCase(), password, name.trim());
      if (!needsVerification) {
        // Email confirmation disabled in Supabase — session is live immediately
        track('user_signed_up');
        onSuccess();
        return;
      }
      // Show OTP verification screen
      setPendingEmail(email.trim().toLowerCase());
      setOtp(['', '', '', '', '', '']);
      setOtpError(null);
      startCooldown(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 400);
    } catch (e: any) {
      setError(e.message ?? 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail || resendCooldown > 0) return;
    setResendError(null);
    setResendSent(false);
    setResendLoading(true);
    try {
      await resendVerification(pendingEmail);
      setResendSent(true);
      startCooldown(30);
    } catch (e: any) {
      setResendError(e.message ?? 'Could not resend. Try again shortly.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/ocean.avif')}
      style={s.bg}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(0,10,30,0.30)', 'rgba(2,6,14,0.92)']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Wordmark */}
            <Text style={s.wordmark}>untangle</Text>
            <Text style={s.tagline}>your inner ocean</Text>

            {/* ── Signup form ── */}
            {!pendingEmail && (
              <>
                <View style={s.card}>
                  <Text style={s.cardTitle}>Create account</Text>
                  <Text style={s.cardSub}>Your journal stays on your device. This is just to sign in.</Text>

                  <View style={s.field}>
                    <Text style={s.label}>Name</Text>
                    <TextInput
                      style={s.input}
                      value={name}
                      onChangeText={setName}
                      placeholder="What should we call you?"
                      placeholderTextColor="rgba(152,212,250,0.30)"
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={s.field}>
                    <Text style={s.label}>Email</Text>
                    <TextInput
                      style={s.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor="rgba(152,212,250,0.30)"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={s.field}>
                    <Text style={s.label}>Password</Text>
                    <View style={s.passwordRow}>
                      <TextInput
                        style={[s.input, s.passwordInput]}
                        value={password}
                        onChangeText={setPassword}
                        onFocus={() => setPwFocused(true)}
                        onBlur={() => setPwFocused(false)}
                        placeholder="Create a strong password"
                        placeholderTextColor="rgba(152,212,250,0.30)"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        style={s.eyeBtn}
                        onPress={() => setShowPassword(v => !v)}
                        activeOpacity={0.7}
                      >
                        <Feather
                          name={showPassword ? 'eye-off' : 'eye'}
                          size={16}
                          color="rgba(152,212,250,0.45)"
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Strength bar */}
                    {password.length > 0 && (
                      <View style={s.strengthBarRow}>
                        {[1,2,3,4,5].map(i => (
                          <View
                            key={i}
                            style={[
                              s.strengthSegment,
                              i <= pwStrength && (
                                pwStrength <= 2 ? s.strengthWeak :
                                pwStrength <= 3 ? s.strengthFair :
                                pwStrength <= 4 ? s.strengthGood :
                                s.strengthStrong
                              ),
                            ]}
                          />
                        ))}
                        <Text style={s.strengthLabel}>
                          {pwStrength <= 2 ? 'Weak' : pwStrength === 3 ? 'Fair' : pwStrength === 4 ? 'Good' : 'Strong'}
                        </Text>
                      </View>
                    )}

                    {/* Requirements checklist — visible when focused or has content */}
                    {(pwFocused || password.length > 0) && (
                      <View style={s.rulesBox}>
                        {pwRules.map((rule, i) => (
                          <View key={i} style={s.ruleRow}>
                            <Feather
                              name={rule.met ? 'check-circle' : 'circle'}
                              size={12}
                              color={rule.met ? 'rgba(134,239,172,0.80)' : 'rgba(152,212,250,0.30)'}
                            />
                            <Text style={[s.ruleText, rule.met && s.ruleTextMet]}>
                              {rule.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {error ? <Text style={s.error}>{error}</Text> : null}

                  <TouchableOpacity
                    style={[s.btn, (!pwValid || loading) && s.btnDisabled]}
                    onPress={handleSignUp}
                    disabled={loading || !pwValid}
                    activeOpacity={0.85}
                  >
                    {loading
                      ? <ActivityIndicator color="rgba(224,242,254,0.90)" />
                      : <Text style={s.btnText}>Create account</Text>}
                  </TouchableOpacity>
                </View>

                <View style={s.footer}>
                  <Text style={s.footerText}>Already have an account? </Text>
                  <TouchableOpacity onPress={onGoLogin}>
                    <Text style={s.footerLink}>Sign in</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── OTP verification ── */}
            {pendingEmail && (
              <View style={s.card}>
                <View style={s.verifyIconRow}>
                  <Feather name="mail" size={28} color="rgba(152,212,250,0.60)" />
                </View>

                <Text style={s.cardTitle}>Check your email</Text>
                <Text style={s.cardSub}>
                  We sent a 6-digit code to{'\n'}
                  <Text style={s.verifyEmail}>{pendingEmail}</Text>
                </Text>

                {/* OTP boxes */}
                <View style={s.otpRow}>
                  {otp.map((digit, idx) => (
                    <TextInput
                      key={idx}
                      ref={r => { otpRefs.current[idx] = r; }}
                      style={[s.otpBox, digit ? s.otpBoxFilled : null]}
                      value={digit}
                      onChangeText={val => handleOtpChange(val, idx)}
                      onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, idx)}
                      keyboardType="number-pad"
                      maxLength={6}
                      selectTextOnFocus
                      textAlign="center"
                    />
                  ))}
                </View>

                {otpLoading && (
                  <ActivityIndicator color="rgba(152,212,250,0.70)" style={{ marginTop: 4 }} />
                )}
                {otpError ? <Text style={s.error}>{otpError}</Text> : null}

                <View style={s.divider} />

                {resendSent ? (
                  <Text style={s.resendSent}>New code sent — check your inbox.</Text>
                ) : null}
                {resendError ? <Text style={s.error}>{resendError}</Text> : null}

                <TouchableOpacity
                  style={[s.resendBtn, (resendLoading || resendCooldown > 0) && s.resendBtnDisabled]}
                  onPress={handleResend}
                  disabled={resendLoading || resendCooldown > 0}
                  activeOpacity={0.75}
                >
                  {resendLoading
                    ? <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
                    : <Text style={s.resendText}>
                        {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                      </Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={onGoLogin} style={s.wrongEmailBtn} activeOpacity={0.75}>
                  <Text style={s.wrongEmailText}>Wrong email? Sign in instead</Text>
                </TouchableOpacity>
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  bg:        { flex: 1 },
  safe:      { flex: 1 },
  flex:      { flex: 1 },
  scroll:    { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 40, gap: 8 },

  wordmark:  { fontSize: 34, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.95)', textAlign: 'center', letterSpacing: 2 },
  tagline:   { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', textAlign: 'center', letterSpacing: 1, marginBottom: 32 },

  card:      { backgroundColor: 'rgba(4,13,30,0.80)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(152,212,250,0.14)', padding: 24, gap: 18 },
  cardTitle: { fontSize: 20, fontFamily: 'Baskerville', color: 'rgba(224,242,254,0.92)', marginBottom: 2 },
  cardSub:   { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', lineHeight: 17, marginTop: -8 },

  field:     { gap: 6 },
  label:     { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', letterSpacing: 0.4, textTransform: 'uppercase' },
  input:     {
    backgroundColor: 'rgba(152,212,250,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.16)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.90)',
  },

  error:     { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(252,165,165,0.90)', lineHeight: 17 },

  btn:         { backgroundColor: 'rgba(9,41,173,0.70)', borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(152,212,250,0.30)', marginTop: 4 },
  btnDisabled: { opacity: 0.45 },
  btnText:     { fontSize: 15, fontFamily: 'GillSans-Light', fontWeight: '600', color: 'rgba(224,242,254,0.95)' },

  // ── Password field ─────────────────────────────────────────────────────────
  passwordRow:   { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, paddingRight: 44 },
  eyeBtn:        { position: 'absolute', right: 14, padding: 4 },

  // Strength bar
  strengthBarRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  strengthSegment: {
    flex: 1, height: 3, borderRadius: 2,
    backgroundColor: 'rgba(152,212,250,0.12)',
  },
  strengthWeak:   { backgroundColor: 'rgba(252,165,165,0.70)' },
  strengthFair:   { backgroundColor: 'rgba(251,191,36,0.70)' },
  strengthGood:   { backgroundColor: 'rgba(96,165,250,0.80)' },
  strengthStrong: { backgroundColor: 'rgba(134,239,172,0.80)' },
  strengthLabel:  { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)', marginLeft: 4, width: 40 },

  // Requirements list
  rulesBox:    { marginTop: 10, gap: 5 },
  ruleRow:     { flexDirection: 'row', alignItems: 'center', gap: 7 },
  ruleText:    { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.35)' },
  ruleTextMet: { color: 'rgba(134,239,172,0.75)' },

  footer:    { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText:{ fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)' },
  footerLink:{ fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.90)', fontWeight: '600' },

  // ── OTP verification ───────────────────────────────────────────────────────
  verifyIconRow: { alignItems: 'center', marginBottom: -4 },
  verifyEmail:   { color: 'rgba(224,242,254,0.80)', fontWeight: '600' },
  otpRow:        { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 4 },
  otpBox: {
    width: 44, height: 54, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.20)',
    backgroundColor: 'rgba(152,212,250,0.06)',
    fontSize: 22, fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.90)',
  },
  otpBoxFilled: { borderColor: 'rgba(152,212,250,0.55)', backgroundColor: 'rgba(152,212,250,0.10)' },
  divider:       { height: 1, backgroundColor: 'rgba(152,212,250,0.10)', marginVertical: 2 },
  resendSent:    { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(134,239,172,0.80)', textAlign: 'center' },
  resendBtn:     { paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.20)', backgroundColor: 'rgba(152,212,250,0.05)', alignItems: 'center' },
  resendBtnDisabled: { opacity: 0.45 },
  resendText:    { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.75)' },
  wrongEmailBtn: { alignSelf: 'center', marginTop: -4 },
  wrongEmailText:{ fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', textDecorationLine: 'underline' },
});
