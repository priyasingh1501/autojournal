import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { signIn, resetPassword } from '../services/AuthService';
import { track } from '../services/AnalyticsService';

interface Props {
  onSuccess:    () => void;
  onGoSignup:   () => void;
}

export default function LoginScreen({ onSuccess, onGoSignup }: Props) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Forgot-password mode
  const [forgotMode,   setForgotMode]   = useState(false);
  const [resetEmail,   setResetEmail]   = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent,    setResetSent]    = useState(false);
  const [resetError,   setResetError]   = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      track('user_signed_in');
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setResetError(null);
    if (!resetEmail.trim()) {
      setResetError('Please enter your email address.');
      return;
    }
    setResetLoading(true);
    try {
      await resetPassword(resetEmail.trim().toLowerCase());
      setResetSent(true);
    } catch (e: any) {
      setResetError(e.message ?? 'Could not send reset email. Try again.');
    } finally {
      setResetLoading(false);
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
          <View style={s.content}>

            {/* Wordmark */}
            <Text style={s.wordmark}>untangle</Text>
            <Text style={s.tagline}>your inner ocean</Text>

            {/* ── Sign-in card ── */}
            {!forgotMode && (
              <>
                <View style={s.card}>
                  <Text style={s.cardTitle}>Welcome back</Text>

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
                    <TextInput
                      style={s.input}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      placeholderTextColor="rgba(152,212,250,0.30)"
                      secureTextEntry
                    />
                  </View>

                  {error ? <Text style={s.error}>{error}</Text> : null}

                  <TouchableOpacity
                    style={s.btn}
                    onPress={handleSignIn}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {loading
                      ? <ActivityIndicator color="rgba(224,242,254,0.90)" />
                      : <Text style={s.btnText}>Sign in</Text>}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => { setForgotMode(true); setResetEmail(email); setResetSent(false); setResetError(null); }}
                    style={s.forgotBtn}
                    activeOpacity={0.75}
                  >
                    <Text style={s.forgotText}>Forgot password?</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.footer}>
                  <Text style={s.footerText}>Don't have an account? </Text>
                  <TouchableOpacity onPress={onGoSignup}>
                    <Text style={s.footerLink}>Sign up</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── Forgot-password card ── */}
            {forgotMode && (
              <>
                <View style={s.card}>
                  <TouchableOpacity
                    onPress={() => setForgotMode(false)}
                    style={s.backRow}
                    activeOpacity={0.75}
                  >
                    <Feather name="arrow-left" size={14} color="rgba(152,212,250,0.60)" />
                    <Text style={s.backText}>Back to sign in</Text>
                  </TouchableOpacity>

                  <Text style={s.cardTitle}>Reset password</Text>

                  {!resetSent ? (
                    <>
                      <Text style={s.cardSub}>
                        Enter your email and we'll send you a link to reset your password.
                      </Text>

                      <View style={s.field}>
                        <Text style={s.label}>Email</Text>
                        <TextInput
                          style={s.input}
                          value={resetEmail}
                          onChangeText={setResetEmail}
                          placeholder="you@example.com"
                          placeholderTextColor="rgba(152,212,250,0.30)"
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>

                      {resetError ? <Text style={s.error}>{resetError}</Text> : null}

                      <TouchableOpacity
                        style={s.btn}
                        onPress={handleReset}
                        disabled={resetLoading}
                        activeOpacity={0.85}
                      >
                        {resetLoading
                          ? <ActivityIndicator color="rgba(224,242,254,0.90)" />
                          : <Text style={s.btnText}>Send reset link</Text>}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={s.sentBox}>
                      <Feather name="mail" size={28} color="rgba(152,212,250,0.60)" style={{ marginBottom: 12 }} />
                      <Text style={s.sentTitle}>Check your inbox</Text>
                      <Text style={s.sentBody}>
                        We sent a password reset link to{'\n'}
                        <Text style={s.sentEmail}>{resetEmail}</Text>
                      </Text>
                      <Text style={s.sentHint}>
                        Follow the link in the email, then come back and sign in with your new password.
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}

          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  bg:        { flex: 1 },
  safe:      { flex: 1 },
  flex:      { flex: 1 },
  content:   { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 8 },

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

  btn:       { backgroundColor: 'rgba(9,41,173,0.70)', borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(152,212,250,0.30)', marginTop: 4 },
  btnText:   { fontSize: 15, fontFamily: 'GillSans-Light', fontWeight: '600', color: 'rgba(224,242,254,0.95)' },

  forgotBtn:  { alignSelf: 'center', marginTop: -4 },
  forgotText: { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)', textDecorationLine: 'underline' },

  backRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: -4 },
  backText:  { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)' },

  sentBox:   { alignItems: 'center', paddingVertical: 8 },
  sentTitle: { fontSize: 17, fontFamily: 'Baskerville', color: 'rgba(224,242,254,0.90)', marginBottom: 10 },
  sentBody:  { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', textAlign: 'center', lineHeight: 20, marginBottom: 12 },
  sentEmail: { color: 'rgba(224,242,254,0.80)', fontWeight: '600' },
  sentHint:  { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', textAlign: 'center', lineHeight: 18 },

  footer:    { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText:{ fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)' },
  footerLink:{ fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.90)', fontWeight: '600' },
});
