import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WhatYouCareAboutAnalysis, ValueNode } from '../../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Colour helpers ─────────────────────────────────────────────────────────────

function accentColor(valence: ValueNode['valence']): string {
  switch (valence) {
    case 'positive': return '22,163,74';
    case 'negative': return '236,72,153';
    case 'mixed':    return '251,191,36';
    default:         return '147,197,253';
  }
}

function tagFill(valence: ValueNode['valence'], intensity: number): string {
  const rgb = accentColor(valence);
  const a   = (0.04 + (intensity / 100) * 0.10).toFixed(2);
  return `rgba(${rgb},${a})`;
}

function tagBorder(valence: ValueNode['valence'], intensity: number): string {
  const rgb = accentColor(valence);
  const a   = (0.25 + (intensity / 100) * 0.55).toFixed(2);
  return `rgba(${rgb},${a})`;
}

function tagText(valence: ValueNode['valence']): string {
  const rgb = accentColor(valence);
  return `rgba(${rgb},0.95)`;
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
  row:      { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 10 },
  label:    { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.38)', letterSpacing: 0.3 },
  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: '100%', marginTop: 6 },
  chip:     { backgroundColor: 'rgba(152,212,250,0.07)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(152,212,250,0.14)', paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.70)' },
});

// ── Tag cloud ──────────────────────────────────────────────────────────────────

