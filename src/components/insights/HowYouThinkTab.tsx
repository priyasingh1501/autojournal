import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { HowYouThinkAnalysis, CognitiveDimension } from '../../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Source expand ─────────────────────────────────────────────────────────────

function SourceExpand({ dates, onJump }: { dates: string[]; onJump?: (d: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity
      onPress={() => { LayoutAnimation.easeInEaseOut(); setOpen(v => !v); }}
      style={src.row}
      activeOpacity={0.7}
    >
      <Text style={src.label}>what prompted this</Text>
      <Feather name={open ? 'chevron-up' : 'chevron-down'} size={11} color="rgba(152,212,250,0.40)" />
      {open && (
        <View style={src.chips}>
          {dates.map(d => (
            <TouchableOpacity key={d} onPress={() => onJump?.(d)} style={src.chip}>
              <Text style={src.chipText}>
                {new Date(d + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}
const src = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 8 },
  label:    { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.38)', letterSpacing: 0.3 },
  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: '100%', marginTop: 6 },
  chip:     { backgroundColor: 'rgba(152,212,250,0.07)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(152,212,250,0.14)', paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.70)' },
});

// ── Colour per dimension ──────────────────────────────────────────────────────

const DIM_COLORS = [
  'rgba(167,139,250,0.80)',  // Systems/Stories — purple
  'rgba(94,234,212,0.80)',   // Zoomed — teal
  'rgba(147,197,253,0.80)',  // Resolves — blue
  'rgba(251,191,36,0.80)',   // Internal/External — amber
];

// ── Cognitive dimension slider (read-only) ────────────────────────────────────

function DimensionSlider({
  dim, color, onJump,
}: {
  dim: CognitiveDimension;
  color: string;
  onJump?: (date: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.max(4, Math.min(96, dim.score)); // clamp so indicator never clips

  return (
    <TouchableOpacity
      onPress={() => { LayoutAnimation.easeInEaseOut(); setExpanded(v => !v); }}
      style={[sl.card, { borderColor: color.replace(/[\d.]+\)$/, '0.14)') }]}
      activeOpacity={0.85}
    >
      {/* Dimension name */}
      <Text style={sl.name}>{dim.name}</Text>

      {/* Read-only slider track */}
      <View style={sl.trackWrap}>
        <View style={sl.track}>
          {/* Filled left portion */}
          <View style={[sl.fillLeft, { width: `${pct}%`, backgroundColor: color.replace(/[\d.]+\)$/, '0.18)') }]} />
          {/* Indicator dot */}
          <View style={[sl.dot, { left: `${pct}%`, backgroundColor: color, marginLeft: -6 }]} />
        </View>
        <View style={sl.poleRow}>
          <Text style={sl.pole}>{dim.leftLabel}</Text>
          <Text style={sl.pole}>{dim.rightLabel}</Text>
        </View>
      </View>

      {/* Observation — always visible */}
      <Text style={sl.observation}>{dim.observation}</Text>

      {/* Expanded: source entries */}
      {expanded && dim.sourceEntries?.length ? (
        <SourceExpand dates={dim.sourceEntries} onJump={onJump} />
      ) : (
        dim.sourceEntries?.length ? (
          <Text style={sl.tapHint}>tap to see source entries</Text>
        ) : null
      )}
    </TouchableOpacity>
  );
}

const sl = StyleSheet.create({
  card:        { backgroundColor: 'rgba(152,212,250,0.03)', borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  name:        { fontSize: 13, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.88)' },
  trackWrap:   { gap: 5 },
  track:       { height: 8, borderRadius: 4, backgroundColor: 'rgba(152,212,250,0.08)', position: 'relative', overflow: 'visible' },
  fillLeft:    { height: '100%', borderRadius: 4, position: 'absolute', left: 0, top: 0 },
  dot:         { width: 12, height: 12, borderRadius: 6, position: 'absolute', top: -2, borderWidth: 2, borderColor: 'rgba(2,6,14,0.80)' },
  poleRow:     { flexDirection: 'row', justifyContent: 'space-between' },
  pole:        { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.35)' },
  observation: { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.72)', lineHeight: 19, fontStyle: 'italic' },
  tapHint:     { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.28)', marginTop: 2 },
});

// ── Main tab ───────────────────────────────────────────────────────────────────

interface Props {
  data: HowYouThinkAnalysis;
  onJump?: (date: string) => void;
}

export default function HowYouThinkTab({ data, onJump }: Props) {
  return (
    <View style={s.root}>
      {/* Header note */}
      <View style={s.notice}>
        <Feather name="eye" size={12} color="rgba(152,212,250,0.45)" />
        <Text style={s.noticeText}>
          These sliders are inferred from my writing — not self-reported. A mirror, not a test. Tap any card to see which entries informed it.
        </Text>
      </View>

      {/* Dimension sliders */}
      {data.dimensions.map((dim, i) => (
        <DimensionSlider
          key={dim.name}
          dim={dim}
          color={DIM_COLORS[i % DIM_COLORS.length]}
          onJump={onJump}
        />
      ))}

      {/* Updates note */}
      <Text style={s.updateNote}>This tab updates weekly — cognitive style changes slowly.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:        { gap: 14 },
  notice:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(152,212,250,0.04)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.10)', padding: 12 },
  noticeText:  { flex: 1, fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', lineHeight: 17 },
  updateNote:  { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.30)', textAlign: 'center', marginTop: 4 },
});
