/**
 * SubscriptionService — manages free trial, usage gates, and Pro subscription state.
 *
 * Pricing:
 *   - 14-day free trial of everything on first install
 *   - Free tier after trial: 3 AI summaries/week, 1 insight generate per tab (soft gate), 1 conversation session
 *   - Pro: monthly or annual (real prices fetched from RevenueCat / Google Play; localized per region)
 *
 * Soft gate: the first use of each Pro feature is always free so users experience the value
 * before hitting the paywall on any subsequent use.
 *
 * RevenueCat config (Android only — iOS purchases are not wired yet):
 *   Entitlement: 'pro'
 *   Offering:    'default'
 *   Packages:    '$rc_monthly' → product 'untangle_pro_monthly'
 *                '$rc_annual'  → product 'untangle_pro_annual'
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Lazy-require `react-native-purchases` so that a missing or improperly
// linked native module CANNOT crash the app at import time. A previous
// build crashed on launch because the static import bound to a native
// module that wasn't present; this guard is the antidote — RC becomes
// gracefully degraded (paywalls show fallback prices, purchase throws a
// clear user-facing message) instead of taking the whole app down.
type RNPurchases = typeof import('react-native-purchases');
type PurchasesOffering = import('react-native-purchases').PurchasesOffering;
type PurchasesPackage = import('react-native-purchases').PurchasesPackage;

let RC: RNPurchases | null = null;
try {
  RC = require('react-native-purchases');
} catch (e) {
  console.warn('[RevenueCat] Native module not available; subscriptions disabled.', e);
}

export type InsightTab = 'you' | 'values' | 'thinking' | 'story' | 'patterns';
export type ProPlan = 'monthly' | 'annual';

const TRIAL_DAYS = 14;
const FREE_SUMMARIES_PER_WEEK = 3;

// RC identifiers — must match the dashboard config exactly.
const ENTITLEMENT_ID = 'pro';
const OFFERING_ID = 'default';
const PKG_MONTHLY = '$rc_monthly';
const PKG_ANNUAL = '$rc_annual';

const KEYS = {
  INSTALL_DATE:        'sub_install_date',         // legacy device-local fallback only
  USER_CREATED_AT:     'sub_user_created_at',      // server-authoritative (supabase user.created_at)
  IS_SUBSCRIBED:       'sub_is_subscribed',
  SUMMARIES_USAGE:     'sub_summaries_usage',      // JSON: { weekKey: string, count: number }
  INSIGHTS_GENERATED:  'sub_insights_generated',   // JSON: { you: bool, values: bool, thinking: bool, story: bool }
  CONVERSATION_USED:   'sub_conversation_used',
};

// ── RevenueCat lifecycle ──────────────────────────────────────────────────────

/**
 * The RC SDK reference. Resolves the default export shape regardless of
 * whether the lazy require returned an ES module or CommonJS shape.
 * Returns null if the native module failed to load.
 */
function getPurchases(): any {
  if (!RC) return null;
  return (RC as any).default ?? RC;
}

/** True iff RC loaded, the platform is supported, and an API key was supplied. */
function isRcAvailable(): boolean {
  return Platform.OS === 'android'
    && !!process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
    && !!getPurchases();
}

let rcConfigured = false;

/**
 * Initialise the RevenueCat SDK. Safe to call multiple times — only the first
 * call configures. Must be called as early as possible so the customer-info
 * listener can react to entitlement changes that happen before any purchase
 * UI is shown (e.g. a renewal that completed in the background).
 *
 * Wrapped in try/catch so a misbehaving native module can never crash app
 * startup; on failure RC stays unconfigured and the rest of the app works
 * (trial gating, free-tier limits, etc.) — only paywall purchase actions
 * surface a user-facing "subscriptions unavailable" message.
 */
