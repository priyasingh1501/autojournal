import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { YourStoryAnalysis, ArcType } from '../../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Arc type meta ─────────────────────────────────────────────────────────────

const ARC_META: Record<ArcType, { icon: string; color: string; tagline: string }> = {
  Seeker:      { icon: 'compass',    color: 'rgba(167,139,250,0.85)', tagline: 'Making meaning through inquiry' },
  Builder:     { icon: 'tool',       color: 'rgba(94,234,212,0.85)',  tagline: 'Making meaning through creation' },
  Witness:     { icon: 'eye',        color: 'rgba(147,197,253,0.85)', tagline: 'Making meaning through presence' },
  Transformer: { icon: 'zap',        color: 'rgba(251,191,36,0.85)',  tagline: 'Making meaning through change' },
  Returner:    { icon: 'refresh-cw', color: 'rgba(110,231,183,0.85)', tagline: 'Making meaning through return' },
};

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

// ── Current chapter ───────────────────────────────────────────────────────────

function CurrentChapter({
  chapter, sourceEntries, onJump,
}: {
  chapter: YourStoryAnalysis['currentChapter'];
  sourceEntries: string[];
  onJump?: (d: string) => void;
}) {
  return (
    <View style={cc.card}>
      <Text style={cc.meta}>CURRENT CHAPTER</Text>
      <Text style={cc.dateRange}>{chapter.dateRange}</Text>
      <Text style={cc.title}>"{chapter.title}"</Text>
      <Text style={cc.narrative}>{chapter.narrative}</Text>
      <SourceExpand dates={sourceEntries} onJump={onJump} />
    </View>
  );
}

const cc = StyleSheet.create({
  card:      { gap: 6 },
  meta:      { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5 },
  dateRange: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)' },
  title:     { fontSize: 26, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.95)', lineHeight: 34 },
  narrative: { fontSize: 15, fontFamily: 'Baskerville', fontStyle: 'italic', color: 'rgba(152,212,250,0.80)', lineHeight: 24, marginTop: 4 },
});

// ── Recurring cast ────────────────────────────────────────────────────────────

function RecurringCast({ cast }: { cast: YourStoryAnalysis['recurringCast'] }) {
  if (!cast.length) return null;
  return (
    <View style={rc.section}>
      <Text style={rc.label}>RECURRING CAST</Text>
      <Text style={rc.sub}>People, relationships, tensions that keep appearing — unnamed</Text>
      <View style={rc.list}>
        {cast.map((c, i) => (
          <View key={i} style={rc.row}>
            <View style={rc.bullet} />
            <View style={{ flex: 1 }}>
              <Text style={rc.archetype}>{c.archetype}</Text>
              <View style={rc.freqRow}>
                {Array.from({ length: Math.min(c.frequency, 10) }).map((_, j) => (
                  <View key={j} style={[rc.freqDot, j < c.frequency ? rc.freqDotOn : {}]} />
                ))}
                <Text style={rc.freqNum}>{c.frequency}×</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const rc = StyleSheet.create({
  section:   { gap: 10 },
  label:     { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' },
  sub:       { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', lineHeight: 16, marginTop: -4 },
  list:      { gap: 14 },
  row:       { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bullet:    { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(152,212,250,0.30)', marginTop: 7 },
  archetype: { fontSize: 14, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.82)', lineHeight: 20 },
  freqRow:   { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  freqDot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(152,212,250,0.15)' },
  freqDotOn: { backgroundColor: 'rgba(152,212,250,0.50)' },
  freqNum:   { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', marginLeft: 2 },
});

// ── Arc pattern ───────────────────────────────────────────────────────────────

function ArcPattern({ arcPattern }: { arcPattern: YourStoryAnalysis['arcPattern'] }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const meta = ARC_META[arcPattern.type] ?? ARC_META.Seeker;
  const iconBg = meta.color.replace(/[\d.]+\)$/, '0.10)');
  const border = meta.color.replace(/[\d.]+\)$/, '0.18)');

  return (
    <View style={[ap.card, { borderColor: border }]}>
      <Text style={ap.label}>ARC PATTERN · updates quarterly</Text>

      <View style={ap.heroRow}>
        <View style={[ap.iconWrap, { backgroundColor: iconBg }]}>
          <Feather name={meta.icon as any} size={18} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[ap.arcType, { color: meta.color }]}>{arcPattern.type}</Text>
          <Text style={ap.tagline}>{meta.tagline}</Text>
        </View>
      </View>

      <Text style={ap.description}>{arcPattern.description}</Text>

      {/* History toggle */}
      {arcPattern.history.length > 1 && (
        <TouchableOpacity
          onPress={() => { LayoutAnimation.easeInEaseOut(); setHistoryOpen(v => !v); }}
          style={ap.histToggle}
          activeOpacity={0.7}
        >
          <Text style={ap.histLabel}>arc history</Text>
          <Feather name={historyOpen ? 'chevron-up' : 'chevron-down'} size={11} color="rgba(152,212,250,0.40)" />
        </TouchableOpacity>
      )}
      {historyOpen && (
        <View style={ap.histList}>
          {arcPattern.history.map((h, i) => {
            const hMeta = ARC_META[h.type as ArcType] ?? ARC_META.Seeker;
            const isLatest = i === arcPattern.history.length - 1;
            return (
              <View key={i} style={ap.histRow}>
                <View style={[ap.histDot, { backgroundColor: hMeta.color, opacity: isLatest ? 1 : 0.45 }]} />
                <Text style={[ap.histType, { color: isLatest ? hMeta.color : 'rgba(152,212,250,0.55)' }]}>
                  {h.type}
                </Text>
                <Text style={ap.histRange}>{h.dateRange}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const ap = StyleSheet.create({
  card:       { backgroundColor: 'rgba(152,212,250,0.03)', borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  label:      { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' },
  heroRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  arcType:    { fontSize: 20, fontFamily: 'Baskerville', fontWeight: '500' },
  tagline:    { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', marginTop: 2 },
  description:{ fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.70)', lineHeight: 19 },
  histToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  histLabel:  { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.38)', letterSpacing: 0.3 },
  histList:   { gap: 8, marginTop: 4 },
  histRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  histDot:    { width: 8, height: 8, borderRadius: 4 },
  histType:   { fontSize: 13, fontFamily: 'GillSans-Light', width: 90 },
  histRange:  { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', flex: 1 },
});

// ── Main tab ───────────────────────────────────────────────────────────────────

interface Props {
  data: YourStoryAnalysis;
  onJump?: (date: string) => void;
}

export default function YourStoryTab({ data, onJump }: Props) {
  return (
    <View style={s.root}>
      <CurrentChapter
        chapter={data.currentChapter}
        sourceEntries={data.sourceEntries}
        onJump={onJump}
      />
      <View style={s.divider} />
      <RecurringCast cast={data.recurringCast} />
      <View style={s.divider} />
      <ArcPattern arcPattern={data.arcPattern} />
    </View>
  );
}

const s = StyleSheet.create({
  root:    { gap: 4 },
  divider: { height: 1, backgroundColor: 'rgba(152,212,250,0.07)', marginVertical: 10 },
});
