import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  LayoutAnimation, UIManager, Platform, Animated, Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { YourStoryAnalysis, ArcType, SelfLabel, NarrativePattern, InternalContradiction } from '../../types';
import {
  getCachedStoryImage, generateStoryImage,
  chapterImagePrompt, castImagePrompt, arcImagePrompt,
  chapterImageId, castImageId, arcImageId,
} from '../../services/StoryImageService';

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

// Cast avatar colors — one per position so each character has a consistent hue
const CAST_COLORS = [
  { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.28)', icon: 'rgba(167,139,250,0.90)' },
  { bg: 'rgba(94,234,212,0.10)',  border: 'rgba(94,234,212,0.25)',  icon: 'rgba(94,234,212,0.90)'  },
  { bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.25)',  icon: 'rgba(251,191,36,0.90)'  },
  { bg: 'rgba(249,168,212,0.10)', border: 'rgba(249,168,212,0.25)', icon: 'rgba(249,168,212,0.90)' },
  { bg: 'rgba(110,231,183,0.10)', border: 'rgba(110,231,183,0.25)', icon: 'rgba(110,231,183,0.90)' },
];

// ── Reusable image banner ───────────────────────────────────────────────────��─

/**
 * Loads (or generates) a story image for `imageId` and displays it as a
 * banner. Shows a shimmer placeholder while loading.
 */
function StoryImageBanner({
  imageId, prompt, height, borderRadius,
}: {
  imageId: string;
  prompt:  string;
  height:  number;
  borderRadius?: { topLeft: number; topRight: number };
}) {
  const [uri,        setUri]       = useState<string | null>(null);
  const imageFade = useRef(new Animated.Value(0)).current;
  const shimmer   = useRef(new Animated.Value(0)).current;

  // Shimmer loop while no image
  useEffect(() => {
    if (uri) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [uri]);

  useEffect(() => {
    const cancelled = { current: false };
    (async () => {
      // 1. Check cache
      const cached = await getCachedStoryImage(imageId);
      if (cancelled.current) return;
      if (cached) {
        setUri(cached);
        Animated.timing(imageFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        return;
      }
      // 2. Generate in background — fire-and-forget, never blocks card render
      const generated = await generateStoryImage(imageId, prompt);
      if (cancelled.current) return;
      if (generated) {
        setUri(generated);
        Animated.timing(imageFade, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      }
    })();
    return () => { cancelled.current = true; };
  }, [imageId]);

  const br = {
    borderTopLeftRadius:  borderRadius?.topLeft  ?? 0,
    borderTopRightRadius: borderRadius?.topRight ?? 0,
  };

  const shimmerOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  return (
    <View style={[ib.wrap, { height }, br]}>
      {/* Shimmer placeholder */}
      {!uri && (
        <Animated.View style={[StyleSheet.absoluteFill, br, { opacity: shimmerOpacity }]}>
          <LinearGradient
            colors={['#0a1428', '#0d2040', '#061020']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, br]}
          />
        </Animated.View>
      )}

      {/* Actual image */}
      {uri && (
        <Animated.Image
          source={{ uri }}
          style={[ib.image, { height }, br, { opacity: imageFade }]}
          resizeMode="cover"
        />
      )}

      {/* Bottom gradient so text below reads over any bleed */}
      <LinearGradient
        colors={['transparent', 'rgba(2,6,14,0.72)']}
        style={[StyleSheet.absoluteFill, { top: height * 0.45 }, br]}
        pointerEvents="none"
      />
    </View>
  );
}

const ib = StyleSheet.create({
  wrap:  { width: '100%', overflow: 'hidden' },
  image: { width: '100%' },
});

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
  chapter, arcType, sourceEntries, onJump,
}: {
  chapter: YourStoryAnalysis['currentChapter'];
  arcType?: ArcType;
  sourceEntries: string[];
  onJump?: (d: string) => void;
}) {
  const accentColor  = arcType ? ARC_META[arcType].color : 'rgba(152,212,250,0.60)';
  const accentBg     = arcType ? ARC_META[arcType].color.replace(/[\d.]+\)$/, '0.06)') : 'rgba(152,212,250,0.04)';
  const accentBorder = arcType ? ARC_META[arcType].color.replace(/[\d.]+\)$/, '0.16)') : 'rgba(152,212,250,0.10)';

  const imgId     = chapterImageId(chapter.title);
  const imgPrompt = chapterImagePrompt(chapter.title, chapter.narrative);

  return (
    <View style={[cc.card, { backgroundColor: accentBg, borderColor: accentBorder }]}>
      {/* Image banner — top of card */}
      <StoryImageBanner
        imageId={imgId}
        prompt={imgPrompt}
        height={130}
        borderRadius={{ topLeft: 18, topRight: 18 }}
      />

      {/* Decorative watermark chapter number */}
      <Text style={cc.watermark}>I</Text>

      <View style={cc.contentRow}>
        <View style={[cc.accentBar, { backgroundColor: accentColor }]} />
        <View style={cc.inner}>
          <Text style={cc.meta}>CURRENT CHAPTER</Text>
          <Text style={cc.dateRange}>{chapter.dateRange}</Text>
          <Text style={cc.title}>"{chapter.title}"</Text>
          <Text style={cc.narrative}>{chapter.narrative}</Text>
          <SourceExpand dates={sourceEntries} onJump={onJump} />
        </View>
      </View>
    </View>
  );
}

