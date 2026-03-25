import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WhoYouAreAnalysis, EnneagramResponse } from '../../types';
import { StorageService } from '../../services/StorageService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TRAIT_LABELS: Record<string, { label: string; left: string; right: string; color: string }> = {
  openness:          { label: 'Openness',          left: 'Conventional', right: 'Curious',      color: 'rgba(167,139,250,0.85)' },
  conscientiousness: { label: 'Conscientiousness', left: 'Flexible',     right: 'Disciplined',  color: 'rgba(94,234,212,0.85)'  },
  extraversion:      { label: 'Extraversion',      left: 'Introverted',  right: 'Extraverted',  color: 'rgba(147,197,253,0.85)' },
  agreeableness:     { label: 'Agreeableness',     left: 'Direct',       right: 'Harmonious',   color: 'rgba(110,231,183,0.85)' },
  neuroticism:       { label: 'Neuroticism',       left: 'Steady',       right: 'Reactive',     color: 'rgba(252,165,165,0.85)' },
};

const DIRECTION_ICON: Record<string, { icon: 'arrow-up' | 'arrow-down' | 'minus'; color: string }> = {
  rising:  { icon: 'arrow-up',   color: 'rgba(110,231,183,0.80)' },
  falling: { icon: 'arrow-down', color: 'rgba(252,165,165,0.80)' },
  stable:  { icon: 'minus',      color: 'rgba(152,212,250,0.50)' },
};

const ENNEAGRAM_NAMES: Record<number, string> = {
  1: 'The Reformer',   2: 'The Helper',     3: 'The Achiever',
  4: 'The Individualist', 5: 'The Investigator', 6: 'The Loyalist',
  7: 'The Enthusiast', 8: 'The Challenger', 9: 'The Peacemaker',
};

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

// ── Big Five bar ──────────────────────────────────────────────────────────────

function TraitBar({
  traitKey, trait, narrative, onJump, sourceEntries,
}: {
  traitKey: string;
  trait: { score: number; direction: 'rising' | 'stable' | 'falling' };
  narrative?: string;
  onJump?: (date: string) => void;
  sourceEntries?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = TRAIT_LABELS[traitKey];
  const dir  = DIRECTION_ICON[trait.direction];
  if (!meta) return null;
  return (
    <TouchableOpacity
      onPress={() => { LayoutAnimation.easeInEaseOut(); setExpanded(v => !v); }}
      style={tb.wrap}
      activeOpacity={0.85}
    >
      <View style={tb.headerRow}>
        <Text style={tb.traitName}>{meta.label}</Text>
        <View style={tb.dirRow}>
          <Feather name={dir.icon} size={11} color={dir.color} />
          <Text style={[tb.dirLabel, { color: dir.color }]}>{trait.direction}</Text>
        </View>
      </View>
      <View style={tb.track}>
        <View style={[tb.fill, { width: `${trait.score}%`, backgroundColor: meta.color }]} />
        <View style={tb.midline} />
      </View>
      <View style={tb.poleRow}>
        <Text style={tb.pole}>{meta.left}</Text>
        <Text style={tb.pole}>{meta.right}</Text>
      </View>
      {expanded && narrative && (
        <Text style={tb.narrative}>{narrative}</Text>
      )}
      {expanded && sourceEntries?.length ? (
        <SourceExpand dates={sourceEntries} onJump={onJump} />
      ) : null}
    </TouchableOpacity>
  );
}

const tb = StyleSheet.create({
  wrap:      { gap: 5 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  traitName: { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.85)' },
  dirRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dirLabel:  { fontSize: 10, fontFamily: 'GillSans-Light' },
  track:     { height: 6, borderRadius: 3, backgroundColor: 'rgba(152,212,250,0.08)', overflow: 'visible', position: 'relative' },
  fill:      { height: '100%', borderRadius: 3 },
  midline:   { position: 'absolute', left: '50%', top: -2, width: 1, height: 10, backgroundColor: 'rgba(152,212,250,0.20)' },
  poleRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  pole:      { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.35)' },
  narrative: { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.70)', lineHeight: 18, marginTop: 4, fontStyle: 'italic' },
});

// ── Enneagram hypothesis card ─────────────────────────────────────────────────

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
      <Text style={eg.headline}>Enneagram Hypothesis</Text>
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

// ── Main tab ───────────────────────────────────────────────────────────────────

interface Props {
  data: WhoYouAreAnalysis;
  enneagramResponse: EnneagramResponse | null;
  onEnneagramRespond: (r: EnneagramResponse) => void;
  onJump?: (date: string) => void;
}

export default function WhoYouAreTab({ data, enneagramResponse, onEnneagramRespond, onJump }: Props) {
  const traits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'] as const;

  const handleRespond = async (typeId: number, response: 'confirmed' | 'partly' | 'rejected') => {
    const r: EnneagramResponse = { typeId, response, date: new Date().toISOString().split('T')[0] };
    await StorageService.saveEnneagramResponse(r);
    onEnneagramRespond(r);
  };

  return (
    <View style={s.root}>
      {/* Narrative hero */}
      <Text style={s.narrative}>{data.narrative}</Text>

      {/* Big Five */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>BIG FIVE · tap a trait to expand</Text>
        <View style={s.traitList}>
          {traits.map(k => (
            <TraitBar
              key={k}
              traitKey={k}
              trait={data.bigFive[k]}
              narrative={data.bigFiveNarratives[k]}
              sourceEntries={data.sourceEntries}
              onJump={onJump}
            />
          ))}
        </View>
      </View>

      {/* Enneagram */}
      <EnneagramCard
        enneagram={data.enneagram}
        response={enneagramResponse}
        onRespond={handleRespond}
        sourceEntries={data.sourceEntries}
        onJump={onJump}
      />

      {/* Global source */}
      <SourceExpand dates={data.sourceEntries} onJump={onJump} />
    </View>
  );
}

const s = StyleSheet.create({
  root:         { gap: 20 },
  narrative:    { fontSize: 16, fontFamily: 'Baskerville', fontStyle: 'italic', color: 'rgba(224,242,254,0.88)', lineHeight: 26 },
  section:      { gap: 10 },
  sectionLabel: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' },
  traitList:    { gap: 16 },
});
