/**
 * EnneagramWheel — 9-point radial visualization of how strongly each
 * enneagram type showed up in a given month. Each point's dot scales with its
 * weight (0..1). Pure RN — no SVG dependency.
 *
 * Type ordering follows the standard enneagram (1 at top, then clockwise).
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

interface Props {
  /** 9 weights in [0, 1], type 1..9 in array order. */
  weights: number[];
  size?: number;          // overall diameter, defaults to 180
}

const TYPE_LABELS = [
  'Perfecting',
  'Caring',
  'Achieving',
  'Feeling',
  'Observing',
  'Vigilant',
  'Pursuing',
  'Asserting',
  'Accommodating',
];

export default function EnneagramWheel({ weights, size = 180 }: Props) {
  const safe = weights.length === 9 ? weights : new Array(9).fill(0);
  const center = size / 2;
  const ringRadius = size / 2 - 22;
  const minDot = 6;
  const maxDot = 22;

  // Find dominant type for the inline label
  let dominantIdx = 0;
  for (let i = 1; i < 9; i++) {
    if (safe[i] > safe[dominantIdx]) dominantIdx = i;
  }
  const dominantWeight = safe[dominantIdx] ?? 0;

  return (
    <View style={s.wrap}>
      <View style={[s.canvas, { width: size, height: size }]}>
        {/* Soft ring */}
        <View style={[
          s.ring,
          {
            width: ringRadius * 2,
            height: ringRadius * 2,
            borderRadius: ringRadius,
            top: center - ringRadius,
            left: center - ringRadius,
          },
        ]} />

        {/* 9 dots */}
        {safe.map((w, i) => {
          const angle = (i / 9) * 2 * Math.PI - Math.PI / 2; // type 1 at top
          const x = center + Math.cos(angle) * ringRadius;
          const y = center + Math.sin(angle) * ringRadius;
          const dotSize = minDot + (maxDot - minDot) * Math.max(0, Math.min(1, w));
          const opacity = 0.25 + 0.75 * Math.max(0, Math.min(1, w));
          return (
            <React.Fragment key={i}>
              <View
                style={[
                  s.dot,
                  {
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    top: y - dotSize / 2,
                    left: x - dotSize / 2,
                    opacity,
                  },
                ]}
              />
              {/* Type number, just outside the ring */}
              <Text
                style={[
                  s.typeNum,
                  {
                    top: center + Math.sin(angle) * (ringRadius + 14) - 7,
                    left: center + Math.cos(angle) * (ringRadius + 14) - 7,
                    opacity: 0.4 + 0.6 * Math.max(0, Math.min(1, w)),
                  },
                ]}
              >
                {i + 1}
              </Text>
            </React.Fragment>
          );
        })}
      </View>

      {/* Caption: dominant type */}
      {dominantWeight > 0.15 && (
        <Text style={s.caption}>
          mostly {TYPE_LABELS[dominantIdx].toLowerCase()} energy
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  canvas: {
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.16)',
  },
  dot: {
    position: 'absolute',
    backgroundColor: 'rgba(152,212,250,0.85)',
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(152,212,250,1)',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  typeNum: {
    position: 'absolute',
    width: 14,
    height: 14,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    color: 'rgba(224,242,254,0.85)',
    fontFamily: 'GillSans-Light',
  },
  caption: {
    marginTop: 12,
    fontSize: 11.5,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
});
