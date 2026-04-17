/**
 * WisdomWidget – Android home-screen widget showing a daily wisdom short.
 *
 * The short is picked using a date-seed so it rotates daily and is stable
 * within a day without needing network or AsyncStorage reads.
 *
 * Tap anywhere → opens the app to the Wisdom tab.
 */
import React from 'react';
import { FlexWidget, TextWidget, OverlapWidget } from 'react-native-android-widget';
import { SHORTS_LIBRARY } from '../data/shortsLibrary';

/** Returns the same short all day, rotating each midnight. */
function getDailyShort() {
  const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  return SHORTS_LIBRARY[dayIndex % SHORTS_LIBRARY.length];
}

/** Trim text to maxChars, appending '…' if cut. */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1).trimEnd() + '…';
}

export function WisdomWidget() {
  const short = getDailyShort();
  const quote = truncate(short.pullquote, 120);
  const author = short.source_author;

  return (
    <OverlapWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        borderRadius: 24,
        overflow: 'hidden',
      }}
    >
      {/* ── Background ────────────────────────────────────────────── */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          backgroundGradient: {
            from: '#020917',
            to: '#071535',
            orientation: 'TOP_BOTTOM',
          },
        }}
      />

      {/* ── Content ───────────────────────────────────────────────── */}
      <FlexWidget
        clickAction="OPEN_WISDOM"
        style={{
          width: 'match_parent',
          height: 'match_parent',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        {/* Top label */}
        <TextWidget
          text="WISDOM"
          style={{
            color: '#7ec8f8' as any,
            fontSize: 9,
            fontStyle: 'italic',
          }}
        />

        {/* Quote */}
        <TextWidget
          text={`"${quote}"`}
          style={{
            color: '#dff2fe' as any,
            fontSize: 12,
          }}
        />

        {/* Author */}
        <TextWidget
          text={`— ${author}`}
          style={{
            color: '#90b8d8' as any,
            fontSize: 10,
          }}
        />
      </FlexWidget>
    </OverlapWidget>
  );
}