function configureRevenueCat(): void {
  if (rcConfigured || !isRcAvailable()) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY!;
    const LOG_LEVEL = (RC as any)?.LOG_LEVEL;
    if (__DEV__ && LOG_LEVEL && typeof Purchases.setLogLevel === 'function') {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
    Purchases.configure({ apiKey });
    rcConfigured = true;

    // Keep the local AsyncStorage flag in sync with the server-authoritative
    // entitlement state — covers renewals, billing failures, and refunds that
    // happen outside an active purchase flow.
    try {
      Purchases.addCustomerInfoUpdateListener((info: any) => {
        const isActive = !!info?.entitlements?.active?.[ENTITLEMENT_ID];
        AsyncStorage.setItem(KEYS.IS_SUBSCRIBED, isActive ? 'true' : 'false').catch(() => {});
      });
    } catch (e) {
      console.warn('[RevenueCat] addCustomerInfoUpdateListener failed', e);
    }
  } catch (e) {
    console.warn('[RevenueCat] configure failed; subscriptions disabled.', e);
  }
}

/**
 * Identify the RC user with the supabase user id so entitlements survive
 * reinstall and follow the user across devices. Idempotent.
 */
async function identifyUser(userId: string): Promise<void> {
  if (!rcConfigured || !userId) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    const isActive = !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
    await AsyncStorage.setItem(KEYS.IS_SUBSCRIBED, isActive ? 'true' : 'false');
  } catch {}
}

/** Revert RC to an anonymous identity. Called on supabase sign-out. */
async function logoutUser(): Promise<void> {
  if (!rcConfigured) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logOut();
  } catch {}
}

/** Pull the current RC entitlement state and persist it locally. */
async function syncSubscriptionFromRC(): Promise<void> {
  if (!rcConfigured) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    const info = await Purchases.getCustomerInfo();
    const isActive = !!info?.entitlements?.active?.[ENTITLEMENT_ID];
    await AsyncStorage.setItem(KEYS.IS_SUBSCRIBED, isActive ? 'true' : 'false');
  } catch {}
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** ISO date string for the Sunday that starts the current week. */
function currentWeekKey(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

/**
 * Returns the trial-anchor date. Prefers the supabase `user.created_at`
 * (server-authoritative — survives reinstall, can't be reset by wiping
 * AsyncStorage), falls back to the legacy device-local install date if a
 * cached created_at is not yet available (e.g. offline first-launch).
 */
async function getOrSetInstallDate(): Promise<Date> {
  const serverAnchor = await AsyncStorage.getItem(KEYS.USER_CREATED_AT);
  if (serverAnchor) return new Date(serverAnchor);

  let stored = await AsyncStorage.getItem(KEYS.INSTALL_DATE);
  if (!stored) {
    stored = new Date().toISOString();
    await AsyncStorage.setItem(KEYS.INSTALL_DATE, stored);
  }
  return new Date(stored);
}

/**
 * Cache the supabase user's `created_at` so trial calculations anchor to a
 * server timestamp instead of a device-local install date. Called on sign-in.
 * No-op if the value is already cached (created_at never changes for a user).
 */
async function setUserCreatedAt(createdAtIso: string): Promise<void> {
  if (!createdAtIso) return;
  const existing = await AsyncStorage.getItem(KEYS.USER_CREATED_AT);
  if (existing === createdAtIso) return;
  await AsyncStorage.setItem(KEYS.USER_CREATED_AT, createdAtIso);
}

// ── Trial & subscription status ───────────────────────────────────────────────

async function isInTrial(): Promise<boolean> {
  const install = await getOrSetInstallDate();
  const daysDiff = (Date.now() - install.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff < TRIAL_DAYS;
}

async function isSubscribed(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.IS_SUBSCRIBED)) === 'true';
}

/** Returns true when the user has unrestricted access (trial or active subscription). */
async function hasPro(): Promise<boolean> {
  return (await isInTrial()) || (await isSubscribed());
}

