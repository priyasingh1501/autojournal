import React, { useEffect } from 'react';
import { AppState, AppStateStatus, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
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

export default function App() {
  useEffect(() => {
    // Bootstrap notification channel + nightly schedule on first launch
    setupNotificationChannel();
    scheduleNightlyNotification();
    // Auto-generate for yesterday / tonight if applicable
    checkAndAutoGenerate();

    // Re-check whenever app comes back to foreground
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
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
      sub.remove();
      notifSub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
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
