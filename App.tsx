import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import TranscriptsScreen from './src/screens/TranscriptsScreen';
import SummaryScreen from './src/screens/SummaryScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
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
