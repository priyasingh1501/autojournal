import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  HowYouThinkAnalysis, CognitiveDimension,
  BiasPattern, ExecutionPatterns, RepeatingLoop,
} from '../../types';

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

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return <Text style={sl.label}>{text}</Text>;
}
const sl = StyleSheet.create({
  label: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' },
});

// ── Pending placeholder ───────────────────────────────────────────────────────

function Pending({ text }: { text: string }) {
  return (
    <View style={pend.wrap}>
      <Feather name="clock" size={12} color="rgba(152,212,250,0.30)" />
      <Text style={pend.text}>{text}</Text>
    </View>
  );
}
const pend = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(152,212,250,0.03)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.08)', padding: 14 },
  text: { flex: 1, fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.35)', fontStyle: 'italic' },
});

// ── Decision Style + Bias Patterns ───────────────────────────────────────────

const BIAS_FREQ_COLOR: Record<string, string> = {
  occasional: 'rgba(110,231,183,0.70)',
  frequent:   'rgba(251,191,36,0.80)',
  dominant:   'rgba(252,165,165,0.80)',
};

function DecisionStyleCard({ data }: { data: HowYouThinkAnalysis['decisionStyle'] }) {
  if (!data) return <Pending text="How you decide — generating from your entries…" />;
  return (
    <View style={ds.card}>
      <View style={ds.styleRow}>
        <Text style={ds.styleLabel}>Primary style</Text>
        <Text style={ds.styleName}>{data.primaryStyle}</Text>
      </View>
      <Text style={ds.desc}>{data.description}</Text>
      {data.patterns.length > 0 && (
        <View style={ds.patterns}>
          {data.patterns.map((p, i) => (
            <View key={i} style={ds.patternRow}>
              <View style={ds.dot} />
              <Text style={ds.patternText}>{p}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const ds = StyleSheet.create({
  card:       { backgroundColor: 'rgba(147,197,253,0.04)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(147,197,253,0.14)', padding: 16, gap: 10 },
  styleRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  styleLabel: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0 },
  styleName:  { fontSize: 18, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.92)', flexShrink: 1 },
  desc:       { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.70)', lineHeight: 18 },
  patterns:   { gap: 6, marginTop: 2 },
  patternRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot:        { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(147,197,253,0.60)', marginTop: 6 },
  patternText:{ flex: 1, fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.65)', lineHeight: 18 },
});

function BiasCard({ biases }: { biases: BiasPattern[] }) {
  if (!biases.length) return <Pending text="Blind spots — generating from your entries…" />;
  return (
    <View style={bp.card}>
      {biases.map((b, i) => (
        <View key={i} style={[bp.row, i < biases.length - 1 && bp.rowBorder]}>
          <View style={bp.topRow}>
            <Text style={bp.name}>{b.name}</Text>
            <Text style={[bp.freq, { color: BIAS_FREQ_COLOR[b.frequency] }]}>{b.frequency}</Text>
          </View>
          <Text style={bp.obs}>{b.observation}</Text>
        </View>
      ))}
    </View>
  );
}

const bp = StyleSheet.create({
  card:      { backgroundColor: 'rgba(252,165,165,0.03)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(252,165,165,0.12)', padding: 16, gap: 0 },
  row:       { paddingVertical: 12, gap: 4 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(152,212,250,0.07)' },
  topRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name:      { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.85)' },
  freq:      { fontSize: 10, fontFamily: 'GillSans-Light', textTransform: 'uppercase', letterSpacing: 0.3 },
  obs:       { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', lineHeight: 17 },
});

// ── Execution Patterns ────────────────────────────────────────────────────────

type GaugeItem = { label: string; leftPole: string; rightPole: string; value: number; color: string };

function ExecutionCard({ patterns }: { patterns: ExecutionPatterns }) {
  const [expanded, setExpanded] = useState(false);
  const gauges: GaugeItem[] = [
    { label: 'Completion',   leftPole: 'More starters',  rightPole: 'More finishers', value: patterns.startsFinishesRatio, color: 'rgba(94,234,212,0.80)' },
    { label: 'Rhythm',       leftPole: 'Burst mode',     rightPole: 'Consistent',     value: patterns.consistencyScore,    color: 'rgba(167,139,250,0.80)' },
    { label: 'Process style',leftPole: 'Bias to action', rightPole: 'Bias to plan',   value: patterns.planningActionScore, color: 'rgba(251,191,36,0.80)'  },
  ];

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => { LayoutAnimation.easeInEaseOut(); setExpanded(v => !v); }}
      style={ep.card}
    >
      {gauges.map((g, i) => {
        const pct = Math.max(4, Math.min(96, g.value));
        return (
          <View key={i} style={[ep.gauge, i < gauges.length - 1 && ep.gaugeBorder]}>
            <View style={ep.gaugeLabelRow}>
              <Text style={ep.gaugeLabel}>{g.label}</Text>
              {i === 0 && (
                <Feather
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={13}
                  color="rgba(152,212,250,0.30)"
                />
              )}
            </View>
            <View style={ep.track}>
              <View style={[ep.fill, { width: `${pct}%`, backgroundColor: g.color.replace(/[\d.]+\)$/, '0.18)') }]} />
              <View style={[ep.dot, { left: `${pct}%`, backgroundColor: g.color }]} />
            </View>
            <View style={ep.poles}>
              <Text style={ep.pole}>{g.leftPole}</Text>
              <Text style={ep.pole}>{g.rightPole}</Text>
            </View>
          </View>
        );
      })}
      {expanded && patterns.observations.length > 0 && (
        <View style={ep.obsWrap}>
          {patterns.observations.map((o, i) => (
            <View key={i} style={ep.obsRow}>
              <View style={ep.obsDot} />
              <Text style={ep.obsText}>{o}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const ep = StyleSheet.create({
  card:        { backgroundColor: 'rgba(94,234,212,0.03)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(94,234,212,0.12)', padding: 16, gap: 0 },
  gauge:       { paddingVertical: 12, gap: 6 },
  gaugeBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(152,212,250,0.07)' },
  gaugeLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gaugeLabel:  { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)' },
  track:       { height: 8, borderRadius: 4, backgroundColor: 'rgba(152,212,250,0.08)', position: 'relative', overflow: 'visible' },
  fill:        { height: '100%', borderRadius: 4, position: 'absolute', left: 0, top: 0 },
  dot:         { width: 12, height: 12, borderRadius: 6, position: 'absolute', top: -2, marginLeft: -6, borderWidth: 2, borderColor: 'rgba(2,6,14,0.80)' },
  poles:       { flexDirection: 'row', justifyContent: 'space-between' },
  pole:        { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.35)' },
  obsWrap:     { marginTop: 4, gap: 6 },
  obsRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  obsDot:      { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(94,234,212,0.40)', marginTop: 6 },
  obsText:     { flex: 1, fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', lineHeight: 17 },
});

// ── Cognitive dimension slider (read-only) ────────────────────────────────────

const DIM_COLORS = [
  'rgba(167,139,250,0.80)',
  'rgba(94,234,212,0.80)',
  'rgba(147,197,253,0.80)',
  'rgba(251,191,36,0.80)',
];

function DimensionSlider({ dim, color, onJump }: { dim: CognitiveDimension; color: string; onJump?: (date: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.max(4, Math.min(96, dim.score));

  return (
    <TouchableOpacity
      onPress={() => { LayoutAnimation.easeInEaseOut(); setExpanded(v => !v); }}
      style={[sl2.card, { borderColor: color.replace(/[\d.]+\)$/, '0.14)') }]}
      activeOpacity={0.85}
    >
      <View style={sl2.nameRow}>
        <Text style={sl2.name}>{dim.name}</Text>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={13}
          color="rgba(152,212,250,0.30)"
        />
      </View>
      <View style={sl2.trackWrap}>
        <View style={sl2.track}>
          <View style={[sl2.fillLeft, { width: `${pct}%`, backgroundColor: color.replace(/[\d.]+\)$/, '0.18)') }]} />
          <View style={[sl2.dot, { left: `${pct}%`, backgroundColor: color, marginLeft: -6 }]} />
        </View>
        <View style={sl2.poleRow}>
          <Text style={sl2.pole}>{dim.leftLabel}</Text>
          <Text style={sl2.pole}>{dim.rightLabel}</Text>
        </View>
      </View>
      {expanded && (
        <>
          <Text style={sl2.observation}>{dim.observation}</Text>
          {dim.sourceEntries?.length ? (
            <SourceExpand dates={dim.sourceEntries} onJump={onJump} />
          ) : null}
        </>
      )}
    </TouchableOpacity>
  );
}

const sl2 = StyleSheet.create({
  card:        { backgroundColor: 'rgba(152,212,250,0.03)', borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name:        { fontSize: 13, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.88)' },
  trackWrap:   { gap: 5 },
  track:       { height: 8, borderRadius: 4, backgroundColor: 'rgba(152,212,250,0.08)', position: 'relative', overflow: 'visible' },
  fillLeft:    { height: '100%', borderRadius: 4, position: 'absolute', left: 0, top: 0 },
  dot:         { width: 12, height: 12, borderRadius: 6, position: 'absolute', top: -2, borderWidth: 2, borderColor: 'rgba(2,6,14,0.80)' },
  poleRow:     { flexDirection: 'row', justifyContent: 'space-between' },
  pole:        { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.35)' },
  observation: { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.72)', lineHeight: 19 },
  tapHint:     { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.28)', marginTop: 2 },
});

// ── Repeating Loops ───────────────────────────────────────────────────────────

const LOOP_COLORS = [
  'rgba(252,165,165,0.85)',
  'rgba(251,191,36,0.85)',
  'rgba(167,139,250,0.85)',
  'rgba(249,168,212,0.85)',
];

function LoopCard({ loop, index }: { loop: RepeatingLoop; index: number }) {
  const color = LOOP_COLORS[index % LOOP_COLORS.length];
  return (
    <View style={[lp.card, { borderColor: color.replace(/[\d.]+\)$/, '0.16)'), backgroundColor: color.replace(/[\d.]+\)$/, '0.04)') }]}>
      <View style={[lp.dot, { backgroundColor: color }]} />
      <View style={lp.body}>
        <Text style={lp.name}>{loop.name}</Text>
        <Text style={lp.desc}>{loop.description}</Text>
        <View style={lp.triggerRow}>
          <Text style={lp.triggerKey}>Trigger: </Text>
          <Text style={lp.triggerVal}>{loop.triggerPattern}</Text>
        </View>
      </View>
    </View>
  );
}

const lp = StyleSheet.create({
  card:       { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot:        { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  body:       { flex: 1, gap: 4 },
  name:       { fontSize: 13, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.88)' },
  desc:       { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.65)', lineHeight: 17 },
  triggerRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  triggerKey: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', textTransform: 'uppercase', letterSpacing: 0.2 },
  triggerVal: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)' },
});

// ── Main tab ───────────────────────────────────────────────────────────────────

interface Props {
  data: HowYouThinkAnalysis;
  onJump?: (date: string) => void;
}

export default function HowYouThinkTab({ data, onJump }: Props) {
  return (
    <View style={s.root}>
      {/* Mirror notice */}
      <View style={s.notice}>
        <Feather name="eye" size={12} color="rgba(152,212,250,0.45)" />
        <Text style={s.noticeText}>
          Inferred from my writing — not self-reported. A mirror, not a test.
        </Text>
      </View>

      {/* ── 1. How you decide ── */}
      <View style={s.section}>
        <SectionLabel text="How you decide" />
        <DecisionStyleCard data={data.decisionStyle} />
      </View>

      {/* ── 2. Blind spots ── */}
      <View style={s.section}>
        <SectionLabel text="Blind spots" />
        {data.biasPatterns?.length ? (
          <BiasCard biases={data.biasPatterns} />
        ) : (
          <Pending text="Blind spots — generating from your entries…" />
        )}
      </View>

      {/* ── 3. From idea to action ── */}
      <View style={s.section}>
        <SectionLabel text="From idea to action" />
        {data.executionPatterns ? (
          <ExecutionCard patterns={data.executionPatterns} />
        ) : (
          <Pending text="From idea to action — generating from your entries…" />
        )}
      </View>

      {/* ── 4. How your mind moves ── */}
      <View style={s.section}>
        <SectionLabel text="How your mind moves · tap to expand" />
        {data.dimensions.map((dim, i) => (
          <DimensionSlider
            key={dim.name}
            dim={dim}
            color={DIM_COLORS[i % DIM_COLORS.length]}
            onJump={onJump}
          />
        ))}
      </View>

      {/* ── 5. Patterns you keep returning to ── */}
      <View style={s.section}>
        <SectionLabel text="Patterns you keep returning to" />
        {data.repeatingLoops?.length ? (
          data.repeatingLoops.map((loop, i) => (
            <LoopCard key={i} loop={loop} index={i} />
          ))
        ) : (
          <Pending text="Patterns you keep returning to — generating from your entries…" />
        )}
      </View>

      <Text style={s.updateNote}>This tab updates weekly — cognitive patterns change slowly.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:       { gap: 6 },
  notice:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(152,212,250,0.04)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.10)', padding: 12, marginBottom: 8 },
  noticeText: { flex: 1, fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', lineHeight: 17 },
  section:    { gap: 10, marginTop: 8 },
  updateNote: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.30)', textAlign: 'center', marginTop: 8 },
});
