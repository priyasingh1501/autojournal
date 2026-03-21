import React, { useEffect, useRef, Component } from 'react';
import { AppState, AppStateStatus, Linking, Platform, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import HomeScreen from './src/screens/HomeScreen';
import TranscriptsScreen from './src/screens/TranscriptsScreen';
import SummaryScreen from './src/screens/SummaryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import {
  setupNotificationChannel,
  scheduleNightlyNotification,
  checkAndAutoGenerate,
  generateIfNeeded,
} from './src/services/AutoSummaryService';

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

  // ------------------------------------------------------------------
  // Widget deeplink: untangle://home
  // When the Android widget's mic button is tapped it calls
  // Linking.openURL('untangle://home').  We navigate to the Journal tab
  // so HomeScreen's useFocusEffect reads the WIDGET_MONITORING_KEY and
  // starts / stops monitoring accordingly.
  // ------------------------------------------------------------------
  const handleDeepLink = (url: string) => {
    if (url.includes('untangle://home') && isReady.current) {
      navigationRef.current?.navigate('Journal');
    }
  };

  useEffect(() => {
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

    // Re-check whenever app comes back to foreground
    const stateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') checkAndAutoGenerate();
    });

    // When the 11:59 PM notification is DELIVERED (not tapped), generate the summary.
    // This fires whether the app is in the foreground or background.
    const notifReceivedSub = Notifications.addNotificationReceivedListener(notification => {
      const action = notification.request.content.data?.action;
      if (action === 'generate-summary') {
        const today = new Date().toISOString().split('T')[0];
        generateIfNeeded(today); // fire-and-forget; sends a "ready" notification when done
      }
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
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
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
              headerStyle: { backgroundColor: '#02060E', elevation: 0, shadowOpacity: 0 },
              headerTintColor: 'rgba(224, 242, 254, 0.95)',
              headerShadowVisible: false,
            }}
          >
            <Tab.Screen
              name="Journal"
              component={HomeScreen}
              options={{
                title: 'Untangle',
                headerTitleStyle: { fontFamily: 'Baskerville', fontSize: 22, fontWeight: '500' },
                tabBarIcon: ({ color }) => <Feather name="mic" size={18} color={color} />,
              }}
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
              name="Settings"
              component={SettingsScreen}
              options={{
                tabBarIcon: ({ color }) => <Feather name="settings" size={18} color={color} />,
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
