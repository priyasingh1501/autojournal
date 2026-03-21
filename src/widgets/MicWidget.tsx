/**
 * MicWidget – Android home-screen widget rendered by react-native-android-widget.
 *
 * The component uses the library's own primitives (FlexWidget, TextWidget,
 * ClickableArea). These are NOT standard RN views – they compile down to
 * Android RemoteViews and have a limited style subset.
 */
import React from 'react';
import { FlexWidget, TextWidget, ClickableArea } from 'react-native-android-widget';

interface MicWidgetProps {
  isMonitoring: boolean;
}

export function MicWidget({ isMonitoring }: MicWidgetProps) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a2e',
        borderRadius: 20,
      }}
    >
      {/* Mic button – tapping toggles monitoring and opens the app */}
      <ClickableArea clickAction="TOGGLE_MONITORING">
        <FlexWidget
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: isMonitoring ? '#e94560' : '#16213e',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: isMonitoring ? 0 : 2,
            borderColor: '#818cf8',
          }}
        >
          {/* Use unicode chars instead of emoji for reliable RemoteView rendering */}
          <TextWidget
            text={isMonitoring ? '\u23F9' : '\uD83C\uDFA4'}
            style={{ fontSize: 26, color: '#ffffff' }}
          />
        </FlexWidget>
      </ClickableArea>

      {/* Status label */}
      <TextWidget
        text={isMonitoring ? 'Listening…' : 'Auto Journal'}
        style={{
          color: isMonitoring ? '#e94560' : '#6b7280',
          fontSize: 11,
          fontWeight: 'normal',
          marginTop: 6,
        }}
      />
      {isMonitoring && (
        <TextWidget
          text="Tap to stop"
          style={{ color: '#9ca3af', fontSize: 9 }}
        />
      )}
    </FlexWidget>
  );
}
