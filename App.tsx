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
import SimpleHomeScreen from './src/screens/SimpleHomeScreen';
import TranscriptsScreen from './src/screens/TranscriptsScreen';
import SummaryScreen from './src/screens/SummaryScreen';
import JournalScreen from './src/screens/JournalScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import PatternsScreen from './src/screens/PatternsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PinLockScreen from './src/screens/PinLockScreen';
import WisdomScreen from './src/screens/WisdomScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import { StorageService } from './src/services/StorageService';
import { getSession, supabase } from './src/services/AuthService';
import {
  setupNotificationChannel,
  scheduleNightlyNotification,
  checkAndAutoGenerate,
  generateIfNeeded,
} from './src/services/AutoSummaryService';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { initAnalytics, analyticsIdentify, analyticsReset, analyticsScreen, track } from './src/services/AnalyticsService';
import {
  configureNotificationChannel as configureSmartChannel,
  scheduleSmartNotifications,
} from './src/services/SmartNotificationService';
import { getShortsLibrary } from './src/services/SupabaseService';
import { prewarmWisdomImages } from './src/services/WisdomImageService';
import { buildFeed } from './src/services/WisdomService';
import { FeatureFlagsService } from './src/services/FeatureFlagsService';
import {
  ensureDayCloseNotificationScheduled,
  cancelDayCloseNotification,
} from './src/services/DayCloseScheduler';

// Register LiveKit WebRTC globals lazily — prevents native crash killing the app.
try {
  const livekit = require('@livekit/react-native');
  livekit.registerGlobals();
} catch (e) {
  console.warn('[LiveKit] registerGlobals failed:', e);
}

// Initialise PostHog as early as possible
try { initAnalytics(); } catch (e) { console.warn('[Analytics] init failed:', e); }

try {
  Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({
    apiKey: Platform.OS === 'ios'
      ? 'test_foX0GZ0SexqOQDuqHtMzrjCIjyC'
      : 'sk_OXaoQGNbDRvWqbUVPRdtPQAwAzPAD',
  });
} catch (e) {
  console.warn('[RevenueCat] Not available in this environment (Expo Go):', e);
}

// Register the widget task handler (Android only).
if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./src/widgets/widgetTaskHandler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (e) {
    console.warn('[Widget] registerWidgetTaskHandler failed:', e);
  }
}

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
// component tree) can navigate to the Journal tab when the widget opens the app.
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

