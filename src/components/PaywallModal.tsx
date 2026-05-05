/**
 * PaywallModal — shown whenever a free-tier user hits a Pro gate, or from
 * the Settings "Upgrade to Pro" entry.
 *
 * Framing: every new user gets 14 days of full Pro access automatically (anchored
 * to their Supabase user.created_at). The paywall leads with that — we never want
 * a brand-new user to feel they're staring at a paywall on day one.
 *
 * Offerings: if RevenueCat hasn't loaded any packages (network error, RC not yet
 * configured, products not synced from Play Console), we keep the modal visible
 * with the trial info but disable the purchase CTA and surface a clear
 * "subscriptions unavailable" message — much friendlier than letting the user
 * tap purchase and seeing a "no subscription exists" alert.
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
import { T, glassCard } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  featureHint?: string;
}

const FEATURES = [
  { icon: 'zap',         text: 'Unlimited AI daily summaries' },
  { icon: 'user',        text: 'Who You Are — Big Five + Enneagram' },
  { icon: 'heart',       text: 'Values Constellation' },
  { icon: 'cpu',         text: 'How You Think — Cognitive styles' },
  { icon: 'book',        text: 'Your Story — Chapter + Arc' },
  { icon: 'phone',       text: 'AI Call & Chat conversations' },
  { icon: 'bar-chart-2', text: 'Monthly deep insights' },
];

interface PlanCard {
  key:    ProPlan;
  label:  string;
  price:  string;
  perMo?: string;
  sub:    string;
  badge?: string;
}

// Fallback copy used only when RC offerings haven't loaded. Shown for context
// alongside a disabled CTA — we never let the user tap purchase against fake
// prices.
const FALLBACK_PLANS: PlanCard[] = [
  {
    key:   'annual',
    label: 'Annual',
    price: '$59.99 / year',
    perMo: 'just $5 / month',
    sub:   'Save 44%',
    badge: 'Best value',
  },
  {
    key:   'monthly',
    label: 'Monthly',
    price: '$8.99 / month',
    sub:   'Cancel any time',
  },
];

function buildPlansFromPricing(p: PlanPricing): PlanCard[] {
  const plans: PlanCard[] = [];
  if (p.annual) {
    plans.push({
      key:   'annual',
      label: 'Annual',
      price: `${p.annual.priceString} / year`,
      perMo: `just ${p.annual.pricePerMonthString} / month`,
      sub:   p.annual.savingsPct > 0 ? `Save ${p.annual.savingsPct}%` : 'Best value',
      badge: 'Best value',
    });
  }
  if (p.monthly) {
    plans.push({
      key:   'monthly',
      label: 'Monthly',
      price: `${p.monthly.priceString} / month`,
      sub:   'Cancel any time',
    });
  }
  return plans;
}

export default function PaywallModal({ visible, onClose, onSuccess, featureHint }: Props) {
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan]     = useState<ProPlan>('annual');
  const [loading, setLoading]               = useState(false);
  const [restoring, setRestoring]           = useState(false);
  const [trialDays, setTrialDays]           = useState(0);
  const [isTrialing, setIsTrialing]         = useState(false);
  const [plans, setPlans]                   = useState<PlanCard[]>(FALLBACK_PLANS);
  // Tri-state: 'loading' while we're still fetching, 'ready' once we have real
  // store prices, 'unavailable' when RC didn't return any offerings (purchase
  // is blocked in that case).
  const [pricingState, setPricingState]     = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    if (!visible) return;
    track('paywall_shown', { hint: featureHint ?? null });
    setPricingState('loading');

    SubscriptionService.getTrialDaysRemaining().then(setTrialDays);
    SubscriptionService.isInTrial().then(setIsTrialing);

    SubscriptionService.getPlanPricing()
      .then(pricing => {
        const realPlans = buildPlansFromPricing(pricing);
        if (realPlans.length > 0) {
          setPlans(realPlans);
          setPricingState('ready');
        } else {
          setPlans(FALLBACK_PLANS);
          setPricingState('unavailable');
        }
      })
      .catch(() => {
        setPlans(FALLBACK_PLANS);
        setPricingState('unavailable');
      });
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

  // Pick the headline that frames the offer most accurately for this user's state.
  const heroHint = (() => {
    if (featureHint) return featureHint;
    if (isTrialing && trialDays > 0) {
      return `You have ${trialDays} day${trialDays !== 1 ? 's' : ''} left in your free trial. Lock in Pro to keep going.`;
    }
    return 'Start with a 14-day free trial — full access, no charge.';
  })();

  // CTA copy adapts to (a) whether the trial is still active and (b) the selected plan.
  const ctaCopy = (() => {
    if (pricingState === 'loading') return 'Loading…';
    if (pricingState === 'unavailable') return 'Subscriptions unavailable';
    const selected = plans.find(p => p.key === selectedPlan);
    const priceTag = selected ? selected.price : '';
    if (isTrialing && trialDays > 0) {
      return priceTag ? `Continue with Pro — ${priceTag}` : 'Continue with Pro';
    }
    return priceTag ? `Get untangle Pro — ${priceTag}` : 'Get untangle Pro';
  })();

  const ctaDisabled = loading || pricingState !== 'ready';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={s.root}>
        {/* Close button */}
        <TouchableOpacity
          style={s.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="x" size={20} color="rgba(152,212,250,0.55)" />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: Math.max(40, insets.bottom + 24) }]}
          showsVerticalScrollIndicator={false}
        >

          {/* Hero */}
          <View style={s.hero}>
            <View style={s.heroIcon}>
              <Feather name="star" size={20} color={T.CYAN} />
            </View>
            <Text style={s.heroEyebrow}>untangle</Text>
            <Text style={s.heroTitle}>Pro</Text>
            <Text style={s.heroHint}>{heroHint}</Text>
          </View>

          {/* Trial banner — only when actively trialing. Cyan-tinted to signal "you're already
              getting this for free right now". */}
          {isTrialing && trialDays > 0 && (
            <View style={s.trialBanner}>
              <View style={s.trialBadge}>
                <Feather name="gift" size={11} color={T.CYAN} />
                <Text style={s.trialBadgeText}>Free trial</Text>
              </View>
              <Text style={s.trialBannerText}>
                Day {Math.max(1, SubscriptionService.TRIAL_DAYS - trialDays + 1)} of {SubscriptionService.TRIAL_DAYS} · {trialDays} day{trialDays !== 1 ? 's' : ''} remaining
              </Text>
            </View>
          )}

          {/* Plans — stacked cards for readable touch targets on small screens */}
          <View style={s.plans}>
            {plans.map(plan => {
              const active = selectedPlan === plan.key;
              return (
                <TouchableOpacity
                  key={plan.key}
                  style={[s.planCard, active && s.planCardActive]}
                  onPress={() => setSelectedPlan(plan.key)}
                  activeOpacity={0.85}
                >
                  {plan.badge ? (
                    <View style={s.planBadge}>
                      <Text style={s.planBadgeText}>{plan.badge}</Text>
                    </View>
                  ) : null}
                  <View style={s.planRow}>
                    <View style={[s.radio, active && s.radioActive]}>
                      {active && <View style={s.radioDot} />}
                    </View>
                    <View style={s.planBody}>
                      <Text style={[s.planLabel, active && s.planLabelActive]}>{plan.label}</Text>
                      <Text style={[s.planPrice, active && s.planPriceActive]}>{plan.price}</Text>
                      {plan.perMo ? (
                        <Text style={s.planPerMo}>{plan.perMo}</Text>
                      ) : null}
                    </View>
                    <View style={s.planSubBadge}>
                      <Text style={s.planSubBadgeText}>{plan.sub}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={[s.ctaBtn, ctaDisabled && s.ctaBtnDisabled]}
            onPress={handleSubscribe}
            disabled={ctaDisabled}
            activeOpacity={0.85}
          >
            {loading || pricingState === 'loading'
              ? <ActivityIndicator size="small" color={T.TEXT_PRIMARY} />
              : <Text style={s.ctaText}>{ctaCopy}</Text>
            }
          </TouchableOpacity>

          {pricingState === 'unavailable' && (
            <Text style={s.unavailableNote}>
              We can't reach the subscription store right now. Please check your connection or try again later.
            </Text>
          )}

          {/* Features — wrapped in a glass card so they read as a unified "what you get" block */}
          <View style={s.featureCard}>
            <Text style={s.featureCardTitle}>Everything in Pro</Text>
            <View style={s.featureList}>
              {FEATURES.map(f => (
                <View key={f.icon} style={s.featureRow}>
                  <View style={s.featureIconWrap}>
                    <Feather name={f.icon as any} size={13} color={T.CYAN} />
                  </View>
                  <Text style={s.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
          </View>

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
  root:             { flex: 1, backgroundColor: T.BG_DEEP },
  closeBtn:         { position: 'absolute', top: 16, right: 20, zIndex: 10, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(152,212,250,0.06)', borderWidth: 1, borderColor: T.GLASS_BORDER },
  scroll:           { paddingHorizontal: 24, paddingTop: 60 },

  hero:             { alignItems: 'center', marginBottom: 24 },
  heroIcon:         { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(9,41,173,0.30)', borderWidth: 1, borderColor: T.CYAN_DIM, marginBottom: 16 },
  heroEyebrow:      { fontSize: 12, fontFamily: T.FONT, color: 'rgba(152,212,250,0.55)', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 4 },
  heroTitle:        { fontSize: 44, fontFamily: T.FONT_HEADING, color: T.TEXT_PRIMARY, marginBottom: 12 },
  heroHint:         { fontSize: 14, fontFamily: T.FONT, color: T.TEXT_MUTED, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },

  trialBanner:      { ...glassCard, borderRadius: 14, padding: 14, marginBottom: 24, alignItems: 'center', borderColor: 'rgba(152,212,250,0.22)' },
  trialBadge:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(152,212,250,0.10)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginBottom: 6 },
  trialBadgeText:   { fontSize: 11, fontFamily: T.FONT, color: T.CYAN, letterSpacing: 0.4, textTransform: 'uppercase' },
  trialBannerText:  { fontSize: 13, fontFamily: T.FONT, color: T.TEXT_SECONDARY, textAlign: 'center' },

  plans:            { gap: 12, marginBottom: 20 },
  planCard:         { borderRadius: 16, borderWidth: 1, borderColor: T.GLASS_BORDER, backgroundColor: 'rgba(152,212,250,0.03)', padding: 16, position: 'relative' },
  planCardActive:   { borderColor: 'rgba(152,212,250,0.45)', backgroundColor: 'rgba(9,41,173,0.22)' },
  planBadge:        { position: 'absolute', top: -8, right: 16, backgroundColor: T.NAVY, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(152,212,250,0.45)' },
  planBadgeText:    { fontSize: 10, fontFamily: T.FONT, color: T.TEXT_PRIMARY, letterSpacing: 0.4, textTransform: 'uppercase' },
  planRow:          { flexDirection: 'row', alignItems: 'center', gap: 14 },
  radio:            { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(152,212,250,0.30)', alignItems: 'center', justifyContent: 'center' },
  radioActive:      { borderColor: T.CYAN },
  radioDot:         { width: 10, height: 10, borderRadius: 5, backgroundColor: T.CYAN },
  planBody:         { flex: 1, gap: 2 },
  planLabel:        { fontSize: 13, fontFamily: T.FONT, color: T.TEXT_MUTED, letterSpacing: 0.3, textTransform: 'uppercase' },
  planLabelActive:  { color: T.TEXT_SECONDARY },
  planPrice:        { fontSize: 17, fontFamily: T.FONT_HEADING, color: T.TEXT_SECONDARY },
  planPriceActive:  { color: T.TEXT_PRIMARY },
  planPerMo:        { fontSize: 12, fontFamily: T.FONT, color: 'rgba(152,212,250,0.50)', marginTop: 1 },
  planSubBadge:     { backgroundColor: 'rgba(152,212,250,0.06)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: T.GLASS_BORDER },
  planSubBadgeText: { fontSize: 10, fontFamily: T.FONT, color: T.TEXT_MUTED, letterSpacing: 0.2 },

  ctaBtn:           { backgroundColor: 'rgba(9,41,173,0.85)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(152,212,250,0.40)', paddingVertical: 18, alignItems: 'center', marginBottom: 8, shadowColor: T.CYAN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 6 },
  ctaBtnDisabled:   { opacity: 0.45, shadowOpacity: 0 },
  ctaText:          { fontSize: 15, fontFamily: T.FONT, color: T.TEXT_PRIMARY, letterSpacing: 0.3 },

  unavailableNote:  { fontSize: 12, fontFamily: T.FONT, color: 'rgba(244,162,97,0.75)', textAlign: 'center', marginBottom: 12, lineHeight: 17, paddingHorizontal: 12 },

  featureCard:      { ...glassCard, borderRadius: 16, padding: 18, marginTop: 16, marginBottom: 8 },
  featureCardTitle: { fontSize: 12, fontFamily: T.FONT, color: T.TEXT_SECONDARY, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14 },
  featureList:      { gap: 12 },
  featureRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIconWrap:  { width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(9,41,173,0.30)', borderWidth: 1, borderColor: T.CYAN_DIM, alignItems: 'center', justifyContent: 'center' },
  featureText:      { fontSize: 13.5, fontFamily: T.FONT, color: 'rgba(224,242,254,0.82)', flex: 1, lineHeight: 19 },

  restoreBtn:       { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  restoreText:      { fontSize: 13, fontFamily: T.FONT, color: 'rgba(152,212,250,0.45)' },

  legalText:        { fontSize: 10, fontFamily: T.FONT, color: 'rgba(152,212,250,0.30)', textAlign: 'center', lineHeight: 15 },
});
