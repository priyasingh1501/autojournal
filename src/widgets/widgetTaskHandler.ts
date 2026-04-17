/**
 * widgetTaskHandler – bridge between Android's AppWidget lifecycle and JS.
 *
 * Handles two widgets:
 *   MicWidget     — app label + "Type a note" shortcut
 *   WisdomWidget  — daily rotating wisdom short, tap to open Wisdom tab
 *
 * NOTE: uses React.createElement (not JSX) so this stays a plain .ts file.
 */
import React from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { MicWidget } from './MicWidget';
import { WisdomWidget } from './WisdomWidget';

export const WIDGET_MONITORING_KEY = '@widget_monitoring';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetInfo, widgetAction, clickAction } = props;
  const widgetName = widgetInfo.widgetName;

  // ── MicWidget ──────────────────────────────────────────────────────────────
  if (widgetName === 'MicWidget') {
    switch (widgetAction) {
      case 'WIDGET_ADDED':
      case 'WIDGET_UPDATE':
      case 'WIDGET_RESIZED':
        props.renderWidget(React.createElement(MicWidget, {}));
        break;

      case 'WIDGET_CLICK':
        if (clickAction === 'OPEN_COMPOSE') {
          try { await Linking.openURL('untangle://compose'); } catch { /* ignore */ }
        }
        break;

      case 'WIDGET_DELETED':
        await AsyncStorage.removeItem(WIDGET_MONITORING_KEY);
        break;
    }
    return;
  }

  // ── WisdomWidget ───────────────────────────────────────────────────────────
  if (widgetName === 'WisdomWidget') {
    switch (widgetAction) {
      case 'WIDGET_ADDED':
      case 'WIDGET_UPDATE':
      case 'WIDGET_RESIZED':
        props.renderWidget(React.createElement(WisdomWidget, {}));
        break;

      case 'WIDGET_CLICK':
        if (clickAction === 'OPEN_WISDOM') {
          try { await Linking.openURL('untangle://wisdom'); } catch { /* ignore */ }
        }
        break;
    }
    return;
  }
}