/** Rendered inside SafeAreaProvider so useSafeAreaInsets() works correctly. */
function AppTabs() {
  const insets = useSafeAreaInsets();
  // Read redesign flags once per mount. Dev toggle → next app relaunch picks
  // it up, same cadence as any other tab-config change. Synchronous default
  // of `false` keeps startup unchanged for users without the flag.
  const [patternsOn,     setPatternsOn]     = useState(false);
  const [simpleHomeOn,   setSimpleHomeOn]   = useState(false);
  const [journalMergeOn, setJournalMergeOn] = useState(false);
  useEffect(() => {
    FeatureFlagsService.getFlag('ff_patterns_tab').then(setPatternsOn).catch(() => {});
    FeatureFlagsService.getFlag('ff_simple_home').then(setSimpleHomeOn).catch(() => {});
    FeatureFlagsService.getFlag('ff_journal_merge').then(setJournalMergeOn).catch(() => {});
  }, []);
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
      {/* Route name "Journal" stays mapped to the capture screen so existing
          deep-links (untangle://home, widget, compose) keep working. When
          ff_journal_merge is on, the capture tab relabels to "Home" so the
          merged tab can take the "Journal" label. */}
      <Tab.Screen
        name="Journal"
        component={simpleHomeOn ? SimpleHomeScreen : HomeScreen}
        options={({ navigation }) => ({
          title: 'Untangle',
          headerTitleStyle: { fontFamily: 'Baskerville', fontSize: 22, fontWeight: '500' },
          tabBarLabel: journalMergeOn ? 'Home' : 'Journal',
          tabBarIcon: ({ color }) =>
            <Feather name={journalMergeOn ? 'home' : 'mic'} size={18} color={color} />,
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
      {/* "Notes" route now hosts the merged JournalScreen when the flag is
          on. Keeping the route name means nothing else in the app needs to
          change to reach it. */}
      <Tab.Screen
        name="Notes"
        component={journalMergeOn ? JournalScreen : TranscriptsScreen}
        options={{
          headerShown: journalMergeOn ? false : undefined,
          tabBarLabel: journalMergeOn ? 'Journal' : 'Notes',
          tabBarIcon: ({ color }) =>
            <Feather name={journalMergeOn ? 'book-open' : 'file-text'} size={18} color={color} />,
        }}
      />
      {/* Summary tab is hidden from the tab bar when merged — still
          navigable programmatically so the "summary ready" banner deep-link
          continues to work on legacy flows. */}
      <Tab.Screen
        name="Summary"
        component={SummaryScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Feather name="star" size={18} color={color} />,
          ...(journalMergeOn ? { tabBarButton: () => null } : {}),
        }}
      />
      {/* Route name stays "Insights" even under the flag so existing deep-links
          (notifications, widget actions) keep working. Only the displayed
          label, icon, and component swap based on ff_patterns_tab. */}
      <Tab.Screen
        name="Insights"
        component={patternsOn ? PatternsScreen : InsightsScreen}
        options={{
          headerShown: false,
          tabBarLabel: patternsOn ? 'Patterns' : 'Insights',
          tabBarIcon: ({ color }) =>
            <Feather name={patternsOn ? 'activity' : 'trending-up'} size={18} color={color} />,
        }}
      />
      <Tab.Screen
        name="Wisdom"
        component={WisdomScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Feather name="compass" size={18} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
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

export default function App() {
  // Track whether the app has finished mounting so we can route deeplinks correctly
  const isReady = useRef(false);

  // null = still checking, true = ready
  const [ready,        setReady]        = useState<boolean | null>(null);
  // true = user is authenticated
  const [authed,       setAuthed]       = useState(false);
  // 'login' | 'signup'
  const [authScreen,   setAuthScreen]   = useState<'login' | 'signup'>('login');

  // PIN lock: true = show lock screen (PIN set + not yet verified this session)
  const [isLocked, setIsLocked] = useState(false);

  // Track previous AppState so we only re-lock on genuine background→foreground transitions
  const appStateRef = useRef(AppState.currentState);

  // Check auth session + PIN state before rendering
  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        setAuthed(!!session);
        if (session) {
          const pinSet = await StorageService.hasPinSet();
          if (pinSet) setIsLocked(true);
        }
      } catch {
        // ignore — default to showing auth
      } finally {
        setReady(true);
      }
    })();

    // Listen for auth state changes (sign in / sign out)
    // Also map RevenueCat billing identity to the Supabase user ID.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthed(!!session);
      if (session?.user?.id) {
        try { Purchases.logIn(session.user.id); } catch {}
        // Only identify on actual sign-in, not on every INITIAL_SESSION boot
        if (event === 'SIGNED_IN') {
          analyticsIdentify(session.user.id, { email: session.user.email });
        }
      } else {
        try { Purchases.logOut(); } catch {}
        track('user_signed_out');
        analyticsReset();
        // Clear per-user flags so a new account starts fresh
        AsyncStorage.multiRemove([
          'UNTANGLE_FIRST_NOTE_DONE',
          'UNTANGLE_NOTIF_OPT_IN_DONE',
        ]).catch(() => {});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ------------------------------------------------------------------
  // Widget deeplink: untangle://home
  // When the Android widget's mic button is tapped it calls
  // Linking.openURL('untangle://home').  We navigate to the Journal tab
  // so HomeScreen's useFocusEffect reads the WIDGET_MONITORING_KEY and
  // starts / stops monitoring accordingly.
  // ------------------------------------------------------------------
  const handleDeepLink = (url: string) => {
    if (!isReady.current) return;
    if (url.includes('untangle://home')) {
      navigationRef.current?.navigate('Journal');
    }
    if (url.includes('untangle://compose')) {
      navigationRef.current?.navigate('Journal', { openCompose: true } as any);
    }
    if (url.includes('untangle://wisdom')) {
      // e.g. untangle://wisdom?shortId=abc123
      const match = url.match(/[?&]shortId=([^&]+)/);
      const shortId = match ? decodeURIComponent(match[1]) : undefined;
      navigationRef.current?.navigate('Wisdom', shortId ? { shortId } : undefined);
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

    // Check if the app was cold-launched via the widget deeplink
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

    // ff_day_close_model — ensure a 23:59 "day ready" notification is
    // scheduled for tonight. If the flag is off, cancel any stale one from
    // a previous install.
    FeatureFlagsService.getFlag('ff_day_close_model').then(on => {
      if (on) ensureDayCloseNotificationScheduled().catch(() => {});
      else    cancelDayCloseNotification().catch(() => {});
    }).catch(() => {});

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

    // Schedule smart daily notification (no-op if already scheduled today or disabled)
    StorageService.getSettings().then(s => {
      if (s?.notificationsEnabled) {
        scheduleSmartNotifications(s.notificationTime).catch(() => {});
      }
    }).catch(() => {});

    // Re-check whenever app comes back to foreground, and re-lock if PIN is set
    const stateSub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      const wasBackground = appStateRef.current.match(/background|inactive/);
      appStateRef.current = nextState;
      if (nextState === 'active') {
        checkAndAutoGenerate();
        // Re-schedule smart notification on each foreground (skips if already done today)
        StorageService.getSettings().then(s => {
          if (s?.notificationsEnabled) {
            scheduleSmartNotifications(s.notificationTime).catch(() => {});
          }
        }).catch(() => {});
        // Re-ensure the 23:59 day-close notification is scheduled for tonight
        FeatureFlagsService.getFlag('ff_day_close_model').then(on => {
          if (on) ensureDayCloseNotificationScheduled().catch(() => {});
        }).catch(() => {});
        // Re-lock when returning from background
        if (wasBackground) {
          const pinSet = await StorageService.hasPinSet();
          if (pinSet) setIsLocked(true);
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

    // When the user taps a notification → route by type
    const notifSub = Notifications.addNotificationResponseReceivedListener(response => {
      if (!isReady.current) return;
      const data = response.notification.request.content.data ?? {};
      const action = data.action;
      const type   = data.type as string | undefined;

      if (action === 'view-summary') {
        navigationRef.current?.navigate('Summary');
      } else if (type === 'wisdom_short' && data.shortId) {
        navigationRef.current?.navigate('Wisdom', { shortId: data.shortId });
      } else if (type === 'week_review_ready') {
        // Route name "Journal" routes to Home or the merged Journal tab
        // depending on ff_journal_merge. The { view: 'week' } param is read
        // by JournalScreen; other screens ignore it.
        navigationRef.current?.navigate('Journal', { view: 'week' });
      } else if (type === 'wellbeing_reentry' || type === 'emotional_followup' || type === 'generic_reflection') {
        navigationRef.current?.navigate('Journal');
      } else if (type === 'recurring_thought' || type === 'values_divergence') {
        navigationRef.current?.navigate('Insights');
      } else if (type === 'tracker_nudge') {
        navigationRef.current?.navigate('Journal');
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

  // Show auth screens if not logged in
  if (ready && !authed) {
    if (authScreen === 'signup') {
      return (
        <SafeAreaProvider>
          <SignupScreen
            onSuccess={() => setAuthed(true)}
            onGoLogin={() => setAuthScreen('login')}
          />
        </SafeAreaProvider>
      );
    }
    return (
      <SafeAreaProvider>
        <LoginScreen
          onSuccess={() => setAuthed(true)}
          onGoSignup={() => setAuthScreen('signup')}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        {/* PIN lock overlay — shown on top of everything when the app is locked */}
        {isLocked && <PinLockScreen onUnlock={() => setIsLocked(false)} />}
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
}