/** Days left in the free trial (0 if expired or subscribed). */
async function getTrialDaysRemaining(): Promise<number> {
  if (await isSubscribed()) return 0;
  const install = await getOrSetInstallDate();
  const daysDiff = (Date.now() - install.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(TRIAL_DAYS - daysDiff));
}

// ── AI Summaries gate ─────────────────────────────────────────────────────────

async function getSummaryUsage(): Promise<{ weekKey: string; count: number }> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SUMMARIES_USAGE);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { weekKey: currentWeekKey(), count: 0 };
}

async function getWeeklySummaryCount(): Promise<number> {
  const usage = await getSummaryUsage();
  if (usage.weekKey !== currentWeekKey()) return 0;
  return usage.count;
}

async function canGenerateSummary(): Promise<boolean> {
  if (await hasPro()) return true;
  const usage = await getSummaryUsage();
  if (usage.weekKey !== currentWeekKey()) return true; // new week resets the count
  return usage.count < FREE_SUMMARIES_PER_WEEK;
}

async function recordSummaryGenerated(): Promise<void> {
  const usage = await getSummaryUsage();
  const weekKey = currentWeekKey();
  await AsyncStorage.setItem(
    KEYS.SUMMARIES_USAGE,
    JSON.stringify({
      weekKey,
      count: usage.weekKey === weekKey ? usage.count + 1 : 1,
    }),
  );
}

// ── Insights gate ─────────────────────────────────────────────────────────────

async function getInsightsGenerated(): Promise<Record<InsightTab, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.INSIGHTS_GENERATED);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { you: false, values: false, thinking: false, story: false, patterns: false };
}

/**
 * First generate per tab is always free (soft gate).
 * Any regeneration (tab already generated once) requires Pro.
 */
async function canGenerateInsight(tab: InsightTab): Promise<boolean> {
  if (await hasPro()) return true;
  const generated = await getInsightsGenerated();
  return !generated[tab];
}

async function recordInsightGenerated(tab: InsightTab): Promise<void> {
  const generated = await getInsightsGenerated();
  generated[tab] = true;
  await AsyncStorage.setItem(KEYS.INSIGHTS_GENERATED, JSON.stringify(generated));
}

// ── Conversation gate ─────────────────────────────────────────────────────────

/** First conversation session (Call or Chat) is free. Subsequent sessions require Pro. */
async function canUseConversation(): Promise<boolean> {
  if (await hasPro()) return true;
  return (await AsyncStorage.getItem(KEYS.CONVERSATION_USED)) !== 'true';
}

async function recordConversationUsed(): Promise<void> {
  await AsyncStorage.setItem(KEYS.CONVERSATION_USED, 'true');
}

// ── Offerings (paywall pricing) ───────────────────────────────────────────────

export interface PlanPricing {
  monthly?: { priceString: string; pricePerMonth: number };
  annual?:  { priceString: string; pricePerMonth: number; pricePerMonthString: string; savingsPct: number };
}

async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!rcConfigured) return null;
  const Purchases = getPurchases();
  if (!Purchases) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings?.current ?? offerings?.all?.[OFFERING_ID] ?? null;
  } catch {
    return null;
  }
}

/**
 * Format an amount in the same currency as a reference product's priceString
 * (e.g. "₹199" → format(99.92) returns "₹99.92"). We do this by string-replacing
 * the numeric portion of the reference, which preserves the currency symbol
 * and locale formatting that RC already returns from the store.
 */
function formatLikeRef(amount: number, refPriceString: string): string {
  // Match the first numeric run (with optional decimals/commas) in the reference.
  const m = refPriceString.match(/[\d,]+(?:\.\d+)?/);
  if (!m) return amount.toFixed(2);
  return refPriceString.replace(m[0], amount.toFixed(2));
}

/**
 * Returns localized prices for monthly + annual plans pulled live from
 * RC / Google Play. Returns an empty object if RC isn't configured or
 * offerings haven't loaded — callers should fall back to hardcoded copy.
 */
