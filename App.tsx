// Polyfills — must be first so globals exist before any other module loads.
import './src/polyfills';

import React, { useEffect, useRef, Component, useState } from 'react';
// registerGlobals imported lazily below to prevent native crash killing the app
import { AppState, AppStateStatus, Linking, Platform, View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { Feather } from '@expo/vector-icons';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import HomeScreen from './src/screens/HomeScreen';
import JournalScreen from './src/screens/JournalScreen';
import PatternsScreen from './src/screens/PatternsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PinLockScreen from './src/screens/PinLockScreen';
import WisdomScreen from './src/screens/WisdomScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { StorageService } from './src/services/StorageService';
import { SubscriptionService } from './src/services/SubscriptionService';
import { getSession, supabase } from './src/services/AuthService';
import {
  setupNotificationChannel,
  scheduleNightlyNotification,
  checkAndAutoGenerate,
} from './src/services/AutoSummaryService';
import { initAnalytics, analyticsIdentify, analyticsReset, analyticsScreen, track } from './src/services/AnalyticsService';
import {
  configureNotificationChannel as configureSmartChannel,
  scheduleSmartNotifications,
} from './src/services/SmartNotificationService';
import { getShortsLibrary } from './src/services/SupabaseService';
import { prewarmWisdomImages } from './src/services/WisdomImageService';
import { buildFeed } from './src/services/WisdomService';
import { ensureDayCloseNotificationScheduled } from './src/services/DayCloseScheduler';
import { maybePromptForUpdate } from './src/services/InAppUpdatesService';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://7ea4c7f627c210867beb74e4a5d58eb0@o4511279422111744.ingest.us.sentry.io/4511279422308352',

  // PII OFF — journal entries are sensitive; we don't want IPs, cookies, or
  // other implicit identifiers attached to error reports.
  sendDefaultPii: false,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay. Mask everything by default — text, images, and
  // vectors are explicitly enabled so future Sentry-RN default changes can't
  // silently flip masking off and start capturing journal content.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [
    Sentry.mobileReplayIntegration({
      maskAllText: true,
      maskAllImages: true,
      maskAllVectors: true,
    }),
    Sentry.feedbackIntegration(),
  ],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Register LiveKit WebRTC globals lazily — prevents native crash killing the app.
try {
  const livekit = require('@livekit/react-native');
  livekit.registerGlobals();
} catch (e) {
  console.warn('[LiveKit] registerGlobals failed:', e);
}

// livekit/react-native-webrtc doesn't polyfill getSupportedConstraints;
// ElevenLabs calls it during session init.
if (global.navigator?.mediaDevices && typeof global.navigator.mediaDevices.getSupportedConstraints !== 'function') {
  (global.navigator.mediaDevices as any).getSupportedConstraints = () => ({
    deviceId: true, echoCancellation: true, noiseSuppression: true,
    autoGainControl: true, sampleRate: true, sampleSize: true,
    channelCount: true, latency: true, volume: true,
  });
}

// Initialise PostHog as early as possible
try { initAnalytics(); } catch (e) { console.warn('[Analytics] init failed:', e); }

// Initialise RevenueCat as early as possible so the customer-info listener is
// attached before any auth event or paywall render. No-op on platforms where
// the API key isn't supplied (iOS today). Safe to call before sign-in — RC
// starts with an anonymous identity and we call `logIn` on SIGNED_IN below.
try { SubscriptionService.configureRevenueCat(); } catch (e) { console.warn('[RevenueCat] configure failed:', e); }

// Show notifications when app is in foreground too
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const Tab = createBottomTabNavigator();

// We expose a navigation ref so the Linking handler (which lives outside the
// component tree) can navigate to the right tab when a deep-link or
// notification opens the app.
export const navigationRef = React.createRef<NavigationContainerRef<any>>();

// ── Error boundary — catches silent render crashes that would otherwise show blank ──
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={errStyles.container}>
          <Text style={errStyles.title}>Something went wrong</Text>
          <Text style={errStyles.msg}>{this.state.error.message}</Text>
          <Text style={errStyles.stack}>{this.state.error.stack?.slice(0, 800)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const errStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E', padding: 24, paddingTop: 80 },
  title: { color: '#e63946', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  msg: { color: '#f4a261', fontSize: 14, marginBottom: 12, lineHeight: 20 },
  stack: { color: 'rgba(152, 212, 250, 0.55)', fontSize: 11, lineHeight: 16 },
});

