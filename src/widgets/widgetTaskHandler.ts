/**
 * widgetTaskHandler – the bridge between Android's AppWidget lifecycle and
 * the JavaScript side.  This function runs inside a lightweight background
 * JS context spun up by react-native-android-widget whenever the OS invokes
 * the widget provider (add / update / resize / click / delete).
 *
 * Communication with the main app:
 *   AsyncStorage key WIDGET_MONITORING_KEY ('true'|'false') acts as the
 *   shared flag.  The app reads this key on every foreground resume and
 *   starts/stops monitoring accordingly.  The widget updates this key and
 *   re-renders itself; it then brings the app to the foreground via Linking
 *   so the actual microphone session begins immediately.
 *
 * NOTE: This file intentionally uses React.createElement instead of JSX so
 * it can stay a plain .ts file (Babel rejects JSX in .ts extensions).
 */
import React from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { MicWidget } from './MicWidget';

export const WIDGET_MONITORING_KEY = '@widget_monitoring';

async function getIsMonitoring(): Promise<boolean> {
  const val = await AsyncStorage.getItem(WIDGET_MONITORING_KEY);
  return val === 'true';
}

async function setIsMonitoring(value: boolean): Promise<void> {
  await AsyncStorage.setItem(WIDGET_MONITORING_KEY, value ? 'true' : 'false');
}

function micWidgetEl(isMonitoring: boolean) {
  return React.createElement(MicWidget, { isMonitoring });
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetAction, clickAction } = props;

  switch (widgetAction) {
    // ── Render current state whenever the OS requests a fresh view ──────────
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const isMonitoring = await getIsMonitoring();
      props.renderWidget(micWidgetEl(isMonitoring));
      break;
    }

    // ── User tapped the mic button ───────────────────────────────────────────
    case 'WIDGET_CLICK': {
      if (clickAction === 'TOGGLE_MONITORING') {
        const wasMonitoring = await getIsMonitoring();
        const nowMonitoring = !wasMonitoring;

        // 1. Persist the new intent for the app to pick up
        await setIsMonitoring(nowMonitoring);

        // 2. Re-render the widget immediately so it feels responsive
        props.renderWidget(micWidgetEl(nowMonitoring));

        // 3. Open / bring the app to the foreground so the actual mic session
        //    can start or stop (microphone access requires a foreground app).
        //    The HomeScreen reads WIDGET_MONITORING_KEY on every focus event.
        try {
          await Linking.openURL('untangle://home');
        } catch {
          // App might already be in foreground; ignore launch errors.
        }
      }
      break;
    }

    // ── Widget removed – clear the shared flag ───────────────────────────────
    case 'WIDGET_DELETED': {
      await AsyncStorage.removeItem(WIDGET_MONITORING_KEY);
      break;
    }
  }
}
