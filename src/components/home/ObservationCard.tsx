import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { AcrossTimeObservation } from '../../types';
import {
  accentColorFor,
  deriveCountLine,
  deriveHeadline,
  deriveTextureBar,
  parseTowardAway,
  parseSelfLanguagePhrases,
  typeLabelFor,
} from '../../utils/patternHelpers';

// ── tokens ────────────────────────────────────────────────────────────────────

const T = {
  primaryText:    'rgba(224, 242, 254, 0.92)',
  secondaryText:  'rgba(152, 212, 250, 0.72)',
  tertiaryText:   'rgba(152, 212, 250, 0.50)',
  mutedText:      'rgba(152, 212, 250, 0.38)',
  cardBg:         'rgba(3, 18, 40, 0.72)',
  cardBorder:     'rgba(152, 212, 250, 0.13)',
  evidenceBg:     'rgba(9, 41, 173, 0.20)',
  evidenceBorder: 'rgba(152, 212, 250, 0.18)',
  sitWithBg:      'rgba(93, 202, 165, 0.14)',
  sitWithText:    '#5dcaa5',
  towardLabel:    '#0f6e56',  // used for "toward" text in dark = teal-tinted
  awayLabel:      '#d85a30',
  towardArrow:    '#5dcaa5',
  awayArrow:      '#d85a30',
};

// ── props ─────────────────────────────────────────────────────────────────────