function withBoundary<P extends object>(Screen: React.ComponentType<P>): React.ComponentType<P> {
  return function BoundedScreen(props: P) {
    return <ErrorBoundary><Screen {...props} /></ErrorBoundary>;
  };
}

// Pre-wrap every screen at module level so the component reference is stable
// across AppTabs re-renders. Inline withBoundary() calls inside JSX create a
// new function on every render, causing React Navigation to unmount+remount
// the active screen whenever state updates — which crashes screens that hold
// native audio/video resources.
const BoundedHomeScreen     = withBoundary(HomeScreen);
const BoundedJournalScreen  = withBoundary(JournalScreen);
const BoundedPatternsScreen = withBoundary(PatternsScreen);
const BoundedWisdomScreen   = withBoundary(WisdomScreen);
const BoundedSettingsScreen = withBoundary(SettingsScreen);

/** Rendered inside SafeAreaProvider so useSafeAreaInsets() works correctly. */
function AppTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: 'rgba(2, 6, 14, 0.97)',
          borderTopWidth: 1,
          borderTopColor: 'rgba(152, 212, 250, 0.10)',
          // Grow the bar to cover the Android nav-button area
          height: 64 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
          paddingTop: 6,
          elevation: 0,
        },
        tabBarActiveTintColor: 'rgba(224, 242, 254, 0.95)',
        tabBarInactiveTintColor: 'rgba(152, 212, 250, 0.55)',
        tabBarLabelStyle: { fontSize: 11 },
        headerStyle: { backgroundColor: '#02060E', elevation: 0, shadowOpacity: 0 },
        headerTintColor: 'rgba(224, 242, 254, 0.95)',
        headerShadowVisible: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={BoundedHomeScreen}
        options={({ navigation }) => ({
          title: 'Untangle',
          headerTitleStyle: { fontFamily: 'Baskerville', fontSize: 22, fontWeight: '500' },
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Feather name="home" size={18} color={color} />,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              style={{ marginRight: 18, padding: 4 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="settings" size={18} color="rgba(152, 212, 250, 0.60)" />
            </TouchableOpacity>
          ),
        })}
      />
      <Tab.Screen
        name="Journal"
        component={BoundedJournalScreen}
        options={{
          headerShown: false,
          tabBarLabel: 'Journal',
          tabBarIcon: ({ color }) => <Feather name="book-open" size={18} color={color} />,
        }}
      />
      <Tab.Screen
        name="Patterns"
        component={BoundedPatternsScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Feather name="activity" size={18} color={color} />,
        }}
      />
      <Tab.Screen
        name="Wisdom"
        component={BoundedWisdomScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Feather name="compass" size={18} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={BoundedSettingsScreen}
        options={({ navigation }) => ({
          title: 'Settings',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ marginLeft: 16, padding: 4 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="chevron-left" size={22} color="rgba(152, 212, 250, 0.80)" />
            </TouchableOpacity>
          ),
          // Hide from the tab bar — accessed via the gear icon only
          tabBarButton: () => null,
          tabBarStyle: { display: 'none' },
        })}
      />
    </Tab.Navigator>
  );
}

