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
  cardBg:         'rgba(2, 6, 14, 0.90)',
  cardBorder:     'rgba(152, 212, 250, 0.18)',
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

  const isDismissible = obs.dismissible;
  const hasSeeEntries = obs.type === 'returning_question';

  return (
    <Animated.View style={[c.wrap, { opacity: animOpacity }]}>
      {/* Type label */}
      <Text style={c.typeLabel}>{typeLabelFor(obs.type).toUpperCase()}</Text>

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

// Types whose body is authored as 2–4 sentence prose by a dedicated prompt —
// we render the full body instead of a trimmed headline.
const FULL_BODY_TYPES = new Set<AcrossTimeObservation['type']>([
  'first_impression', 'wondering_about', 'gone_quiet', 'stated_vs_actual',
]);

function DefaultBody({ obs, isDismissible: _isDismissible }: { obs: AcrossTimeObservation; isDismissible: boolean }) {
  const isGoneQuiet = obs.type === 'gone_quiet';
  const showFullBody = FULL_BODY_TYPES.has(obs.type);

  if (showFullBody) {
    return (
      <>
        <Text style={[c.fullBody, isGoneQuiet && c.headlineMuted]}>
          {obs.body.trim()}
        </Text>

        {obs.evidence.length > 0 ? (
          <View style={c.evidenceWrap}>
            {obs.evidence.map((e, i) => (
              <Text
                key={i}
                style={[c.evidenceText, i > 0 && c.evidenceTextSpaced]}
              >
                "{e.excerpt}"
              </Text>
            ))}
          </View>
        ) : null}
      </>
    );
  }

  // Legacy fallback — short headline style for types that still route here.
  const headline = deriveHeadline(obs);
  const countLine = deriveCountLine(obs);
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

      {firstEvidence ? (
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

      <View style={tx.barWrap}>
        <View style={[tx.seg, { flex: bar.leftFlex }]} />
        <View style={[tx.seg, tx.segMid, { flex: bar.midFlex }]} />
        <View style={[tx.seg, { flex: bar.rightFlex }]} />
      </View>
      <View style={tx.barLabels}>
        <Text style={tx.barLabel}>{bar.leftLabel}</Text>
        <Text style={tx.barLabel}>{bar.rightLabel}</Text>
      </View>

      {countLine ? (
        <Text style={c.countLine}>{countLine}</Text>
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
    borderWidth: 1,
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
    color: T.tertiaryText,
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
  fullBody: {
    fontSize: 14,
    lineHeight: 21,
    color: T.primaryText,
    fontFamily: 'GillSans-Light',
    marginBottom: 10,
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
  evidenceTextSpaced: {
    marginTop: 6,
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
    gap: 2,
  },
  seg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(152, 212, 250, 0.18)',
  },
  segMid: {
    backgroundColor: 'rgba(152, 212, 250, 0.32)',
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabel: {
    fontSize: 10,
    color: 'rgba(152, 212, 250, 0.42)',
    fontFamily: 'GillSans-Light',
  },
});
