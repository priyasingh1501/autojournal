/**
 * MicWidget – Android home-screen widget rendered by react-native-android-widget.
 *
 * Layout: OverlapWidget (stacking context)
 *   1. ImageWidget   – jellyfish.jpg fills the whole card
 *   2. FlexWidget    – dark gradient scrim for readability
 *   3. FlexWidget    – mic button + label (centred content)
 */
import React from 'react';
import {
  FlexWidget,
  TextWidget,
  OverlapWidget,
  ImageWidget,
  SvgWidget,
} from 'react-native-android-widget';

// ── SVG icons (inline strings — reliable across all Android versions) ─────────
const MIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;

const STOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;

const TYPE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`;

interface MicWidgetProps {
  isMonitoring: boolean;
}

export function MicWidget({ isMonitoring }: MicWidgetProps) {
  return (
    <OverlapWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        borderRadius: 24,
        overflow: 'hidden',
      }}
    >
      {/* ── Layer 1: Jellyfish background ──────────────────────────────── */}
      <ImageWidget
        image={require('../../assets/jellyfish.jpg')}
        imageWidth={400}
        imageHeight={400}
        style={{ width: 'match_parent', height: 'match_parent' }}
      />

      {/* ── Layer 2: Dark gradient scrim ──────────────────────────────── */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          backgroundGradient: {
            from: 'rgba(2, 6, 14, 0.45)',
            to: 'rgba(2, 6, 14, 0.82)',
            orientation: 'TOP_BOTTOM',
          },
        }}
      />

      {/* ── Layer 3: Mic button + label ───────────────────────────────── */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Mic / stop button */}
        <FlexWidget
          clickAction="TOGGLE_MONITORING"
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: isMonitoring ? '#e94560' : '#0929AD',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: isMonitoring
              ? 'rgba(233, 69, 96, 0.60)'
              : 'rgba(152, 212, 250, 0.40)',
          }}
        >
          <SvgWidget
            svg={isMonitoring ? STOP_SVG : MIC_SVG}
            style={{ width: 26, height: 26 }}
          />
        </FlexWidget>

        {/* App / status label */}
        <TextWidget
          text={isMonitoring ? 'Listening…' : 'untangle'}
          style={{
            color: '#E0F2FE',
            fontSize: 12,
            marginTop: 8,
          }}
        />

        {/* Sub-label — always rendered; empty when idle to avoid layout shift */}
        <TextWidget
          text={isMonitoring ? 'Tap to stop' : ''}
          style={{ color: 'rgba(224, 242, 254, 0.60)', fontSize: 10, marginTop: 2 }}
        />

        {/* Type button — only visible when idle */}
        {!isMonitoring && (
          <FlexWidget
            clickAction="OPEN_COMPOSE"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 12,
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: 'rgba(152,212,250,0.28)' as any,
              backgroundColor: 'rgba(152,212,250,0.08)' as any,
            }}
          >
            <SvgWidget svg={TYPE_SVG} style={{ width: 13, height: 13 }} />
            <TextWidget
              text="Type a note"
              style={{ color: 'rgba(224,242,254,0.75)' as any, fontSize: 11 }}
            />
          </FlexWidget>
        )}
      </FlexWidget>
    </OverlapWidget>
  );
}