export default Sentry.wrap(function App() {
  // Track whether the app has finished mounting so we can route deeplinks correctly
  const isReady = useRef(false);

  // null = still checking, true = ready
  const [ready,        setReady]        = useState<boolean | null>(null);
  // true = user is authenticated
  const [authed,       setAuthed]       = useState(false);
  // 'login' | 'signup'
  const [authScreen,   setAuthScreen]   = useState<'login' | 'signup'>('login');
  // null = still checking; false = first launch, show OnboardingScreen;
  // true = flag present, skip onboarding on subsequent launches.
  const [onboarded,    setOnboarded]    = useState<boolean | null>(null);

  // PIN lock: true = show lock screen (PIN set + not yet verified this session)
  const [isLocked, setIsLocked] = useState(false);

  // Mirror isLocked into a ref so the deep-link / notification handlers
  // (which capture closures at subscribe time) see the current value.
  const isLockedRef = useRef(false);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);

  // Mirror authed into a ref so the AppState 'active' handler (registered
  // once after `ready`) doesn't re-schedule notifications after sign-out.
  const authedRef = useRef(false);
  useEffect(() => { authedRef.current = authed; }, [authed]);

  // Deep-links and notification taps that arrive while the app is PIN-locked
  // are queued here and replayed after unlock — otherwise navigation happens
  // behind the lock screen and sensitive params (wellbeing tier, emotion,
  // etc.) are processed before the user has authenticated.
  const pendingActionsRef = useRef<Array<() => void>>([]);
  const runOrQueue = (action: () => void) => {
    if (isLockedRef.current) {
      pendingActionsRef.current.push(action);
    } else {
      action();
    }
  };

  // Track previous AppState so we only re-lock on genuine background→foreground transitions
  const appStateRef = useRef(AppState.currentState);

  // Check auth session + PIN state + onboarding flag before rendering
  useEffect(() => {
    (async () => {
      try {
        const [session, onboardFlag] = await Promise.all([
          getSession(),
          AsyncStorage.getItem('onboarding_complete'),
        ]);
        setAuthed(!!session);
        setOnboarded(onboardFlag === '1');
        if (session) {
          const pinSet = await StorageService.hasPinSet();
          if (pinSet) setIsLocked(true);
        }
      } catch {
        // ignore — default to showing auth
        setOnboarded(true); // don't trap the user behind onboarding on read failure
      } finally {
        setReady(true);
      }
    })();

    // Listen for auth state changes (sign in / sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthed(!!session);
      if (session?.user?.id) {
        // Anchor trial calculation to the server-side created_at so it can't
        // be reset by uninstall/reinstall or by clearing AsyncStorage. Runs
        // on both INITIAL_SESSION and SIGNED_IN so existing users get
        // backfilled on next launch.
        if (session.user.created_at) {
          SubscriptionService.setUserCreatedAt(session.user.created_at).catch(() => {});
        }
        // Identify the user with RevenueCat so entitlements survive reinstall
        // and follow the user across devices. Runs on both INITIAL_SESSION
        // (rebind on every cold start) and SIGNED_IN (fresh login). Pulls
        // the latest entitlement state and updates the local subscribed flag.
        SubscriptionService.identifyUser(session.user.id).catch(() => {});
        // Only identify on actual sign-in, not on every INITIAL_SESSION boot
        if (event === 'SIGNED_IN') {
          analyticsIdentify(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        // Wipe every per-user AsyncStorage key (transcripts, summaries, PIN,
        // expenses, goals, subscription state, etc.) so a different account
        // signing in on the same device starts truly fresh — and so the
        // previous user's PIN doesn't lock the new user out.
        track('user_signed_out');
        analyticsReset();
        // Reset PIN-lock state explicitly: the prior user's PIN is now
        // cleared, but the cached `isLocked=true` would otherwise render a
        // lock screen with nothing to verify against.
        setIsLocked(false);
        // Revert RC to anonymous BEFORE wiping AsyncStorage. RC's customer-
        // info listener writes `sub_is_subscribed` after logOut() — if that
        // write lands after clearAllUserData(), it leaves a stray key behind
        // for the next user to inherit. Chain them to enforce the order.
        SubscriptionService.logoutUser()
          .catch(() => {})
          .then(() => StorageService.clearAllUserData())
          .then(() => Notifications.cancelAllScheduledNotificationsAsync().catch(() => {}))
          .catch(() => {});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ------------------------------------------------------------------
  // Deep-link handler for the `untangle://` URL scheme. Used by:
  //   • untangle://home    — focus Home tab
  //   • untangle://compose — focus Home and open the compose modal
  //   • untangle://wisdom  — focus Wisdom tab (optional ?shortId=...)
  // ------------------------------------------------------------------
  const handleDeepLink = (url: string) => {
    if (!isReady.current) return;
    if (url.includes('untangle://home')) {
      runOrQueue(() => navigationRef.current?.navigate('Home'));
    }
    if (url.includes('untangle://compose')) {
      runOrQueue(() => navigationRef.current?.navigate('Home', { openCompose: true } as any));
    }
    if (url.includes('untangle://wisdom')) {
      // e.g. untangle://wisdom?shortId=abc123
      const match = url.match(/[?&]shortId=([^&]+)/);
      const shortId = match ? decodeURIComponent(match[1]) : undefined;
      runOrQueue(() => navigationRef.current?.navigate('Wisdom', shortId ? { shortId } : undefined));
    }
  };

  // Deeplink + notifications + mic permission — only after ready
  useEffect(() => {
    if (!ready) return;

    // Request microphone permission at app startup so the OS dialog appears
    // on first launch rather than only when the user taps the mic button.
    // (OnboardingScreen handles this for new users; this is a safety net for upgrades.)
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status === 'denied') {
        Alert.alert(
          'Microphone Access Needed',
          'untangle uses the microphone to record your voice. Please enable it in Settings.',
          [
            { text: 'Not Now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
      }
    })();

    // Check if the app was cold-launched via a deeplink
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink(url);
    });

    // Listen for deeplinks while app is already open
    const linkSub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    // Bootstrap notification channels + nightly schedule on first launch
    setupNotificationChannel();
    configureSmartChannel();
    scheduleNightlyNotification();
    // Auto-generate for yesterday / tonight if applicable
    checkAndAutoGenerate();

    // Ensure a 23:59 "day ready" notification is scheduled for tonight.
    ensureDayCloseNotificationScheduled().catch(() => {});

    // Ask Google Play if a newer version is available; if so, kick off
    // the in-app flexible update flow. No-op for sideloaded / dev builds.
    maybePromptForUpdate().catch(() => {});

    // Pre-warm images for the first 5 wisdom shorts the user will see.
    // Runs fire-and-forget so startup is never delayed.
    (async () => {
      try {
        const library = await getShortsLibrary();
        const signal = await StorageService.getJournalSignal();
        const seenIds = new Set(await StorageService.getSeenShortIds());
        const savedIds = new Set(
          (await StorageService.getSavedShorts()).map(s => s.shortId),
        );
        const feed = buildFeed(signal, savedIds, seenIds, undefined, library);
        const ordered = [...feed.acute, ...feed.dispositional, ...feed.stretch];
        prewarmWisdomImages(ordered, 5).catch(() => {});
      } catch {
        // Never block startup
      }
    })();

    // Schedule smart daily notification (no-op if already scheduled today).
    // Default-on: undefined notificationsEnabled is treated as true, so new
    // installs and existing users get the daily reminder without opting in.
    // Request permission on first launch if still undetermined.
    (async () => {
      try {
        const s = await StorageService.getSettings();
        const enabled = s?.notificationsEnabled ?? true;
        if (!enabled) return;
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
        scheduleSmartNotifications(s?.notificationTime).catch(() => {});
      } catch {}
    })();

    // Re-check whenever app comes back to foreground, and re-lock if PIN is set
    const stateSub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      const wasBackground = appStateRef.current.match(/background|inactive/);
      appStateRef.current = nextState;
      if (nextState === 'active') {
        // Skip user-data work if no one is signed in — otherwise post-logout
        // foregrounds re-schedule notifications and re-run summary catch-up
        // for an account that no longer exists locally.
        if (authedRef.current) {
          checkAndAutoGenerate();
          // Re-schedule smart notification on each foreground (skips if already done today).
          // Default-on: undefined notificationsEnabled is treated as true.
          StorageService.getSettings().then(s => {
            const enabled = s?.notificationsEnabled ?? true;
            if (enabled) {
              scheduleSmartNotifications(s?.notificationTime).catch(() => {});
            }
          }).catch(() => {});
          // Re-ensure the 23:59 day-close notification is scheduled for tonight
          ensureDayCloseNotificationScheduled().catch(() => {});
          // Re-lock when returning from background
          if (wasBackground) {
            const pinSet = await StorageService.hasPinSet();
            if (pinSet) setIsLocked(true);
          }
        }
      }
    });

    // Foreground notification listener. Most inbound notifications are a
    // no-op at the JS layer (they're user-visible). The day-close notif is
    // the one case where we do work on receipt: fire `generateIfNeeded` so
    // a user who happens to be in-app at 23:59 sees the summary materialise
    // immediately instead of needing to background/foreground.
    const notifReceivedSub = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data ?? {};
      if (data?.type === 'summary_ready' && typeof data.date === 'string') {
        // Fire-and-forget — AutoSummaryService.generateIfNeeded no-ops when
        // there are no stale entries, so this is safe to call.
        import('./src/services/AutoSummaryService')
          .then(mod => mod.generateIfNeeded(data.date as string, true))
          .catch(() => {});
      }
    });

    // When the user taps a notification → route by type. If the app is
    // PIN-locked, queue the navigation and replay it after unlock so
    // sensitive params (wellbeing tier, emotion, tracker) aren't processed
    // behind the lock screen.
    const notifSub = Notifications.addNotificationResponseReceivedListener(response => {
      if (!isReady.current) return;
      const data = response.notification.request.content.data ?? {};
      const action = data.action;
      const type   = data.type as string | undefined;

      if (action === 'view-summary' && typeof data.date === 'string') {
        // Land on Journal with the specific day open so the summary the
        // notification refers to is immediately visible.
        runOrQueue(() => navigationRef.current?.navigate('Journal', { jumpToDate: data.date }));
      } else if (action === 'view-summary') {
        runOrQueue(() => navigationRef.current?.navigate('Journal'));
      } else if (type === 'wisdom_short' && data.shortId) {
        runOrQueue(() => navigationRef.current?.navigate('Wisdom', { shortId: data.shortId }));
      } else if (type === 'week_review_ready') {
        runOrQueue(() => navigationRef.current?.navigate('Journal', { view: 'week' }));
      } else if (type === 'tracker_nudge') {
        // Drop the user straight into the compose flow so they can log the
        // tracker the notification was nudging about, instead of stranding
        // them on Home with no obvious next step.
        runOrQueue(() => navigationRef.current?.navigate('Home', {
          openCompose: true,
          composeTracker: data.tracker,
        }));
      } else if (type === 'wellbeing_reentry' || type === 'emotional_followup') {
        // The notification asks how the user is feeling — open compose so
        // the next tap is "voice it out" rather than "find the right tab".
        runOrQueue(() => navigationRef.current?.navigate('Home', {
          openCompose: true,
          composeReason: type,
          composeEmotion: data.emotion,
          composeTier: data.tier,
        }));
      } else if (type === 'generic_reflection') {
        runOrQueue(() => navigationRef.current?.navigate('Home', { openCompose: true }));
      } else if (type === 'recurring_thought' || type === 'values_divergence') {
        runOrQueue(() => navigationRef.current?.navigate('Patterns'));
      }
    });

    return () => {
      linkSub.remove();
      stateSub.remove();
      notifReceivedSub.remove();
      notifSub.remove();
    };
  }, [ready]);

  // Still checking PIN state — render blank splash
  if (!ready) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: '#02060E' }} />
      </SafeAreaProvider>
    );
  }

  // First-launch onboarding — shown before login/signup. OnboardingScreen
  // persists `onboarding_complete` itself; we flip state to unmount it and
  // default the user to the signup screen since they just chose to begin.
  if (ready && onboarded === false) {
    return (
      <ErrorBoundary>
        <SafeAreaProvider>
          <OnboardingScreen
            onComplete={() => {
              setOnboarded(true);
              setAuthScreen('signup');
            }}
          />
        </SafeAreaProvider>
      </ErrorBoundary>
    );
  }

  // Show auth screens if not logged in
  if (ready && !authed) {
    if (authScreen === 'signup') {
      return (
        <ErrorBoundary>
          <SafeAreaProvider>
            <SignupScreen
              onSuccess={() => setAuthed(true)}
              onGoLogin={() => setAuthScreen('login')}
            />
          </SafeAreaProvider>
        </ErrorBoundary>
      );
    }
    return (
      <ErrorBoundary>
        <SafeAreaProvider>
          <LoginScreen
            onSuccess={() => setAuthed(true)}
            onGoSignup={() => setAuthScreen('signup')}
          />
        </SafeAreaProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        {/* PIN lock overlay — shown on top of everything when the app is locked */}
        {isLocked && (
          <PinLockScreen
            onUnlock={() => {
              setIsLocked(false);
              isLockedRef.current = false;
              // Replay any deep-link or notification taps that arrived while
              // the lock screen was up.
              const queued = pendingActionsRef.current;
              pendingActionsRef.current = [];
              queued.forEach(fn => { try { fn(); } catch {} });
            }}
          />
        )}
        <NavigationContainer
          ref={navigationRef}
          onReady={() => { isReady.current = true; }}
          onStateChange={() => {
            const current = navigationRef.current?.getCurrentRoute();
            if (current?.name) analyticsScreen(current.name);
          }}
        >
          <StatusBar style="light" />
          <AppTabs />
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
});