interface Props {
  obs: AcrossTimeObservation;
  hidden: boolean;
  onSitWith: (obs: AcrossTimeObservation) => void;
  onDismiss: (obs: AcrossTimeObservation) => void;
  onSeeEntries?: (obs: AcrossTimeObservation) => void;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ObservationCard({ obs, hidden, onSitWith, onDismiss, onSeeEntries }: Props) {
  const animOpacity = useRef(new Animated.Value(1)).current;
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    if (hidden) {
      Animated.timing(animOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setRendering(false));
    }
  }, [hidden]);

  if (!rendering) return null;

  const accent = accentColorFor(obs.type);
  const isDismissible = obs.dismissible;
  const hasSeeEntries = obs.type === 'returning_question';

  return (
    <Animated.View style={[c.wrap, { borderLeftColor: accent, opacity: animOpacity }]}>
      {/* Type label */}
      <Text style={[c.typeLabel, { color: accent }]}>{typeLabelFor(obs.type).toUpperCase()}</Text>

      {/* Type-specific body */}
      {obs.type === 'whats_pulling_you'
        ? <PullingYouBody obs={obs} />
        : obs.type === 'thinking_texture' || obs.type === 'mind_moving'
        ? <TextureBody obs={obs} />
        : obs.type === 'self_language'
        ? <SelfLanguageBody obs={obs} />
        : obs.type === 'repeating_story'
        ? <RepeatingStoryBody obs={obs} />
        : <DefaultBody obs={obs} isDismissible={isDismissible} />}

      {/* Actions row */}
      <View style={c.actionsRow}>
        <TouchableOpacity
          style={c.sitWithBtn}
          onPress={() => onSitWith(obs)}
          activeOpacity={0.8}
        >
          <Text style={c.sitWithText}>Sit with this</Text>
        </TouchableOpacity>

        <View style={c.actionsRight}>
          {hasSeeEntries && onSeeEntries && (
            <TouchableOpacity onPress={() => onSeeEntries(obs)} activeOpacity={0.7}>
              <Text style={c.linkText}>see entries</Text>
            </TouchableOpacity>
          )}
          {isDismissible && (
            <TouchableOpacity onPress={() => onDismiss(obs)} activeOpacity={0.7}>
              <Text style={c.notQuiteText}>not quite</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ── DefaultBody: most types ───────────────────────────────────────────────────

function DefaultBody({ obs, isDismissible: _isDismissible }: { obs: AcrossTimeObservation; isDismissible: boolean }) {
  const headline = deriveHeadline(obs);
  const countLine = deriveCountLine(obs);
  const isGoneQuiet = obs.type === 'gone_quiet';
  const firstEvidence = obs.evidence[0] ?? null;

  return (
    <>
      {headline ? (
        <Text style={[c.headline, isGoneQuiet && c.headlineMuted]}>
          {headline}
        </Text>
      ) : null}

      {countLine ? (
        <Text style={c.countLine}>{countLine}</Text>
      ) : null}

      {!isGoneQuiet && firstEvidence ? (
        <View style={c.evidenceWrap}>
          <Text style={c.evidenceText}>"{firstEvidence.excerpt}"</Text>
        </View>
      ) : null}
    </>
  );
}

// ── PullingYouBody: two-column toward/away ────────────────────────────────────

function PullingYouBody({ obs }: { obs: AcrossTimeObservation }) {
  const { toward, away } = parseTowardAway(obs.body);

  return (
    <View style={p.row}>
      <View style={p.col}>
        <Text style={[p.colLabel, { color: T.towardLabel }]}>TOWARD</Text>
        {toward.map((item, i) => (
          <View key={i} style={p.itemRow}>
            <Text style={[p.arrow, { color: T.towardArrow }]}>↑</Text>
            <Text style={p.itemText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={p.col}>
        <Text style={[p.colLabel, { color: T.awayLabel }]}>AWAY FROM</Text>
        {away.map((item, i) => (
          <View key={i} style={p.itemRow}>
            <Text style={[p.arrow, { color: T.awayArrow }]}>↓</Text>
            <Text style={p.itemText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── TextureBody: segmented distribution bar ───────────────────────────────────

function TextureBody({ obs }: { obs: AcrossTimeObservation }) {
  const headline = deriveHeadline(obs);
  const countLine = deriveCountLine(obs);
  const bar = deriveTextureBar(obs);

  return (
    <>
      {headline ? (
        <Text style={c.headline}>{headline}</Text>
      ) : null}

      {/* Distribution bar */}
      <View style={tx.barWrap}>
        <View style={[tx.seg, { flex: bar.leftFlex, backgroundColor: '#b5d4f4' }]} />
        <View style={[tx.seg, { flex: bar.midFlex,  backgroundColor: '#378add' }]} />
        <View style={[tx.seg, { flex: bar.rightFlex, backgroundColor: '#b5d4f4' }]} />
      </View>
      <View style={tx.barLabels}>
        <Text style={tx.barLabel}>{bar.leftLabel}</Text>
        <Text style={tx.barLabel}>{bar.rightLabel}</Text>
      </View>

      {countLine ? (
        <Text style={[c.countLine, { marginTop: 2 }]}>{countLine}</Text>
      ) : null}
    </>
  );
}

// ── SelfLanguageBody: verbatim phrases in italics ────────────────────────────

const MAX_VISIBLE_PHRASES = 4;

function SelfLanguageBody({ obs }: { obs: AcrossTimeObservation }) {
  const phrases = parseSelfLanguagePhrases(obs.body);
  const visible = phrases.slice(0, MAX_VISIBLE_PHRASES);
  const overflow = phrases.length - MAX_VISIBLE_PHRASES;

  return (
    <View style={sl.wrap}>
      {visible.map((phrase, i) => (
        <Text key={i} style={sl.phrase}>"{phrase}"</Text>
      ))}
      {overflow > 0 && (
        <Text style={sl.overflow}>
          {overflow} more phrase{overflow !== 1 ? 's' : ''}
        </Text>
      )}
    </View>
  );
}

// ── RepeatingStoryBody ────────────────────────────────────────────────────────

function RepeatingStoryBody({ obs }: { obs: AcrossTimeObservation }) {
  const headline = deriveHeadline(obs);
  const countLine = deriveCountLine(obs);
  const firstEvidence = obs.evidence[0] ?? null;

  return (
    <>
      {headline ? (
        <Text style={c.headline}>{headline}</Text>
      ) : null}
      {countLine ? (
        <Text style={c.countLine}>{countLine}</Text>
      ) : null}
      {firstEvidence ? (
        <View style={c.evidenceWrap}>
          <Text style={c.evidenceText}>"{firstEvidence.excerpt}"</Text>
        </View>
      ) : null}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const SERIF = Platform.select({ ios: 'Baskerville', android: 'serif' });

const c = StyleSheet.create({
  wrap: {
    backgroundColor: T.cardBg,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: T.cardBorder,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    overflow: 'hidden',
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    fontFamily: 'GillSans-Light',
    marginBottom: 6,
  },
  headline: {
    fontFamily: SERIF,
    fontSize: 15,
    fontWeight: '500',
    color: T.primaryText,
    lineHeight: 22,
    marginBottom: 5,
  },
  headlineMuted: {
    color: T.secondaryText,
  },
  countLine: {
    fontSize: 12,
    color: T.tertiaryText,
    fontFamily: 'GillSans-Light',
    marginBottom: 8,
  },
  evidenceWrap: {
    backgroundColor: T.evidenceBg,
    borderRadius: 8,
    borderLeftWidth: 2,
    borderLeftColor: T.evidenceBorder,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  evidenceText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: T.secondaryText,
    lineHeight: 18,
    fontFamily: 'GillSans-Light',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  actionsRight: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  sitWithBtn: {
    backgroundColor: T.sitWithBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sitWithText: {
    fontSize: 12,
    fontWeight: '500',
    color: T.sitWithText,
    fontFamily: 'GillSans-Light',
  },
  linkText: {
    fontSize: 11,
    color: T.tertiaryText,
    fontFamily: 'GillSans-Light',
  },
  notQuiteText: {
    fontSize: 11,
    color: T.tertiaryText,
    fontFamily: 'GillSans-Light',
  },
});

// toward/away columns
const p = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 10,
  },
  col: {
    flex: 1,
    gap: 4,
  },
  colLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.0,
    fontFamily: 'GillSans-Light',
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    paddingVertical: 2,
  },
  arrow: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  itemText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(224, 242, 254, 0.85)',
    fontFamily: 'GillSans-Light',
    lineHeight: 18,
  },
});

// self_language phrases
const sl = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 8,
    gap: 6,
  },
  phrase: {
    fontFamily: Platform.select({ ios: 'Baskerville-Italic', android: 'serif' }),
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 21,
    color: T.primaryText,
  },
  overflow: {
    fontSize: 11,
    color: T.tertiaryText,
    fontFamily: 'GillSans-Light',
    marginTop: 2,
  },
});

// texture bar
const tx = StyleSheet.create({
  barWrap: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 8,
  },
  seg: {
    height: 6,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabel: {
    fontSize: 10,
    color: 'rgba(152, 212, 250, 0.48)',
    fontFamily: 'GillSans-Light',
  },
});