async function getPlanPricing(): Promise<PlanPricing> {
  const offering = await getCurrentOffering();
  if (!offering) return {};

  const monthlyPkg = offering.availablePackages.find(p => p.identifier === PKG_MONTHLY);
  const annualPkg  = offering.availablePackages.find(p => p.identifier === PKG_ANNUAL);

  const result: PlanPricing = {};

  if (monthlyPkg) {
    result.monthly = {
      priceString:   monthlyPkg.product.priceString,
      pricePerMonth: monthlyPkg.product.price,
    };
  }

  if (annualPkg) {
    const pricePerMonth = annualPkg.product.price / 12;
    const pricePerMonthString = formatLikeRef(pricePerMonth, annualPkg.product.priceString);
    const savingsPct = monthlyPkg
      ? Math.max(0, Math.round(100 - (annualPkg.product.price / (monthlyPkg.product.price * 12)) * 100))
      : 0;
    result.annual = {
      priceString: annualPkg.product.priceString,
      pricePerMonth,
      pricePerMonthString,
      savingsPct,
    };
  }

  return result;
}

// ── Purchase ──────────────────────────────────────────────────────────────────

/**
 * Trigger the Play Billing purchase flow for the selected plan.
 * Returns true on success, false if the user dismissed the Play sheet.
 * Throws on any other error (no offering, payment declined, etc.).
 */
async function purchasePro(plan: ProPlan): Promise<boolean> {
  if (!isRcAvailable()) {
    throw new Error('In-app purchases are not available on this platform yet.');
  }
  if (!rcConfigured) {
    throw new Error('Subscriptions are still loading. Please try again in a moment.');
  }
  const Purchases = getPurchases();
  if (!Purchases) {
    throw new Error('In-app purchases are not available on this build.');
  }

  const offering = await getCurrentOffering();
  if (!offering) {
    throw new Error('No subscription plans are available right now. Please try again later.');
  }

  const packageId = plan === 'monthly' ? PKG_MONTHLY : PKG_ANNUAL;
  const pkg: PurchasesPackage | undefined = offering.availablePackages.find(p => p.identifier === packageId);
  if (!pkg) {
    throw new Error(`The ${plan} plan is not available right now.`);
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isActive = !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
    await AsyncStorage.setItem(KEYS.IS_SUBSCRIBED, isActive ? 'true' : 'false');
    return isActive;
  } catch (e: any) {
    // User dismissed the Play sheet — not an error, just a non-purchase.
    if (e?.userCancelled) return false;
    throw e;
  }
}

/** Pull existing entitlements for the signed-in user (e.g. after reinstall). */
async function restorePurchases(): Promise<boolean> {
  if (!isRcAvailable()) {
    throw new Error('In-app purchases are not available on this platform yet.');
  }
  if (!rcConfigured) {
    throw new Error('Subscriptions are still loading. Please try again in a moment.');
  }
  const Purchases = getPurchases();
  if (!Purchases) {
    throw new Error('In-app purchases are not available on this build.');
  }

  const customerInfo = await Purchases.restorePurchases();
  const isActive = !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
  await AsyncStorage.setItem(KEYS.IS_SUBSCRIBED, isActive ? 'true' : 'false');
  return isActive;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const SubscriptionService = {
  // RC lifecycle
  configureRevenueCat,
  identifyUser,
  logoutUser,
  syncSubscriptionFromRC,

  // status
  isInTrial,
  isSubscribed,
  hasPro,
  getTrialDaysRemaining,
  setUserCreatedAt,

  // gates
  canGenerateSummary,
  recordSummaryGenerated,
  getWeeklySummaryCount,

  canGenerateInsight,
  recordInsightGenerated,

  canUseConversation,
  recordConversationUsed,

  // pricing & purchase
  getPlanPricing,
  purchasePro,
  restorePurchases,

  TRIAL_DAYS,
  FREE_SUMMARIES_PER_WEEK,
};
