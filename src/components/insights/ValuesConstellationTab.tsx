import React, { useState, useMemo } from 'react';
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
    <View style={src.wrap}>
      <TouchableOpacity
        onPress={() => { LayoutAnimation.easeInEaseOut(); setOpen(v => !v); }}
        style={src.row}
        activeOpacity={0.7}
      >
        <Text style={src.label}>what prompted this</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={11} color="rgba(152,212,250,0.40)" />
      </TouchableOpacity>
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
    </View>
  );
}
const src = StyleSheet.create({
  wrap:     { marginTop: 10 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label:    { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.38)', letterSpacing: 0.3 },
  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip:     { backgroundColor: 'rgba(152,212,250,0.07)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(152,212,250,0.14)', paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.70)' },
});

// ── Values ranked list ────────────────────────────────────────────────────────

function ValuesList({ values }: { values: ValueNode[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...values].sort((a, b) => b.frequency - a.frequency),
    [values],
  );

  const maxFreq = useMemo(
    () => Math.max(...sorted.map(v => v.frequency), 1),
    [sorted],
  );

  const sel = selected ? sorted.find(v => v.topic === selected) : null;

  function onPress(topic: string) {
    LayoutAnimation.easeInEaseOut();
    setSelected(prev => prev === topic ? null : topic);
  }

  return (
    <View style={tc.wrap}>
      <View style={tc.list}>
        {sorted.map((v, i) => {
          const ratio       = v.frequency / maxFreq;
          const rgb         = accentColor(v.valence);
          const barOpacity  = 0.20 + ratio * 0.75;
          const barWidth    = Math.round(3 + ratio * 2);
          const textOpacity = 0.40 + ratio * 0.60;
          const rankOpacity = 0.25 + ratio * 0.38;
          const isSel       = selected === v.topic;

          return (
            <TouchableOpacity
              key={v.topic}
              onPress={() => onPress(v.topic)}
              activeOpacity={0.75}
              style={tc.row}
            >
              {/* Left accent bar — valence coloured */}
              <View style={[tc.bar, {
                width: barWidth,
                opacity: barOpacity,
                backgroundColor: `rgba(${rgb},1)`,
              }]} />

              <View style={tc.rowBody}>
                <View style={tc.rowHeader}>
                  {/* Rank */}
                  <Text style={[tc.rank, { opacity: rankOpacity }]}>
                    {String(i + 1).padStart(2, '0')}
                  </Text>

                  {/* Topic — full text, no truncation */}
                  <Text style={[tc.topic, { opacity: textOpacity, color: `rgba(${rgb},0.95)` }]}>
                    {v.topic}
                  </Text>

                  {/* Valence pill */}
                  <View style={[tc.valencePill, { borderColor: `rgba(${rgb},0.25)`, backgroundColor: `rgba(${rgb},0.07)` }]}>
                    <Text style={[tc.valenceText, { color: `rgba(${rgb},0.75)` }]}>{v.valence}</Text>
                  </View>
                </View>

                {/* Expanded detail */}
                {isSel && (
                  <View style={tc.detail}>
                    <View style={tc.barRow}>
                      <Text style={tc.barLabel}>how often I write about this</Text>
                      <View style={tc.track}>
                        <View style={[tc.fill, { width: `${v.frequency}%` as any, backgroundColor: `rgba(${rgb},0.55)` }]} />
                      </View>
                    </View>
                    <View style={tc.barRow}>
                      <Text style={tc.barLabel}>emotional charge when I do</Text>
                      <View style={tc.track}>
                        <View style={[tc.fill, { width: `${v.intensity}%` as any, backgroundColor: `rgba(${rgb},0.35)` }]} />
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={tc.hint}>Tap any topic to see frequency and emotional charge</Text>
    </View>
  );
}

const tc = StyleSheet.create({
  wrap:        { gap: 4 },
  list:        { gap: 2 },
  row:         { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 7, gap: 12 },
  bar:         { width: 4, borderRadius: 2, minHeight: 18 },
  rowBody:     { flex: 1, gap: 4 },
  rowHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank:        { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.90)', letterSpacing: 0.5, width: 20 },
  topic:       { flex: 1, fontSize: 15, fontFamily: 'Baskerville' },
  valencePill: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  valenceText: { fontSize: 9, fontFamily: 'GillSans-Light', letterSpacing: 0.3 },

  detail:  { gap: 8, paddingLeft: 28, paddingTop: 6, paddingBottom: 2 },
  barRow:  { gap: 3 },
  barLabel:{ fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.42)', textTransform: 'uppercase', letterSpacing: 0.3 },
  track:   { height: 3, backgroundColor: 'rgba(152,212,250,0.08)', borderRadius: 2, overflow: 'hidden' },
  fill:    { height: '100%', borderRadius: 2 },

  hint:    { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.35)', textAlign: 'center', marginTop: 6 },
});

// ── Divergence flag ───────────────────────────────────────────────────────────

function DivergenceFlag({ stated, actual, observation }: { stated: string; actual: string; observation: string }) {
  const [expanded, setExpanded] = useState(false);

  function toggle() {
    LayoutAnimation.easeInEaseOut();
    setExpanded(prev => !prev);
  }

  return (
    <TouchableOpacity activeOpacity={0.80} onPress={toggle} style={df.card}>
      <View style={df.iconRow}>
        <Feather name="alert-circle" size={13} color="rgba(251,191,36,0.80)" />
        <Text style={df.label}>Where intention meets reality</Text>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={13}
          color="rgba(251,191,36,0.50)"
          style={{ marginLeft: 'auto' }}
        />
      </View>
      {/* Says / Lives by — always visible */}
      <View style={df.stack}>
        <View style={df.tag}>
          <Text style={df.tagMeta}>says</Text>
          <Text style={df.tagText}>{stated}</Text>
        </View>
        <View style={df.arrow}>
          <Feather name="arrow-down" size={12} color="rgba(152,212,250,0.30)" />
        </View>
        <View style={[df.tag, df.tagActual]}>
          <Text style={df.tagMeta}>lives by</Text>
          <Text style={[df.tagText, df.tagTextActual]}>{actual}</Text>
        </View>
      </View>
      {/* Explanation — revealed on tap */}
      {expanded && <Text style={df.obs}>{observation}</Text>}
    </TouchableOpacity>
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
  obs:          { fontSize: 13, fontFamily: 'Baskerville', color: 'rgba(224,242,254,0.80)', lineHeight: 20 },
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
      <Text style={mp.label}>What's pulling you right now</Text>
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
      {/* Divergence first — the headline insight */}
      {data.divergence.length > 0 && (
        <View style={s.section}>
          {data.divergence.map((d, i) => (
            <DivergenceFlag key={i} stated={d.stated} actual={d.actual} observation={d.observation} />
          ))}
        </View>
      )}

      {/* Ranked list — the evidence behind it */}
      <Text style={s.sectionLabel}>Where your attention goes</Text>
      <ValuesList values={data.values} />

      <SourceExpand dates={data.sourceEntries} onJump={onJump} />
    </View>
  );
}

const s = StyleSheet.create({
  root:         { gap: 18 },
  sectionLabel: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' },
  section:      { gap: 10 },
});
