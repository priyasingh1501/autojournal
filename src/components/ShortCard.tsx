/**
 * ShortCard — displays a single Wisdom Short as a full-bleed image card with
 * a glassmorphic text panel overlaid at the bottom.
 *
 * Image lifecycle:
 *  1. Check local cache (getCachedImageUri)
 *  2. If not cached → trigger DALL-E 3 generation in background
 *  3. While loading → show animated gradient placeholder
 *  4. Once ready → fade the image in
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Animated,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { WisdomShort } from '../types';
import { getCachedImageUri, generateAndCacheImage } from '../services/WisdomImageService';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - 32; // 16 margin each side
const IMAGE_H = Math.round(CARD_W * 0.72); // 3:2-ish ratio

// ── Gradient placeholder colours per depth ────────────────────────────────────

const DEPTH_GRADIENT: Record<WisdomShort['depth'], [string, string, string]> = {
  entry: ['#1a2a18', '#2d4a28', '#0a1a0a'],
  mid:   ['#1a1a3a', '#2a1a4a', '#0a0a1e'],
  deep:  ['#2a1018', '#4a1828', '#0e0608'],
};

// ── Author accent colours (same palette as before) ───────────────────────────

const AUTHOR_ACCENTS: Record<string, string> = {
  'Acharya Prashant':            'rgba(251, 146, 60,  0.85)',
  'Alan Watts':                  'rgba(167, 139, 250, 0.85)',
  'Viktor Frankl':               'rgba(52,  211, 153, 0.85)',
  'J. Krishnamurti':             'rgba(96,  165, 250, 0.85)',
  'Osho':                        'rgba(244, 114, 182, 0.85)',
  'Naval Ravikant':              'rgba(251, 191, 36,  0.85)',
  'Epictetus':                   'rgba(180, 160, 120, 0.85)',
  'Marcus Aurelius':             'rgba(180, 160, 120, 0.85)',
  'Seneca':                      'rgba(180, 160, 120, 0.85)',
  'Albert Camus':                'rgba(248, 113, 113, 0.85)',
  'Carl Jung':                   'rgba(196, 181, 253, 0.85)',
  'Abraham Maslow':              'rgba(134, 239, 172, 0.85)',
  'Bessel van der Kolk':         'rgba(134, 239, 172, 0.85)',
  'Brené Brown':                 'rgba(253, 186, 116, 0.85)',
  'Aaron Beck (Cognitive Therapy)': 'rgba(103, 232, 249, 0.85)',
  'Antonio Damasio':             'rgba(103, 232, 249, 0.85)',
  'Lisa Feldman Barrett':        'rgba(103, 232, 249, 0.85)',
  'Personal Reflection':         'rgba(251, 191, 36,  0.85)',
};

function accentFor(author: string): string {
  for (const key of Object.keys(AUTHOR_ACCENTS)) {
    if (author.startsWith(key)) return AUTHOR_ACCENTS[key];
  }
  return 'rgba(152, 212, 250, 0.80)';
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  short: WisdomShort;
  isSaved: boolean;
  onSave:    (id: string) => void;
  onUnsave:  (id: string) => void;
  onReflect: (short: WisdomShort) => void;
  onShare:   (short: WisdomShort) => void;
}

export default function ShortCard({
  short, isSaved, onSave, onUnsave, onReflect, onShare,
}: Props) {
  const [imageUri,     setImageUri]     = useState<string | null>(short.imageUri ?? null);
  const [generating,   setGenerating]   = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);

  const imageFade = useRef(new Animated.Value(0)).current;
  const shimmer   = useRef(new Animated.Value(0)).current;

  const accent = accentFor(short.source_author);
  const gradientColors = DEPTH_GRADIENT[short.depth] ?? DEPTH_GRADIENT.mid;

  // ── Load / generate image ─────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Already have a URI (just came from creation flow)
      if (imageUri) {
        Animated.timing(imageFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        return;
      }

      // 2. Check cache
      const cached = await getCachedImageUri(short.id);
      if (cancelled) return;

      if (cached) {
        setImageUri(cached);
        Animated.timing(imageFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        return;
      }

      // 3. Not cached — generate (fire-and-forget per card)
      setGenerating(true);
      const generated = await generateAndCacheImage(short);
      if (cancelled) return;
      setGenerating(false);

      if (generated) {
        setImageUri(generated);
        Animated.timing(imageFade, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      }
    })();

    return () => { cancelled = true; };
  }, [short.id]);

  // Shimmer animation while no image
  useEffect(() => {
    if (imageUri) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [imageUri]);

  const shimmerOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.30, 0.65] });

  // ── Body collapse ─────────────────────────────────────────────────────────

  const BODY_LIMIT = 180;
  const needsCollapse = short.short.length > BODY_LIMIT;
  const displayBody = needsCollapse && !bodyExpanded
    ? short.short.slice(0, BODY_LIMIT) + '…'
    : short.short;

  const openSource = () => {
    if (short.source_url) Linking.openURL(short.source_url).catch(() => {});
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.card}>

      {/* ── Image / Placeholder ── */}
      <View style={styles.imageContainer}>

        {/* Gradient shimmer placeholder (always rendered below) */}
        <LinearGradient
          colors={gradientColors}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
        />
        {!imageUri && (
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.shimmerOverlay, { opacity: shimmerOpacity }]}
          />
        )}
        {generating && (
          <View style={styles.generatingBadge}>
            <Feather name="image" size={10} color="rgba(251,191,36,0.70)" />
            <Text style={styles.generatingText}>painting…</Text>
          </View>
        )}

        {/* Actual image fades in */}
        {imageUri && (
          <Animated.Image
            source={{ uri: imageUri }}
            style={[StyleSheet.absoluteFill, styles.image, { opacity: imageFade }]}
            resizeMode="cover"
          />
        )}

        {/* Top gradient fade — so the bottom panel bleeds upward naturally */}
        <LinearGradient
          colors={['transparent', 'rgba(4,13,30,0.92)']}
          style={styles.bottomFade}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />

        {/* Top-right: source badge */}
        <View style={styles.topRight}>
          <View style={[styles.badge, { borderColor: accent + '55', backgroundColor: 'rgba(4,13,30,0.55)' }]}>
            <Text style={[styles.badgeText, { color: accent }]}>
              {short.source_author}
            </Text>
          </View>
        </View>

      </View>

      {/* ── Glassmorphic text panel ── */}
      <View style={styles.panel}>

        {/* Accent line */}
        <View style={[styles.accentDivider, { backgroundColor: accent }]} />

        {/* Title */}
        <Text style={styles.title}>{short.title.toUpperCase()}</Text>

        {/* Gold separator */}
        <View style={[styles.titleSeparator, { backgroundColor: accent }]} />

        {/* Body */}
        <Text style={styles.body}>{displayBody}</Text>
        {needsCollapse && (
          <TouchableOpacity onPress={() => setBodyExpanded(e => !e)}>
            <Text style={styles.readMore}>
              {bodyExpanded ? 'Read less' : 'Read more'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Pull quote — warm golden to match the luminous image palette */}
        <View style={styles.pullWrap}>
          <Text style={styles.pullText}>"{short.pullquote}"</Text>
        </View>

        {/* Theme chips */}
        {short.themes.length > 0 && (
          <View style={styles.chipRow}>
            {short.themes.slice(0, 3).map(t => (
              <View key={t} style={styles.chip}>
                <Text style={styles.chipText}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => isSaved ? onUnsave(short.id) : onSave(short.id)}
          >
            <Feather
              name="bookmark"
              size={15}
              color={isSaved ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.28)'}
            />
            <Text style={[styles.actionLabel, isSaved && { color: 'rgba(255,255,255,0.90)' }]}>
              {isSaved ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            style={styles.reflectBtn}
            onPress={() => onReflect(short)}
          >
            <Feather name="edit-3" size={13} color="rgba(255,255,255,0.55)" />
            <Text style={styles.reflectLabel}>Reflect</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.reflectBtn, styles.shareBtn]}
            onPress={() => onShare(short)}
          >
            <Feather name="share-2" size={13} color="rgba(255,255,255,0.55)" />
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.40,
    shadowRadius: 24,
    elevation: 10,
    backgroundColor: '#040d1e',
  },

  // ── Image zone ──
  imageContainer: {
    width: '100%',
    height: IMAGE_H,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  shimmerOverlay: {
    backgroundColor: 'rgba(152,212,250,0.06)',
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: IMAGE_H * 0.45,
  },
  topRight: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    fontFamily: 'GillSans-Light',
  },
  generatingBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(4,13,30,0.70)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
  },
  generatingText: {
    fontSize: 10,
    color: 'rgba(251,191,36,0.70)',
    fontFamily: 'GillSans-Light',
    fontStyle: 'italic',
  },

  // ── Glassmorphic text panel ──
  panel: {
    backgroundColor: 'rgba(4,13,30,0.92)',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 6,
  },

  accentDivider: {
    height: 2,
    width: 28,
    borderRadius: 2,
    marginBottom: 12,
    opacity: 0.70,
  },

  title: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(224,242,254,0.95)',
    letterSpacing: 2.0,
    lineHeight: 19,
    fontFamily: 'Baskerville',
    marginBottom: 8,
  },

  titleSeparator: {
    height: 1,
    width: 32,
    borderRadius: 1,
    marginBottom: 12,
    opacity: 0.55,
  },

  body: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 22,
    fontFamily: 'GillSans-Light',
    marginBottom: 4,
  },
  readMore: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
    marginBottom: 4,
  },

  pullWrap: {
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(251,191,36,0.70)',
    borderRadius: 3,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(251,191,36,0.06)',
  },
  pullText: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
    fontFamily: 'Baskerville',
    color: 'rgba(251,191,36,0.90)',
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipText: {
    fontSize: 10,
    fontFamily: 'GillSans-Light',
    color: 'rgba(255,255,255,0.40)',
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(152,212,250,0.07)',
    marginTop: 12,
    marginBottom: 0,
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(152,212,250,0.40)',
    fontFamily: 'GillSans-Light',
  },
  reflectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  reflectLabel: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'GillSans-Light',
    color: 'rgba(255,255,255,0.55)',
  },
  shareBtn: {
    marginLeft: 8,
    paddingHorizontal: 12,
  },
});
