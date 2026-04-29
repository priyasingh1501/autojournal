/**
 * PaywallModal — shown whenever a free-tier user hits a Pro gate.
 *
 * Props:
 *   visible    — controls modal visibility
 *   onClose    — user dismissed without subscribing
 *   onSuccess  — called after a successful purchase so the caller can retry the gated action
 *   featureHint — short description of what they were trying to do, shown as context
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SubscriptionService, ProPlan, PlanPricing } from '../services/SubscriptionService';
import { track } from '../services/AnalyticsService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  featureHint?: string;
}

const FEATURES = [
  { icon: 'zap',        text: 'Unlimited AI daily summaries' },
  { icon: 'user',       text: 'Who You Are — Big Five + Enneagram' },
  { icon: 'heart',      text: 'Values Constellation' },
  { icon: 'cpu',        text: 'How You Think — Cognitive styles' },
  { icon: 'book',       text: 'Your Story — Chapter + Arc' },
  { icon: 'phone',      text: 'AI Call & Chat conversations' },
  { icon: 'bar-chart-2',text: 'Monthly deep insights' },
];

interface PlanCard {
  key:    ProPlan;
  label:  string;
  price:  string;
  sub:    string;
  badge?: string;
}

// Fallback copy used only when RC offerings haven't loaded (offline cold-start
// or RC misconfigured). Shows USD defaults — once `getPlanPricing()` returns,
// these get replaced with localized prices straight from Google Play.
const FALLBACK_PLANS: PlanCard[] = [
  {
    key:   'annual',
    label: 'Annual',
    price: '$59.99 / year',
    sub:   'just $5 / month',
    badge: 'Best value · saves 44%',
  },
  {
    key:   'monthly',
    label: 'Monthly',
    price: '$8.99 / month',
    sub:   'cancel any time',
  },
];

function buildPlansFromPricing(p: PlanPricing): PlanCard[] {
  const plans: PlanCard[] = [];
  if (p.annual) {
    plans.push({
      key:   'annual',
      label: 'Annual',
      price: `${p.annual.priceString} / year`,
      sub:   `just ${p.annual.pricePerMonthString} / month`,
      badge: p.annual.savingsPct > 0 ? `Best value · saves ${p.annual.savingsPct}%` : 'Best value',
    });
  }
  if (p.monthly) {
    plans.push({
      key:   'monthly',
      label: 'Monthly',
      price: `${p.monthly.priceString} / month`,
      sub:   'cancel any time',
    });
  }
  return plans.length > 0 ? plans : FALLBACK_PLANS;
}

export default function PaywallModal({ visible, onClose, onSuccess, featureHint }: Props) {
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<ProPlan>('annual');
  const [loading, setLoading]           = useState(false);
  const [restoring, setRestoring]       = useState(false);
  const [trialDays, setTrialDays]       = useState(0);
  const [plans, setPlans]               = useState<PlanCard[]>(FALLBACK_PLANS);

  useEffect(() => {
    if (visible) {
      track('paywall_shown', { hint: featureHint ?? null });
      SubscriptionService.getTrialDaysRemaining().then(setTrialDays);
      SubscriptionService.getPlanPricing()
        .then(pricing => setPlans(buildPlansFromPricing(pricing)))
        .catch(() => { /* keep fallback */ });
    }
  }, [visible, featureHint]);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const ok = await SubscriptionService.purchasePro(selectedPlan);
      if (ok) {
        track('subscription_purchased', { plan: selectedPlan, source: 'purchase' });
        onSuccess();
      }
    } catch (e: any) {
      Alert.alert('Purchase failed', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const ok = await SubscriptionService.restorePurchases();
      if (ok) {
        track('subscription_purchased', { plan: selectedPlan, source: 'restore' });
        onSuccess();
      } else {
        Alert.alert('No purchases found', 'No active subscription was found for this account.');
      }
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message ?? 'Something went wrong.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={s.root}>
        {/* Close button */}
        <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="x" size={20} color="rgba(152,212,250,0.55)" />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: Math.max(40, insets.bottom + 16) }]} showsVerticalScrollIndicator={false}>

          {/* Hero */}
          <View style={s.hero}>
            <Text style={s.heroEyebrow}>untangle</Text>
            <Text style={s.heroTitle}>Pro</Text>
            {featureHint ? (
              <Text style={s.heroHint}>{featureHint}</Text>
            ) : (
              <Text style={s.heroHint}>Unlock the full depth of your journal.</Text>
            )}
          </View>

          {/* Feature list */}
          <View style={s.featureList}>
            {FEATURES.map(f => (
              <View key={f.icon} style={s.featureRow}>
                <View style={s.featureIconWrap}>
                  <Feather name={f.icon as any} size={14} color="rgba(152,212,250,0.75)" />
                </View>
                <Text style={s.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>

          {/* Plan toggle */}
          <View style={s.plans}>
            {plans.map(plan => {
              const active = selectedPlan === plan.key;
              return (
                <TouchableOpacity
                  key={plan.key}
                  style={[s.planCard, active && s.planCardActive]}
                  onPress={() => setSelectedPlan(plan.key)}
                  activeOpacity={0.8}
                >
                  {plan.badge ? (
                    <View style={s.planBadge}>
                      <Text style={s.planBadgeText}>{plan.badge}</Text>
                    </View>
                  ) : null}
                  <View style={s.planRadioRow}>
                    <View style={[s.radio, active && s.radioActive]}>
                      {active && <View style={s.radioDot} />}
                    </View>
                    <Text style={[s.planLabel, active && s.planLabelActive]}>{plan.label}</Text>
                  </View>
                  <Text style={[s.planPrice, active && s.planPriceActive]}>{plan.price}</Text>
                  <Text style={s.planSub}>{plan.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={[s.ctaBtn, loading && s.ctaBtnDisabled]}
            onPress={handleSubscribe}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator size="small" color="rgba(224,242,254,0.95)" />
              : <Text style={s.ctaText}>
                  {(() => {
                    const selected = plans.find(p => p.key === selectedPlan);
                    return selected ? `Get untangle Pro — ${selected.price}` : 'Get untangle Pro';
                  })()}
                </Text>
            }
          </TouchableOpacity>

          {trialDays > 0 && (
            <Text style={s.trialNote}>
              You have {trialDays} day{trialDays !== 1 ? 's' : ''} left on your free trial.
            </Text>
          )}

          {/* Restore */}
          <TouchableOpacity
            style={s.restoreBtn}
            onPress={handleRestore}
            disabled={restoring}
            activeOpacity={0.7}
          >
            {restoring
              ? <ActivityIndicator size="small" color="rgba(152,212,250,0.40)" />
              : <Text style={s.restoreText}>Restore purchases</Text>
            }
          </TouchableOpacity>

          <Text style={s.legalText}>
            Subscription auto-renews unless cancelled at least 24 hours before the end of the period.
            Manage or cancel in your device's subscription settings.
          </Text>

        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root:             { flex: 1, backgroundColor: '#02060E' },
  closeBtn:         { position: 'absolute', top: 16, right: 20, zIndex: 10, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll:           { paddingHorizontal: 24, paddingTop: 52, paddingBottom: 0 },

  hero:             { alignItems: 'center', marginBottom: 32 },
  heroEyebrow:      { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  heroTitle:        { fontSize: 42, fontFamily: 'Baskerville', color: 'rgba(224,242,254,0.95)', marginBottom: 10 },
  heroHint:         { fontSize: 14, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', textAlign: 'center', lineHeight: 20 },

  featureList:      { gap: 10, marginBottom: 28 },
  featureRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIconWrap:  { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(9,41,173,0.35)', borderWidth: 1, borderColor: 'rgba(152,212,250,0.15)', alignItems: 'center', justifyContent: 'center' },
  featureText:      { fontSize: 14, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.80)', flex: 1 },

  plans:            { flexDirection: 'row', gap: 12, marginBottom: 24 },
  planCard:         { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)', backgroundColor: 'rgba(152,212,250,0.03)', padding: 14, gap: 4 },
  planCardActive:   { borderColor: 'rgba(152,212,250,0.45)', backgroundColor: 'rgba(9,41,173,0.25)' },
  planBadge:        { backgroundColor: 'rgba(9,41,173,0.60)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6 },
  planBadgeText:    { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.90)', letterSpacing: 0.2 },
  planRadioRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  radio:            { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(152,212,250,0.30)', alignItems: 'center', justifyContent: 'center' },
  radioActive:      { borderColor: 'rgba(152,212,250,0.80)' },
  radioDot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(152,212,250,0.90)' },
  planLabel:        { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)' },
  planLabelActive:  { color: 'rgba(224,242,254,0.95)' },
  planPrice:        { fontSize: 15, fontFamily: 'Baskerville', color: 'rgba(152,212,250,0.65)' },
  planPriceActive:  { color: 'rgba(224,242,254,0.95)' },
  planSub:          { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)' },

  ctaBtn:           { backgroundColor: 'rgba(9,41,173,0.80)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(152,212,250,0.35)', paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  ctaBtnDisabled:   { opacity: 0.6 },
  ctaText:          { fontSize: 15, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.95)', letterSpacing: 0.2 },

  trialNote:        { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)', textAlign: 'center', marginBottom: 16 },

  restoreBtn:       { alignItems: 'center', paddingVertical: 12, marginBottom: 12 },
  restoreText:      { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)' },

  legalText:        { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.28)', textAlign: 'center', lineHeight: 15 },
});