const cc = StyleSheet.create({
  card:       {
    borderRadius: 18, borderWidth: 1, overflow: 'hidden',
    flexDirection: 'column',
  },
  watermark:  {
    position: 'absolute', right: 16, top: 8,
    fontSize: 80, fontFamily: 'Baskerville',
    color: 'rgba(152,212,250,0.05)', lineHeight: 90,
    pointerEvents: 'none',
  },
  contentRow: { flexDirection: 'row' },
  accentBar:  { width: 3, borderRadius: 2, marginLeft: 2, marginVertical: 14 },
  inner:      { flex: 1, padding: 16, gap: 5 },
  meta:       { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5 },
  dateRange:  { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)' },
  title:      { fontSize: 24, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.95)', lineHeight: 32, marginTop: 2 },
  narrative:  { fontSize: 14, fontFamily: 'Baskerville', color: 'rgba(152,212,250,0.80)', lineHeight: 22, marginTop: 2 },
});

// ── Recurring cast card ───────────────────────────────────────────────────────

function CastCard({
  archetype, frequency, index, interactionStyle, conflictStyle,
}: {
  archetype: string;
  frequency: number;
  index: number;
  interactionStyle?: string;
  conflictStyle?: string;
}) {
  const palette = CAST_COLORS[index % CAST_COLORS.length];
  const maxDots = 7;
  const filled  = Math.min(frequency, maxDots);

  const imgId     = castImageId(archetype);
  const imgPrompt = castImagePrompt(archetype);

  return (
    <View style={[crd.card, { borderColor: palette.border }]}>
      {/* Glassmorphic tint */}
      <View style={[crd.glassTint, { backgroundColor: palette.bg }]} />

      {/* Image banner */}
      <StoryImageBanner
        imageId={imgId}
        prompt={imgPrompt}
        height={90}
        borderRadius={{ topLeft: 16, topRight: 16 }}
      />

      {/* Content below image */}
      <View style={crd.content}>
        <Text style={[crd.heading, { color: palette.icon }]}>
          FIGURE {String(index + 1).padStart(2, '0')}
        </Text>
        <Text style={crd.archetype}>{archetype}</Text>

        {/* Frequency dots */}
        <View style={crd.freqRow}>
          {Array.from({ length: maxDots }).map((_, j) => (
            <View
              key={j}
              style={[
                crd.dot,
                j < filled ? { backgroundColor: palette.icon } : { backgroundColor: 'rgba(152,212,250,0.10)' },
              ]}
            />
          ))}
        </View>
        <Text style={[crd.freqLabel, { color: palette.icon }]}>{frequency}×</Text>

        {/* Interaction + conflict styles */}
        {(interactionStyle || conflictStyle) && (
          <View style={crd.stylesWrap}>
            {interactionStyle && (
              <View style={crd.styleRow}>
                <Text style={[crd.styleKey, { color: palette.icon.replace(/[\d.]+\)$/, '0.50)') }]}>how you interact</Text>
                <Text style={crd.styleVal}>{interactionStyle}</Text>
              </View>
            )}
            {conflictStyle && (
              <View style={crd.styleRow}>
                <Text style={[crd.styleKey, { color: palette.icon.replace(/[\d.]+\)$/, '0.50)') }]}>in conflict</Text>
                <Text style={crd.styleVal}>{conflictStyle}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const crd = StyleSheet.create({
  card: {
    width: 210,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(10,16,40,0.55)',
    overflow: 'hidden',
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  content: {
    padding: 12,
    gap: 8,
  },
  heading: {
    fontSize: 10, fontFamily: 'GillSans-Light',
    letterSpacing: 0.6, textTransform: 'uppercase',
  },
  archetype: {
    fontSize: 14, fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.85)', lineHeight: 20,
  },
  freqRow:    { flexDirection: 'row', gap: 3, flexWrap: 'wrap' },
  dot:        { width: 5, height: 5, borderRadius: 2.5 },
  freqLabel:  { fontSize: 10, fontFamily: 'GillSans-Light', marginTop: -2 },
  stylesWrap: { marginTop: 6, gap: 6, borderTopWidth: 1, borderTopColor: 'rgba(152,212,250,0.08)', paddingTop: 8 },
  styleRow:   { gap: 2 },
  styleKey:   { fontSize: 9, fontFamily: 'GillSans-Light', textTransform: 'uppercase', letterSpacing: 0.3 },
  styleVal:   { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.70)', lineHeight: 15 },
});

// ── Recurring cast section ────────────────────────────────────────────────────

function RecurringCast({ cast }: { cast: YourStoryAnalysis['recurringCast'] }) {
  if (!cast.length) return null;
  return (
    <View style={rc.section}>
      <Text style={rc.label}>RECURRING CAST</Text>
      <Text style={rc.sub}>People and tensions that keep appearing — drawn from what you wrote, unnamed</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={rc.scroll}
      >
        {cast.map((c, i) => (
          <CastCard
            key={i}
            archetype={c.archetype}
            frequency={c.frequency}
            index={i}
            interactionStyle={c.interactionStyle}
            conflictStyle={c.conflictStyle}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const rc = StyleSheet.create({
  section: { gap: 10 },
  label:   { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' },
  sub:     { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', lineHeight: 16, marginTop: -4 },
  scroll:  { gap: 10, paddingBottom: 4, paddingRight: 4 },
});

// ── Arc pattern ───────────────────────────────────────────────────────────────

function ArcPattern({ arcPattern }: { arcPattern: YourStoryAnalysis['arcPattern'] }) {
  const meta    = ARC_META[arcPattern.type] ?? ARC_META.Seeker;
  const iconBg  = meta.color.replace(/[\d.]+\)$/, '0.10)');
  const border  = meta.color.replace(/[\d.]+\)$/, '0.18)');
  const cardBg  = meta.color.replace(/[\d.]+\)$/, '0.04)');

  const imgId     = arcImageId(arcPattern.type);
  const imgPrompt = arcImagePrompt(arcPattern.type);

  return (
    <View style={[ap.card, { borderColor: border, backgroundColor: cardBg }]}>
      {/* Image banner */}
      <StoryImageBanner
        imageId={imgId}
        prompt={imgPrompt}
        height={110}
        borderRadius={{ topLeft: 18, topRight: 18 }}
      />

      <View style={ap.inner}>
        <Text style={ap.label}>ARC PATTERN · updates quarterly</Text>

        <View style={ap.heroRow}>
          <View style={[ap.iconWrap, { backgroundColor: iconBg, borderColor: border }]}>
            <Feather name={meta.icon as any} size={18} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[ap.arcType, { color: meta.color }]}>{arcPattern.type}</Text>
            <Text style={ap.tagline}>{meta.tagline}</Text>
          </View>
        </View>

        <Text style={ap.description}>{arcPattern.description}</Text>

        {/* Timeline strip — always visible */}
        {arcPattern.history.length > 0 && (
          <View style={ap.timeline}>
            {arcPattern.history.map((h, i) => {
              const hMeta    = ARC_META[h.type as ArcType] ?? ARC_META.Seeker;
              const isLast   = i === arcPattern.history.length - 1;
              const dotColor = isLast ? hMeta.color : hMeta.color.replace(/[\d.]+\)$/, '0.35)');
              return (
                <React.Fragment key={i}>
                  <View style={ap.timelineNode}>
                    <View style={[
                      ap.timelineDot,
                      { backgroundColor: dotColor },
                      isLast && ap.timelineDotActive,
                    ]} />
                    <Text style={[ap.timelineType, { color: dotColor }]}>{h.type}</Text>
                    <Text style={ap.timelineRange}>{h.dateRange}</Text>
                  </View>
                  {!isLast && (
                    <View style={[ap.timelineLine, { backgroundColor: hMeta.color.replace(/[\d.]+\)$/, '0.18)') }]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const ap = StyleSheet.create({
  card:              { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  inner:             { padding: 16, gap: 12 },
  label:             { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' },
  heroRow:           { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap:          { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  arcType:           { fontSize: 22, fontFamily: 'Baskerville', fontWeight: '500' },
  tagline:           { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', marginTop: 2 },
  description:       { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.70)', lineHeight: 19 },
  timeline:          { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4, flexWrap: 'wrap', gap: 0 },
  timelineNode:      { alignItems: 'center', gap: 4, minWidth: 64 },
  timelineDot:       { width: 8, height: 8, borderRadius: 4 },
  timelineDotActive: { width: 12, height: 12, borderRadius: 6, marginTop: -2 },
  timelineType:      { fontSize: 11, fontFamily: 'GillSans-Light', textAlign: 'center' },
  timelineRange:     { fontSize: 9,  fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.38)', textAlign: 'center' },
  timelineLine:      { flex: 1, height: 1, marginTop: 5, minWidth: 12 },
});

// ── Self Labels ───────────────────────────────────────────────────────────────

const VALENCE_COLOR: Record<string, string> = {
  positive: 'rgba(110,231,183,0.80)',
  negative: 'rgba(252,165,165,0.80)',
  neutral:  'rgba(152,212,250,0.55)',
};

function SelfLabelsSection({ labels }: { labels: SelfLabel[] }) {
  return (
    <View style={self.wrap}>
      <Text style={self.heading}>Self Labels</Text>
      <Text style={self.sub}>Recurring "I am…" statements detected in your writing</Text>
      <View style={self.chips}>
        {labels.map((l, i) => {
          const color = VALENCE_COLOR[l.valence];
          return (
            <View key={i} style={[self.chip, { borderColor: color.replace(/[\d.]+\)$/, '0.22)'), backgroundColor: color.replace(/[\d.]+\)$/, '0.05)') }]}>
              <Text style={[self.chipText, { color }]}>{l.label}</Text>
              <Text style={self.chipFreq}>{l.frequency}×</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const self = StyleSheet.create({
  wrap:      { gap: 10 },
  heading:   { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' },
  sub:       { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', lineHeight: 16, marginTop: -4 },
  chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText:  { fontSize: 13, fontFamily: 'GillSans-Light', lineHeight: 18 },
  chipFreq:  { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.35)' },
});

// ── Narrative Patterns + Internal Contradictions ──────────────────────────────

function NarrativePatternsSection({
  patterns, contradictions,
}: {
  patterns: NarrativePattern[];
  contradictions: InternalContradiction[];
}) {
  return (
    <View style={np.wrap}>
      {patterns.length > 0 && (
        <View style={np.block}>
          <Text style={np.heading}>Narrative Patterns</Text>
          {patterns.map((p, i) => (
            <View key={i} style={[np.row, i < patterns.length - 1 && np.rowBorder]}>
              <Text style={np.pattern}>{p.pattern}</Text>
              <Text style={np.obs}>{p.observation}</Text>
            </View>
          ))}
        </View>
      )}

      {contradictions.length > 0 && (
        <View style={np.block}>
          <Text style={np.heading}>Internal Contradictions</Text>
          <Text style={np.sub}>Things that seem to be in tension in how you see yourself</Text>
          {contradictions.map((c, i) => (
            <View key={i} style={np.contradictionCard}>
              <Text style={np.statement}>{c.statement1}</Text>
              <View style={np.vsRow}>
                <View style={np.vsLine} />
                <Text style={np.vs}>vs</Text>
                <View style={np.vsLine} />
              </View>
              <Text style={np.statement}>{c.statement2}</Text>
              <Text style={np.tension}>{c.tension}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const np = StyleSheet.create({
  wrap:             { gap: 18 },
  block:            { gap: 10 },
  heading:          { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' },
  sub:              { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', lineHeight: 16, marginTop: -4 },
  row:              { paddingVertical: 10, gap: 3 },
  rowBorder:        { borderBottomWidth: 1, borderBottomColor: 'rgba(152,212,250,0.07)' },
  pattern:          { fontSize: 13, fontFamily: 'Baskerville', color: 'rgba(224,242,254,0.85)' },
  obs:              { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', lineHeight: 17 },
  contradictionCard:{ backgroundColor: 'rgba(252,165,165,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(252,165,165,0.14)', padding: 14, gap: 8 },
  statement:        { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.82)', lineHeight: 18, fontStyle: 'italic' },
  vsRow:            { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vsLine:           { flex: 1, height: 1, backgroundColor: 'rgba(252,165,165,0.20)' },
  vs:               { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(252,165,165,0.50)', letterSpacing: 1 },
  tension:          { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', lineHeight: 16, marginTop: 2 },
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

// ── Main tab ───────────────────────────────────────────────────────────────────

interface Props {
  data: YourStoryAnalysis;
  onJump?: (date: string) => void;
}

export default function YourStoryTab({ data, onJump }: Props) {
  return (
    <View style={s.root}>
      <View style={s.intro}>
        <Feather name="edit-3" size={11} color="rgba(152,212,250,0.35)" />
        <Text style={s.introText}>
          These are narratives about you, built from what you wrote — your patterns, your cast, your arc.
        </Text>
      </View>

      {/* Self Labels */}
      {data.selfLabels?.length ? (
        <SelfLabelsSection labels={data.selfLabels} />
      ) : (
        <Pending text="Self labels — generating from your entries…" />
      )}

      <View style={s.divider} />

      <CurrentChapter
        chapter={data.currentChapter}
        arcType={data.arcPattern?.type}
        sourceEntries={data.sourceEntries}
        onJump={onJump}
      />

      <View style={s.divider} />
      <RecurringCast cast={data.recurringCast} />

      <View style={s.divider} />

      {/* Narrative Patterns + Contradictions */}
      {(data.narrativePatterns?.length || data.internalContradictions?.length) ? (
        <NarrativePatternsSection
          patterns={data.narrativePatterns ?? []}
          contradictions={data.internalContradictions ?? []}
        />
      ) : (
        <Pending text="Narrative patterns — generating from your entries…" />
      )}

      <View style={s.divider} />
      <ArcPattern arcPattern={data.arcPattern} />
    </View>
  );
}

const s = StyleSheet.create({
  root:      { gap: 4 },
  divider:   { height: 1, backgroundColor: 'rgba(152,212,250,0.07)', marginVertical: 12 },
  intro:     { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: 'rgba(152,212,250,0.04)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(152,212,250,0.08)', padding: 10, marginBottom: 10 },
  introText: { flex: 1, fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', lineHeight: 16 },
});
