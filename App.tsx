import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Linking, Platform, Text } from 'react-native';
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

export default function App() {
  // Track whether the app has finished mounting so we can route deeplinks correctly
  const isReady = useRef(false);

  // ------------------------------------------------------------------
  // Widget deeplink: autojournal://home
  // When the Android widget's mic button is tapped it calls
  // Linking.openURL('autojournal://home').  We navigate to the Journal tab
  // so HomeScreen's useFocusEffect reads the WIDGET_MONITORING_KEY and
  // starts / stops monitoring accordingly.
  // ------------------------------------------------------------------
  const handleDeepLink = (url: string) => {
    if (url.includes('autojournal://home') && isReady.current) {
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

    // When user taps the nightly notification → generate today's summary
    const notifSub = Notifications.addNotificationResponseReceivedListener(response => {
      const action = response.notification.request.content.data?.action;
      if (action === 'generate-summary') {
        const today = new Date().toISOString().split('T')[0];
        generateIfNeeded(today);
      }
    });

    return () => {
      linkSub.remove();
      stateSub.remove();
      notifSub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => { isReady.current = true; }}
      >
        <StatusBar style="light" />
        <Tab.Navigator
          screenOptions={{
            tabBarStyle: {
              backgroundColor: '#1a1a2e',
              borderTopColor: '#16213e',
            },
            tabBarActiveTintColor: '#e94560',
            tabBarInactiveTintColor: '#6b7280',
            headerStyle: { backgroundColor: '#1a1a2e' },
            headerTintColor: '#ffffff',
          }}
        >
          <Tab.Screen
            name="Journal"
            component={HomeScreen}
            options={{
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🎙️</Text>,
            }}
          />
          <Tab.Screen
            name="Notes"
            component={TranscriptsScreen}
            options={{
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📝</Text>,
            }}
          />
          <Tab.Screen
            name="Summary"
            component={SummaryScreen}
            options={{
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>✨</Text>,
            }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text>,
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
