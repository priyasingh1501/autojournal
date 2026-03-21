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
        backgroundColor: '#02060E',
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
            // borderWidth:0 is unreliable in RemoteViews — use transparent colour when active
            borderWidth: 2,
            borderColor: isMonitoring ? '#e94560' : '#818cf8',
          }}
        >
          {/* Simple ASCII symbols — emoji are unreliable in RemoteViews */}
          <TextWidget
            text={isMonitoring ? '■' : '●'}
            style={{ fontSize: 28, color: '#ffffff' }}
          />
        </FlexWidget>
      </ClickableArea>

      {/* Status label — always rendered, text/colour changes by state */}
      <TextWidget
        text={isMonitoring ? 'Listening…' : 'untangle'}
        style={{
          color: isMonitoring ? '#e94560' : '#6b7280',
          fontSize: 11,
          fontWeight: 'normal',
          marginTop: 6,
        }}
      />
      {/* Sub-label — always rendered to avoid RemoteView conditional-child issues */}
      <TextWidget
        text={isMonitoring ? 'Tap to stop' : ''}
        style={{ color: '#9ca3af', fontSize: 9 }}
      />
    </FlexWidget>
  );
}