function TagCloud({ values }: { values: ValueNode[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  // Sort largest → smallest so big tags anchor top-left in the wrap
  const sorted = [...values].sort((a, b) => b.frequency - a.frequency);
  const sel    = selected ? values.find(v => v.topic === selected) : null;

  function onPress(topic: string) {
    LayoutAnimation.easeInEaseOut();
    setSelected(prev => prev === topic ? null : topic);
  }

  return (
    <View style={tc.wrap}>
      {/* Key */}
      <View style={tc.keyRow}>
        <Text style={tc.keyHint}>larger = written about more  ·  brighter border = more emotional charge</Text>
      </View>

      {/* Tag cloud */}
      <View style={tc.cloud}>
        {sorted.map(v => {
          const freq   = v.frequency / 100;                        // 0–1
          const isSel  = selected === v.topic;
          const fSize  = Math.round(11 + freq * 8);               // 11–19 px
          const padH   = Math.round(9  + freq * 8);               // 9–17 px
          const padV   = Math.round(5  + freq * 5);               // 5–10 px
          return (
            <TouchableOpacity
              key={v.topic}
              onPress={() => onPress(v.topic)}
              activeOpacity={0.75}
              style={[tc.tag, {
                paddingHorizontal: padH,
                paddingVertical:   padV,
                backgroundColor:   tagFill(v.valence, v.intensity),
                borderColor:       tagBorder(v.valence, isSel ? Math.min(v.intensity + 30, 100) : v.intensity),
                borderWidth:       isSel ? 1.5 : 1,
              }]}
            >
              <Text style={[tc.tagText, { fontSize: fSize, color: tagText(v.valence) }]}>
                {v.topic}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Detail card — appears below cloud on tap */}
      {sel && (
        <View style={[tc.detail, { borderColor: tagBorder(sel.valence, sel.intensity) }]}>
          <View style={tc.detailTop}>
            <Text style={[tc.detailTopic, { color: tagText(sel.valence) }]}>{sel.topic}</Text>
            <View style={[tc.valencePill, { borderColor: tagBorder(sel.valence, 60) }]}>
              <Text style={[tc.valenceText, { color: tagText(sel.valence) }]}>{sel.valence}</Text>
            </View>
          </View>
          {/* Frequency bar */}
          <View style={tc.barRow}>
            <Text style={tc.barLabel}>how often I write about this</Text>
            <View style={tc.track}>
              <View style={[tc.fill, {
                width: `${sel.frequency}%` as any,
                backgroundColor: `rgba(${accentColor(sel.valence)},0.60)`,
              }]} />
            </View>
          </View>
          {/* Intensity bar */}
          <View style={tc.barRow}>
            <Text style={tc.barLabel}>emotional charge when I do</Text>
            <View style={tc.track}>
              <View style={[tc.fill, {
                width: `${sel.intensity}%` as any,
                backgroundColor: `rgba(${accentColor(sel.valence)},0.45)`,
              }]} />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const tc = StyleSheet.create({
  wrap:        { gap: 12 },
  keyRow:      { },
  keyHint:     { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.35)', lineHeight: 15 },

  cloud:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag:         { borderRadius: 20, borderWidth: 1 },
  tagText:     { fontFamily: 'GillSans-Light', lineHeight: undefined },

  detail:      { marginTop: 4, borderRadius: 14, borderWidth: 1, backgroundColor: 'rgba(152,212,250,0.04)', padding: 14, gap: 10 },
  detailTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  detailTopic: { fontSize: 17, fontFamily: 'Baskerville', fontWeight: '500', flex: 1 },
  valencePill: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  valenceText: { fontSize: 10, fontFamily: 'GillSans-Light', letterSpacing: 0.3 },

  barRow:      { gap: 4 },
  barLabel:    { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', textTransform: 'uppercase', letterSpacing: 0.3 },
  track:       { height: 4, backgroundColor: 'rgba(152,212,250,0.08)', borderRadius: 2, overflow: 'hidden' },
  fill:        { height: '100%', borderRadius: 2 },
});

// ── Divergence flag ───────────────────────────────────────────────────────────

function DivergenceFlag({ stated, actual, observation }: { stated: string; actual: string; observation: string }) {
  return (
    <View style={df.card}>
      <View style={df.iconRow}>
        <Feather name="alert-circle" size={13} color="rgba(251,191,36,0.80)" />
        <Text style={df.label}>Values gap</Text>
      </View>
      {/* Stacked layout — no overflow on narrow screens */}
      <View style={df.stack}>
        <View style={df.tag}>
          <Text style={df.tagMeta}>says</Text>
          <Text style={df.tagText} numberOfLines={2}>{stated}</Text>
        </View>
        <View style={df.arrow}>
          <Feather name="arrow-down" size={12} color="rgba(152,212,250,0.30)" />
        </View>
        <View style={[df.tag, df.tagActual]}>
          <Text style={df.tagMeta}>lives</Text>
          <Text style={[df.tagText, df.tagTextActual]} numberOfLines={2}>{actual}</Text>
        </View>
      </View>
      <Text style={df.obs}>{observation}</Text>
    </View>
  );
}

const df = StyleSheet.create({
  card:         { backgroundColor: 'rgba(251,191,36,0.05)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(251,191,36,0.20)', padding: 14, gap: 10 },
  iconRow:      { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label:        { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(251,191,36,0.75)', letterSpacing: 0.2 },
  stack:        { gap: 2 },
  arrow:        { alignItems: 'center', paddingVertical: 2 },
  tag:          { backgroundColor: 'rgba(152,212,250,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(152,212,250,0.15)', paddingHorizontal: 12, paddingVertical: 8 },
  tagActual:    { backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.25)' },
  tagMeta:      { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  tagText:      { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.85)' },
  tagTextActual:{ color: 'rgba(251,191,36,0.90)' },
  obs:          { fontSize: 13, fontFamily: 'Baskerville', fontStyle: 'italic', color: 'rgba(224,242,254,0.80)', lineHeight: 20 },
});

// ── Motivation pulse ──────────────────────────────────────────────────────────

const PULSE_COLOR: Record<string, string> = {
  achievement: 'rgba(94,234,212,0.85)',
  connection:  'rgba(236,72,153,0.85)',
  meaning:     'rgba(196,181,253,0.85)',
  safety:      'rgba(147,197,253,0.85)',
};
const PULSE_BG: Record<string, string> = {
  achievement: 'rgba(94,234,212,0.07)',
  connection:  'rgba(236,72,153,0.07)',
  meaning:     'rgba(196,181,253,0.07)',
  safety:      'rgba(147,197,253,0.07)',
};

function MotivationPulse({ pulse, rationale }: { pulse: string; rationale: string }) {
  const color = PULSE_COLOR[pulse] ?? 'rgba(224,242,254,0.70)';
  const bg    = PULSE_BG[pulse]    ?? 'rgba(152,212,250,0.05)';
  return (
    <View style={[mp.card, { backgroundColor: bg, borderColor: color.replace(/[\d.]+\)$/, '0.20)') }]}>
      <Text style={mp.label}>Driving you this month</Text>
      <Text style={[mp.pulse, { color }]}>{pulse.charAt(0).toUpperCase() + pulse.slice(1)}</Text>
      <Text style={mp.rationale}>{rationale}</Text>
    </View>
  );
}

const mp = StyleSheet.create({
  card:      { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  label:     { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', textTransform: 'uppercase', letterSpacing: 0.4 },
  pulse:     { fontSize: 22, fontFamily: 'Baskerville', fontWeight: '500' },
  rationale: { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.65)', lineHeight: 19 },
});

// ── Main tab ───────────────────────────────────────────────────────────────────

interface Props {
  data: WhatYouCareAboutAnalysis;
  onJump?: (date: string) => void;
}

export default function ValuesConstellationTab({ data, onJump }: Props) {
  return (
    <View style={s.root}>
      <Text style={s.sectionLabel}>WHAT I WRITE ABOUT</Text>
      <TagCloud values={data.values} />

      {data.divergence.length > 0 && (
        <View style={s.section}>
          {data.divergence.map((d, i) => (
            <DivergenceFlag key={i} stated={d.stated} actual={d.actual} observation={d.observation} />
          ))}
        </View>
      )}

      <MotivationPulse pulse={data.motivationPulse} rationale={data.motivationRationale} />

      <SourceExpand dates={data.sourceEntries} onJump={onJump} />
    </View>
  );
}

const s = StyleSheet.create({
  root:         { gap: 18 },
  sectionLabel: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' },
  section:      { gap: 10 },
});
