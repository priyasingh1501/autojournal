import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WhoYouAreAnalysis, EnneagramResponse, MotivationEntry, SelfLabel } from '../../types';
import { StorageService } from '../../services/StorageService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Source expand ─────────────────────────────────────────────────────────────

function SourceExpand({
  dates, onJump,
}: { dates: string[]; onJump?: (date: string) => void }) {
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

// ── Self Labels ───────────────────────────────────────────────────────────────

const VALENCE_COLOR: Record<string, string> = {
  positive: 'rgba(110,231,183,0.80)',
  negative: 'rgba(252,165,165,0.80)',
  neutral:  'rgba(152,212,250,0.55)',
};

function SelfLabelsSection({ labels }: { labels: SelfLabel[] }) {
  if (!labels.length) return null;
  return (
    <View style={sl2.wrap}>
      <Text style={sl2.heading}>Words you use about yourself</Text>
      <Text style={sl2.sub}>Recurring "I am…" patterns detected in your writing</Text>
      <View style={sl2.chips}>
        {labels.map((l, i) => {
          const color = VALENCE_COLOR[l.valence] ?? VALENCE_COLOR.neutral;
          return (
            <View key={i} style={[sl2.chip, { borderColor: color.replace(/[\d.]+\)$/, '0.22)'), backgroundColor: color.replace(/[\d.]+\)$/, '0.05)') }]}>
              <Text style={[sl2.chipText, { color }]}>{l.label}</Text>
              <Text style={sl2.chipFreq}>{l.frequency}×</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const sl2 = StyleSheet.create({
  wrap:     { gap: 10 },
  heading:  { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' },
  sub:      { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', lineHeight: 16, marginTop: -4 },
  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontFamily: 'GillSans-Light', lineHeight: 18 },
  chipFreq: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.35)' },
});

// ── Motivation Pulse ──────────────────────────────────────────────────────────

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

// ── Enneagram hypothesis card ─────────────────────────────────────────────────

const ENNEAGRAM_NAMES: Record<number, string> = {
  1: 'The Reformer',   2: 'The Helper',     3: 'The Achiever',
  4: 'The Individualist', 5: 'The Investigator', 6: 'The Loyalist',
  7: 'The Enthusiast', 8: 'The Challenger', 9: 'The Peacemaker',
};

function EnneagramCard({
  enneagram, response, onRespond, onJump, sourceEntries,
}: {
  enneagram: WhoYouAreAnalysis['enneagram'];
  response:  EnneagramResponse | null;
  onRespond: (typeId: number, r: 'confirmed' | 'partly' | 'rejected') => void;
  onJump?:   (date: string) => void;
  sourceEntries?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const confirmed = response?.response === 'confirmed' || response?.response === 'partly';
  return (
    <View style={eg.card}>
      <Text style={eg.headline}>How you're wired</Text>
      <Text style={eg.sub}>Based on patterns in my entries — unconfirmed. Does this feel true?</Text>

      {enneagram.types.map(t => (
        <View key={t} style={eg.typeRow}>
          <View style={eg.typeLeft}>
            <Text style={eg.typeNum}>Type {t}</Text>
            <Text style={eg.typeName}>{ENNEAGRAM_NAMES[t] ?? ''}</Text>
          </View>
          <Text style={eg.typeDesc}>{enneagram.typeSummaries[String(t)] ?? ''}</Text>
        </View>
      ))}

      {/* Response buttons */}
      <View style={eg.btnRow}>
        {(['confirmed', 'partly', 'rejected'] as const).map(r => {
          const label = r === 'confirmed' ? 'Yes, that\'s me' : r === 'partly' ? 'Partly' : 'Not me';
          const active = enneagram.types[0] && response?.typeId === enneagram.types[0] && response?.response === r;
          return (
            <TouchableOpacity
              key={r}
              onPress={() => onRespond(enneagram.types[0] ?? 0, r)}
              style={[eg.btn, active ? eg.btnActive : null]}
              activeOpacity={0.75}
            >
              <Text style={[eg.btnText, active ? eg.btnTextActive : null]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Unlocked block when confirmed or partly */}
      {confirmed && (
        <TouchableOpacity
          onPress={() => { LayoutAnimation.easeInEaseOut(); setExpanded(v => !v); }}
          style={eg.unlock}
          activeOpacity={0.8}
        >
          <View style={eg.unlockHeader}>
            <Feather name="unlock" size={12} color="rgba(196,181,253,0.80)" />
            <Text style={eg.unlockLabel}>Core profile</Text>
            <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color="rgba(152,212,250,0.40)" />
          </View>
          {expanded && (
            <View style={eg.unlockBody}>
              <View style={eg.row}><Text style={eg.rowKey}>Core fear</Text><Text style={eg.rowVal}>{enneagram.coreFear}</Text></View>
              <View style={eg.row}><Text style={eg.rowKey}>Core desire</Text><Text style={eg.rowVal}>{enneagram.coreDesire}</Text></View>
              <View style={eg.row}><Text style={eg.rowKey}>Growth direction</Text><Text style={eg.rowVal}>{enneagram.growthDirection}</Text></View>
            </View>
          )}
        </TouchableOpacity>
      )}

      {sourceEntries?.length ? <SourceExpand dates={sourceEntries} onJump={onJump} /> : null}
    </View>
  );
}

const eg = StyleSheet.create({
  card:         { backgroundColor: 'rgba(196,181,253,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(196,181,253,0.14)', padding: 16, gap: 10 },
  headline:     { fontSize: 14, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.92)' },
  sub:          { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)', lineHeight: 16 },
  typeRow:      { gap: 4 },
  typeLeft:     { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  typeNum:      { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(196,181,253,0.70)', letterSpacing: 0.3 },
  typeName:     { fontSize: 13, fontFamily: 'Baskerville', color: 'rgba(224,242,254,0.85)' },
  typeDesc:     { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.65)', lineHeight: 17 },
  btnRow:       { flexDirection: 'row', gap: 8 },
  btn:          { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(196,181,253,0.20)', alignItems: 'center' },
  btnActive:    { backgroundColor: 'rgba(196,181,253,0.15)', borderColor: 'rgba(196,181,253,0.50)' },
  btnText:      { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)' },
  btnTextActive:{ color: 'rgba(196,181,253,0.90)' },
  unlock:       { backgroundColor: 'rgba(196,181,253,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(196,181,253,0.18)', padding: 12 },
  unlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  unlockLabel:  { flex: 1, fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(196,181,253,0.80)' },
  unlockBody:   { marginTop: 10, gap: 8 },
  row:          { gap: 3 },
  rowKey:       { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', textTransform: 'uppercase', letterSpacing: 0.3 },
  rowVal:       { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.80)', lineHeight: 18 },
});

// ── Motivation & Avoidance Drivers ────────────────────────────────────────────

const DRIVER_META: Record<string, { icon: string; color: string }> = {
  status:   { icon: 'award',    color: 'rgba(251,191,36,0.85)'  },
  security: { icon: 'shield',   color: 'rgba(94,234,212,0.85)'  },
  freedom:  { icon: 'wind',     color: 'rgba(147,197,253,0.85)' },
  love:     { icon: 'heart',    color: 'rgba(249,168,212,0.85)' },
  mastery:  { icon: 'zap',      color: 'rgba(167,139,250,0.85)' },
  control:  { icon: 'sliders',  color: 'rgba(110,231,183,0.85)' },
  meaning:  { icon: 'compass',  color: 'rgba(196,181,253,0.85)' },
  pleasure: { icon: 'sun',      color: 'rgba(252,165,165,0.85)' },
};

/** What the user actually avoids — the opposite/fear side of each driver. */
const AVOIDANCE_LABEL: Record<string, string> = {
  status:   'Irrelevance',
  security: 'Instability',
  freedom:  'Being controlled',
  love:     'Rejection',
  mastery:  'Incompetence',
  control:  'Chaos',
  meaning:  'Purposelessness',
  pleasure: 'Discomfort',
};

function DriverRow({ entry }: { entry: MotivationEntry }) {
  const meta  = DRIVER_META[entry.driver] ?? { icon: 'circle', color: 'rgba(152,212,250,0.60)' };
  const isAway = entry.type === 'away';
  const barColor = isAway
    ? meta.color.replace(/[\d.]+\)$/, '0.45)')
    : meta.color;

  return (
    <View style={md.row}>
      <View style={[md.iconWrap, { backgroundColor: meta.color.replace(/[\d.]+\)$/, '0.08)'), borderColor: meta.color.replace(/[\d.]+\)$/, '0.18)') }]}>
        <Feather name={meta.icon as any} size={13} color={meta.color} />
      </View>
      <View style={md.info}>
        <View style={md.labelRow}>
          <Text style={md.driverName}>
            {isAway
              ? (AVOIDANCE_LABEL[entry.driver] ?? entry.driver.charAt(0).toUpperCase() + entry.driver.slice(1))
              : entry.driver.charAt(0).toUpperCase() + entry.driver.slice(1)}
          </Text>
          <Text style={[md.badge, isAway ? md.badgeAway : md.badgeToward]}>
            {isAway ? 'avoids' : 'moves toward'}
          </Text>
        </View>
        <View style={md.track}>
          <View style={[md.fill, { width: `${entry.strength}%`, backgroundColor: barColor }]} />
        </View>
        <Text style={md.observation}>{entry.observation}</Text>
      </View>
    </View>
  );
}

function MotivationSection({ drivers }: { drivers: MotivationEntry[] }) {
  const toward = drivers.filter(d => d.type === 'toward').slice(0, 3);
  const away   = drivers.filter(d => d.type === 'away').slice(0, 3);

  return (
    <View style={md.card}>
      <Text style={md.headline}>What moves you</Text>
      <Text style={md.sub}>What pulls you forward and what you instinctively move away from</Text>

      {toward.length > 0 && (
        <View style={md.group}>
          <Text style={md.groupLabel}>moves toward</Text>
          {toward.map((d, i) => <DriverRow key={i} entry={d} />)}
        </View>
      )}

      {away.length > 0 && (
        <View style={md.group}>
          <Text style={md.groupLabel}>avoids</Text>
          {away.map((d, i) => <DriverRow key={i} entry={d} />)}
        </View>
      )}
    </View>
  );
}

const md = StyleSheet.create({
  card:        { backgroundColor: 'rgba(251,191,36,0.03)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(251,191,36,0.12)', padding: 16, gap: 14 },
  headline:    { fontSize: 14, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.92)' },
  sub:         { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)', lineHeight: 16, marginTop: -8 },
  group:       { gap: 12 },
  groupLabel:  { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.38)', letterSpacing: 0.5, textTransform: 'uppercase' },
  row:         { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconWrap:    { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  info:        { flex: 1, gap: 5 },
  labelRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  driverName:  { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.88)' },
  badge:       { fontSize: 9, fontFamily: 'GillSans-Light', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, overflow: 'hidden' },
  badgeToward: { color: 'rgba(110,231,183,0.80)', borderColor: 'rgba(110,231,183,0.22)', backgroundColor: 'rgba(110,231,183,0.06)' },
  badgeAway:   { color: 'rgba(252,165,165,0.80)', borderColor: 'rgba(252,165,165,0.22)', backgroundColor: 'rgba(252,165,165,0.06)' },
  track:       { height: 4, borderRadius: 2, backgroundColor: 'rgba(152,212,250,0.07)' },
  fill:        { height: '100%', borderRadius: 2 },
  observation: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', lineHeight: 16 },
});

// ── Main tab ───────────────────────────────────────────────────────────────────

interface Props {
  data: WhoYouAreAnalysis;
  enneagramResponse: EnneagramResponse | null;
  onEnneagramRespond: (r: EnneagramResponse) => void;
  onJump?: (date: string) => void;
  selfLabels?: SelfLabel[];
  motivationPulse?: string;
  motivationRationale?: string;
}

export default function WhoYouAreTab({ data, enneagramResponse, onEnneagramRespond, onJump, selfLabels, motivationPulse, motivationRationale }: Props) {
  const handleRespond = async (typeId: number, response: 'confirmed' | 'partly' | 'rejected') => {
    const r: EnneagramResponse = { typeId, response, date: new Date().toISOString().split('T')[0] };
    await StorageService.saveEnneagramResponse(r);
    onEnneagramRespond(r);
  };

  return (
    <View style={s.root}>
      {/* Self labels — moved here from Story tab */}
      {selfLabels?.length ? <SelfLabelsSection labels={selfLabels} /> : null}

      {/* Enneagram */}
      <EnneagramCard
        enneagram={data.enneagram}
        response={enneagramResponse}
        onRespond={handleRespond}
        sourceEntries={data.sourceEntries}
        onJump={onJump}
      />

      {/* What moves you — drivers */}
      {data.motivationDrivers?.length ? (
        <MotivationSection drivers={data.motivationDrivers} />
      ) : (
        <View style={s.pending}>
          <Feather name="clock" size={12} color="rgba(152,212,250,0.30)" />
          <Text style={s.pendingText}>What moves you — generating from your entries…</Text>
        </View>
      )}

      {/* Motivation pulse — moved here from Values tab */}
      {motivationPulse && motivationRationale ? (
        <MotivationPulse pulse={motivationPulse} rationale={motivationRationale} />
      ) : null}

      {/* Global source */}
      <SourceExpand dates={data.sourceEntries} onJump={onJump} />
    </View>
  );
}

const s = StyleSheet.create({
  root:        { gap: 20 },
  pending:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(152,212,250,0.03)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.08)', padding: 14 },
  pendingText: { flex: 1, fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.35)', fontStyle: 'italic' },
});
