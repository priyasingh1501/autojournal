/**
 * MicWidget – Android home-screen widget rendered by react-native-android-widget.
 *
 * Layout: OverlapWidget (stacking context)
 *   1. ImageWidget   – jellyfish.jpg fills the whole card
 *   2. FlexWidget    – dark gradient scrim for readability
 *   3. FlexWidget    – app label + "Type a note" button (centred)
 */
import React from 'react';
import {
  FlexWidget,
  TextWidget,
  OverlapWidget,
  ImageWidget,
  SvgWidget,
} from 'react-native-android-widget';

const TYPE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`;

export function MicWidget() {
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

      {/* ── Layer 3: Label + type button ─────────────────────────────── */}
      <FlexWidget
        clickAction="OPEN_COMPOSE"
        style={{
          width: 'match_parent',
          height: 'match_parent',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TextWidget
          text="untangle"
          style={{ color: '#E0F2FE', fontSize: 14 }}
        />

        <FlexWidget
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
      </FlexWidget>
    </OverlapWidget>
  );
}
