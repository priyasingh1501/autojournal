import React, { useEffect, useRef, Component, useState } from 'react';
import { AppState, AppStateStatus, Linking, Platform, View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Audio } from 'expo-av';
import { Feather } from '@expo/vector-icons';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import HomeScreen from './src/screens/HomeScreen';
import TranscriptsScreen from './src/screens/TranscriptsScreen';
import SummaryScreen from './src/screens/SummaryScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PinLockScreen from './src/screens/PinLockScreen';
import WisdomScreen from './src/screens/WisdomScreen';
import { StorageService } from './src/services/StorageService';
import {
  setupNotificationChannel,
  scheduleNightlyNotification,
  checkAndAutoGenerate,
  generateIfNeeded,
} from './src/services/AutoSummaryService';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

try {
  Purchases.setLogLevel(LOG_LEVEL.DEBUG); // remove before production
  Purchases.configure({
    apiKey: Platform.OS === 'ios'
      ? 'test_foX0GZ0SexqOQDuqHtMzrjCIjyC'
      : 'sk_OXaoQGNbDRvWqbUVPRdtPQAwAzPAD',
  });
} catch (e) {
  console.warn('[RevenueCat] Not available in this environment (Expo Go):', e);
}

// Register the widget task handler (Android only).
// This must be called at the top of App so the background service can invoke
// widgetTaskHandler even when the UI is not fully mounted.
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widgets/widgetTaskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
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

export default function App() {
  // Track whether the app has finished mounting so we can route deeplinks correctly
  const isReady = useRef(false);

  // null = still checking PIN, true = ready
  const [ready, setReady] = useState<boolean | null>(null);

  // PIN lock: true = show lock screen (PIN set + not yet verified this session)
  const [isLocked, setIsLocked] = useState(false);

  // Track previous AppState so we only re-lock on genuine background→foreground transitions
  const appStateRef = useRef(AppState.currentState);

  // Check PIN state before rendering
  useEffect(() => {
    (async () => {
      try {
        const pinSet = await StorageService.hasPinSet();
        if (pinSet) setIsLocked(true);
      } catch {
        // ignore
      } finally {
        setReady(true);
      }
    })();
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
      // Navigate to Journal tab, then open the compose modal via params
      navigationRef.current?.navigate('Journal', { openCompose: true } as any);
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

    // Bootstrap notification channel + nightly schedule on first launch
    setupNotificationChannel();
    scheduleNightlyNotification();
    // Auto-generate for yesterday / tonight if applicable
    checkAndAutoGenerate();

    // Re-check whenever app comes back to foreground, and re-lock if PIN is set
    const stateSub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      const wasBackground = appStateRef.current.match(/background|inactive/);
      appStateRef.current = nextState;
      if (nextState === 'active') {
        checkAndAutoGenerate();
        // Re-lock when returning from background
        if (wasBackground) {
          const pinSet = await StorageService.hasPinSet();
          if (pinSet) setIsLocked(true);
        }
      }
    });

    // Nightly "generate-summary" notification removed — generation now happens on
    // morning app-open via checkAndAutoGenerate. Listener kept as a no-op stub so
    // any residual scheduled notifications from older builds don't cause errors.
    const notifReceivedSub = Notifications.addNotificationReceivedListener(_notification => {
      // no-op — nightly trigger notification is no longer scheduled
    });

    // When the user taps the "summary ready" notification → navigate to Summary tab
    const notifSub = Notifications.addNotificationResponseReceivedListener(response => {
      const action = response.notification.request.content.data?.action;
      if (action === 'view-summary' && isReady.current) {
        navigationRef.current?.navigate('Summary');
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

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        {/* PIN lock overlay — shown on top of everything when the app is locked */}
        {isLocked && <PinLockScreen onUnlock={() => setIsLocked(false)} />}
        <NavigationContainer
          ref={navigationRef}
          onReady={() => { isReady.current = true; }}
        >
          <StatusBar style="light" />
          <Tab.Navigator
            screenOptions={{
              tabBarStyle: {
                backgroundColor: 'rgba(2, 6, 14, 0.97)',
                borderTopWidth: 1,
                borderTopColor: 'rgba(152, 212, 250, 0.10)',
                height: 64,
                paddingBottom: 10,
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
              name="Journal"
              component={HomeScreen}
              options={({ navigation }) => ({
                title: 'Untangle',
                headerTitleStyle: { fontFamily: 'Baskerville', fontSize: 22, fontWeight: '500' },
                tabBarIcon: ({ color }) => <Feather name="mic" size={18} color={color} />,
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
              name="Notes"
              component={TranscriptsScreen}
              options={{
                tabBarIcon: ({ color }) => <Feather name="file-text" size={18} color={color} />,
              }}
            />
            <Tab.Screen
              name="Summary"
              component={SummaryScreen}
              options={{
                headerShown: false,
                tabBarIcon: ({ color }) => <Feather name="star" size={18} color={color} />,
              }}
            />
            <Tab.Screen
              name="Insights"
              component={InsightsScreen}
              options={{
                headerShown: false,
                tabBarIcon: ({ color }) => <Feather name="trending-up" size={18} color={color} />,
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
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
