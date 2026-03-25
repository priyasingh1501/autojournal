import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WhatYouCareAboutAnalysis, ValueNode } from '../../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_W } = Dimensions.get('window');
const CONTAINER_W = SCREEN_W - 48;
const CONTAINER_H = 260;

// ── Deterministic scatter hash ────────────────────────────────────────────────

function hash(s: string, seed = 0): number {
  let h = 5381 + seed;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}

function getBubblePos(topic: string, radius: number): { x: number; y: number } {
  const pad = radius + 6;
  const x = (hash(topic, 0) % (CONTAINER_W - pad * 2)) + pad;
  const y = (hash(topic, 7) % (CONTAINER_H - pad * 2)) + pad;
  return { x, y };
}

// ── Colour per valence ─────────────────────────────────────────────────────────

function bubbleColor(valence: ValueNode['valence'], intensity: number): string {
  const a = 0.20 + (intensity / 100) * 0.65;
  switch (valence) {
    case 'positive': return `rgba(94,234,212,${a.toFixed(2)})`;
    case 'negative': return `rgba(236,72,153,${a.toFixed(2)})`;
    case 'mixed':    return `rgba(251,191,36,${a.toFixed(2)})`;
    default:         return `rgba(147,197,253,${a.toFixed(2)})`;
  }
}

function bubbleBorder(valence: ValueNode['valence']): string {
  switch (valence) {
    case 'positive': return 'rgba(94,234,212,0.40)';
    case 'negative': return 'rgba(236,72,153,0.40)';
    case 'mixed':    return 'rgba(251,191,36,0.40)';
    default:         return 'rgba(147,197,253,0.30)';
  }
}

function textColor(valence: ValueNode['valence']): string {
  switch (valence) {
    case 'positive': return 'rgba(94,234,212,0.95)';
    case 'negative': return 'rgba(249,168,212,0.95)';
    case 'mixed':    return 'rgba(253,224,71,0.95)';
    default:         return 'rgba(224,242,254,0.80)';
  }
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

// ── Constellation ─────────────────────────────────────────────────────────────

function Constellation({ values }: { values: ValueNode[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <View>
      {/* Legend */}
      <View style={cs.legend}>
        {(['positive', 'neutral', 'mixed', 'negative'] as const).map(v => (
          <View key={v} style={cs.legendItem}>
            <View style={[cs.legendDot, { backgroundColor: bubbleColor(v, 70) }]} />
            <Text style={cs.legendLabel}>{v}</Text>
          </View>
        ))}
        <Text style={cs.legendHint}>size = frequency · brightness = emotional charge</Text>
      </View>

      {/* Bubble field */}
      <View style={[cs.field, { width: CONTAINER_W, height: CONTAINER_H }]}>
        {values.map(v => {
          const radius = (v.frequency / 100) * 36 + 18; // 18–54
          const { x, y } = getBubblePos(v.topic, radius);
          const isSelected = selected === v.topic;
          return (
            <TouchableOpacity
              key={v.topic}
              onPress={() => setSelected(isSelected ? null : v.topic)}
              style={[cs.bubble, {
                width:  radius * 2,
                height: radius * 2,
                borderRadius: radius,
                left:   x - radius,
                top:    y - radius,
                backgroundColor: bubbleColor(v.valence, v.intensity),
                borderColor: bubbleBorder(v.valence),
                borderWidth: isSelected ? 2 : 1,
                zIndex: isSelected ? 10 : 1,
                transform: [{ scale: isSelected ? 1.08 : 1 }],
              }]}
              activeOpacity={0.8}
            >
              <Text
                style={[cs.bubbleText, { color: textColor(v.valence), fontSize: radius > 36 ? 12 : 9 }]}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {v.topic}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected tooltip */}
      {selected && (() => {
        const v = values.find(x => x.topic === selected)!;
        return (
          <View style={cs.tooltip}>
            <Text style={[cs.tooltipTopic, { color: textColor(v.valence) }]}>{v.topic}</Text>
            <Text style={cs.tooltipMeta}>
              Frequency {v.frequency} · Charge {v.intensity} · {v.valence}
            </Text>
          </View>
        );
      })()}
    </View>
  );
}

const cs = StyleSheet.create({
  legend:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10, alignItems: 'center' },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)' },
  legendHint:  { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.30)', lineHeight: 13, flex: 1, textAlign: 'right' },
  field:       { position: 'relative', backgroundColor: 'rgba(152,212,250,0.03)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(152,212,250,0.10)', overflow: 'hidden' },
  bubble:      { position: 'absolute', alignItems: 'center', justifyContent: 'center', padding: 4 },
  bubbleText:  { fontFamily: 'GillSans-Light', textAlign: 'center', lineHeight: 13 },
  tooltip:     { marginTop: 8, backgroundColor: 'rgba(152,212,250,0.05)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(152,212,250,0.14)', padding: 10, gap: 2 },
  tooltipTopic:{ fontSize: 14, fontFamily: 'Baskerville', fontWeight: '500' },
  tooltipMeta: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)' },
});

// ── Divergence flag ───────────────────────────────────────────────────────────

function DivergenceFlag({ stated, actual, observation }: { stated: string; actual: string; observation: string }) {
  return (
    <View style={df.card}>
      <View style={df.iconRow}>
        <Feather name="alert-circle" size={13} color="rgba(251,191,36,0.80)" />
        <Text style={df.label}>Values gap</Text>
      </View>
      <View style={df.tags}>
        <View style={df.tag}><Text style={df.tagText}>says: {stated}</Text></View>
        <Feather name="arrow-right" size={12} color="rgba(152,212,250,0.30)" />
        <View style={[df.tag, df.tagActual]}><Text style={[df.tagText, df.tagTextActual]}>lives: {actual}</Text></View>
      </View>
      <Text style={df.obs}>{observation}</Text>
    </View>
  );
}

const df = StyleSheet.create({
  card:         { backgroundColor: 'rgba(251,191,36,0.05)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(251,191,36,0.20)', padding: 14, gap: 8 },
  iconRow:      { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label:        { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(251,191,36,0.75)', letterSpacing: 0.2 },
  tags:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag:          { backgroundColor: 'rgba(152,212,250,0.06)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(152,212,250,0.15)', paddingHorizontal: 10, paddingVertical: 5 },
  tagActual:    { backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.25)' },
  tagText:      { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.75)' },
  tagTextActual:{ color: 'rgba(251,191,36,0.85)' },
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
      <Text style={s.sectionLabel}>VALUES CONSTELLATION</Text>
      <Constellation values={data.values} />

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
