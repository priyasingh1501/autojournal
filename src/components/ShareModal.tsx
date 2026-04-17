/**
 * ShareModal — visual Story Card for a Wisdom Short.
 * Renders a 9:16 gradient card, captures it as a PNG via react-native-view-shot,
 * then shares the image to WhatsApp, Instagram Stories, or any native target.
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Linking,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as ExpoSharing from 'expo-sharing';
import { WisdomShort } from '../types';
import { getCachedImageUri, generateAndCacheImage } from '../services/WisdomImageService';

// ── Gradient palettes per author / discipline ──────────────────────────────────

const GRADIENTS: Record<string, [string, string, string]> = {
  'Acharya Prashant':           ['#1a0a00', '#7c3400', '#f97316'],
  'Alan Watts':                 ['#0d0520', '#3b0f6e', '#a855f7'],
  'Viktor Frankl':              ['#001a0f', '#064e3b', '#34d399'],
  'J. Krishnamurti':            ['#00123a', '#1e3a8a', '#60a5fa'],
  'Osho':                       ['#1a0015', '#831843', '#f472b6'],
  'Naval Ravikant':             ['#1a1400', '#78350f', '#fbbf24'],
  'Epictetus':                  ['#12100a', '#44403c', '#a8a29e'],
  'Marcus Aurelius':            ['#12100a', '#44403c', '#a8a29e'],
  'Seneca':                     ['#12100a', '#44403c', '#a8a29e'],
  'Albert Camus':               ['#1a0000', '#7f1d1d', '#f87171'],
  'Jean-Paul Sartre':           ['#1a0000', '#7f1d1d', '#f87171'],
  'Friedrich Nietzsche':        ['#1a0000', '#7f1d1d', '#f87171'],
  'Carl Jung':                  ['#0d0020', '#4c1d95', '#c4b5fd'],
  'Abraham Maslow':             ['#00180a', '#14532d', '#86efac'],
  'Bessel van der Kolk':        ['#00180a', '#14532d', '#86efac'],
  'Brené Brown':                ['#1a0a00', '#7c2d12', '#fdba74'],
  'Aaron Beck':                 ['#001a1a', '#164e63', '#67e8f9'],
  'Antonio Damasio':            ['#001a1a', '#164e63', '#67e8f9'],
  'Lisa Feldman Barrett':       ['#001a1a', '#164e63', '#67e8f9'],
  'Hannah Arendt':              ['#0d0020', '#581c87', '#d8b4fe'],
  'John Rawls':                 ['#0d0020', '#581c87', '#d8b4fe'],
  'Michel Foucault':            ['#0d0020', '#581c87', '#d8b4fe'],
  'Amartya Sen':                ['#0d0020', '#581c87', '#d8b4fe'],
  'Daniel Kahneman':            ['#00150f', '#065f46', '#6ee7b7'],
  'Richard Thaler':             ['#00150f', '#065f46', '#6ee7b7'],
};

const DEFAULT_GRADIENT: [string, string, string] = ['#010d1e', '#042244', '#0a3d7a'];

function gradientFor(author: string): [string, string, string] {
  for (const key of Object.keys(GRADIENTS)) {
    if (author.startsWith(key)) return GRADIENTS[key];
  }
  return DEFAULT_GRADIENT;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  short: WisdomShort | null;
  visible: boolean;
  onClose: () => void;
}

export default function ShareModal({ short, visible, onClose }: Props) {
  const viewShotRef = useRef<ViewShot>(null);
  const [capturing, setCapturing] = useState(false);
  const [resolvedImageUri, setResolvedImageUri] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    if (!visible || !short) {
      setResolvedImageUri(null);
      return;
    }
    // Already have a URI from Supabase or local cache on the object
    if (short.imageUri) {
      setResolvedImageUri(short.imageUri);
      return;
    }
    // Check local cache, then generate
    let cancelled = false;
    setImageLoading(true);
    (async () => {
      const cached = await getCachedImageUri(short.id);
      if (cancelled) return;
      if (cached) {
        setResolvedImageUri(cached);
        setImageLoading(false);
        return;
      }
      const generated = await generateAndCacheImage(short);
      if (!cancelled) {
        setResolvedImageUri(generated);
        setImageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, short?.id]);

  if (!short) return null;

  const colors = gradientFor(short.source_author);
  const accentColor = colors[2];

  const appLink = 'https://apps.apple.com/app/untangle/id6748722626';

  /** Capture card → returns local file URI */
  const captureCard = async (): Promise<string | null> => {
    try {
      if (!viewShotRef.current?.capture) return null;
      const uri = await viewShotRef.current.capture();
      return uri;
    } catch (e) {
      console.warn('ViewShot capture failed', e);
      return null;
    }
  };

  /** Share image via native share sheet (covers WhatsApp, Instagram, etc.) */
  const handleNativeShare = async () => {
    setCapturing(true);
    const uri = await captureCard();
    setCapturing(false);

    if (!uri) {
      Alert.alert('Could not capture card', 'Please try again.');
      return;
    }

    const canShare = await ExpoSharing.isAvailableAsync();
    if (canShare) {
      await ExpoSharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share wisdom card',
      });
    } else {
      // Fallback: share text on platforms where image sharing isn't available
      await Share.share({
        message: `${short.title}\n\n${short.short}\n\n— ${short.source_author}\n\n_via untangle · ${appLink}_`,
      });
    }
  };

  /** Direct WhatsApp share — image via native intent on Android, share sheet on iOS */
  const handleWhatsApp = async () => {
    setCapturing(true);
    const uri = await captureCard();
    setCapturing(false);

    if (!uri) {
      Alert.alert('Could not capture card', 'Please try again.');
      return;
    }

    if (Platform.OS === 'android') {
      // On Android, expo-sharing opens the system share sheet pre-filtered;
      // user picks WhatsApp from there
      const canShare = await ExpoSharing.isAvailableAsync();
      if (canShare) {
        await ExpoSharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share to WhatsApp' });
      }
    } else {
      // iOS: share sheet with image — user taps WhatsApp in the list
      await ExpoSharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share to WhatsApp',
        UTI: 'public.png',
      });
    }
  };

  /** Instagram Stories direct share (iOS only via URL scheme, Android via share sheet) */
  const handleInstagramStories = async () => {
    setCapturing(true);
    const uri = await captureCard();
    setCapturing(false);

    if (!uri) {
      Alert.alert('Could not capture card', 'Please try again.');
      return;
    }

    if (Platform.OS === 'ios') {
      // Instagram Stories URL scheme on iOS
      const igUrl = 'instagram-stories://share?source_application=untangle';
      const supported = await Linking.canOpenURL(igUrl);
      if (supported) {
        // Use native share sheet to pass image; Instagram Stories picks it up
        await ExpoSharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
      } else {
        Alert.alert('Instagram not installed', 'Share using the share sheet instead.');
        await ExpoSharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
      }
    } else {
      // Android: share sheet — user selects Instagram
      await ExpoSharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share to Instagram Stories' });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Share</Text>
            <View style={styles.headerBtn} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            {/* ── Story Card (captured by ViewShot) ── */}
            <ViewShot
              ref={viewShotRef}
              options={{ format: 'png', quality: 1.0 }}
              style={styles.viewShotWrapper}
            >
              <View style={styles.storyCard}>

                {/* Background: image or gradient fallback */}
                {resolvedImageUri ? (
                  <Image
                    source={{ uri: resolvedImageUri }}
                    style={[StyleSheet.absoluteFill, styles.bgImage]}
                    resizeMode="cover"
                  />
                ) : (
                  <LinearGradient
                    colors={colors}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                )}

                {/* Loading indicator centred while generating */}
                {imageLoading && !resolvedImageUri && (
                  <ActivityIndicator
                    size="small"
                    color="rgba(152,212,250,0.40)"
                    style={styles.cardSpinner}
                  />
                )}

                {/* Gradient scrim — darkens the bottom so the panel is readable */}
                <LinearGradient
                  colors={['transparent', 'rgba(2,6,14,0.72)', 'rgba(2,6,14,0.96)']}
                  style={styles.scrim}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  pointerEvents="none"
                />

                {/* Author badge — top right */}
                <View style={[styles.authorBadge, { borderColor: accentColor + '55', backgroundColor: 'rgba(4,13,30,0.55)' }]}>
                  <Text style={[styles.authorBadgeText, { color: accentColor }]} numberOfLines={1}>
                    {short.source_author}
                  </Text>
                </View>

                {/* Glass panel at bottom */}
                <View style={styles.glassPanel}>
                  <View style={[styles.accentLine, { backgroundColor: accentColor }]} />
                  <Text style={styles.panelTitle}>{short.title.toUpperCase()}</Text>
                  <View style={[styles.titleSep, { backgroundColor: accentColor }]} />
                  <Text style={styles.panelBody}>
                    {short.short.length > 260
                      ? short.short.slice(0, 257) + '…'
                      : short.short}
                  </Text>
                </View>

                {/* Watermark */}
                <Text style={styles.watermark}>untangle · get the app</Text>

              </View>
            </ViewShot>

            {/* ── Hint ── */}
            <Text style={styles.hint}>
              Tap a button below to share the card as an image.
            </Text>

            {/* ── Share buttons ── */}
            {capturing ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="rgba(152,212,250,0.7)" size="small" />
                <Text style={styles.loadingText}>Preparing image…</Text>
              </View>
            ) : (
              <View style={styles.buttonCol}>
                {/* WhatsApp */}
                <TouchableOpacity
                  style={[styles.shareBtn, { borderColor: '#25D366' + '55', backgroundColor: '#25D366' + '12' }]}
                  onPress={handleWhatsApp}
                >
                  <Feather name="message-circle" size={16} color="#25D366" />
                  <Text style={[styles.shareBtnText, { color: '#25D366' }]}>WhatsApp</Text>
                </TouchableOpacity>

                {/* Instagram Stories */}
                <TouchableOpacity
                  style={[styles.shareBtn, { borderColor: '#E1306C55', backgroundColor: '#E1306C12' }]}
                  onPress={handleInstagramStories}
                >
                  <Feather name="instagram" size={16} color="#E1306C" />
                  <Text style={[styles.shareBtnText, { color: '#E1306C' }]}>Instagram Stories</Text>
                </TouchableOpacity>

                {/* More (native share sheet) */}
                <TouchableOpacity
                  style={[styles.shareBtn, { borderColor: accentColor + '55', backgroundColor: accentColor + '12' }]}
                  onPress={handleNativeShare}
                >
                  <Feather name="share-2" size={16} color={accentColor} />
                  <Text style={[styles.shareBtnText, { color: accentColor }]}>More…</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.80)' },

  sheet: {
    backgroundColor: '#040d1e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152, 212, 250, 0.18)',
    maxHeight: '92%',
    minHeight: 400,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(152, 212, 250, 0.08)',
  },
  headerBtn: { minWidth: 56 },
  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)',
    fontFamily: 'Baskerville',
  },
  cancelText: {
    color: 'rgba(152, 212, 250, 0.65)',
    fontSize: 15,
    fontFamily: 'GillSans-Light',
  },

  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    alignItems: 'center',
  },

  // ── ViewShot wrapper ────────────────────────────────────────────────────────
  viewShotWrapper: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
  },

  // ── Story Card ─────────────────────────────────────────────────────────────
  storyCard: {
    width: '100%',
    aspectRatio: 9 / 16,
    overflow: 'hidden',
    backgroundColor: '#02060e',
  },

  bgImage: {
    width: '100%',
    height: '100%',
  },

  cardSpinner: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
  },

  scrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '65%',
  },

  authorBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '60%',
  },
  authorBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    fontFamily: 'GillSans-Light',
  },

  glassPanel: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    paddingHorizontal: 22,
  },
  accentLine: {
    height: 2,
    width: 28,
    borderRadius: 2,
    marginBottom: 10,
    opacity: 0.80,
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(224,242,254,0.95)',
    letterSpacing: 2.0,
    lineHeight: 18,
    fontFamily: 'Baskerville',
    marginBottom: 8,
  },
  titleSep: {
    height: 1,
    width: 28,
    borderRadius: 1,
    marginBottom: 10,
    opacity: 0.50,
  },
  panelBody: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 20,
    fontFamily: 'GillSans-Light',
  },

  watermark: {
    position: 'absolute',
    bottom: 18,
    right: 22,
    fontSize: 10,
    color: 'rgba(255,255,255,0.22)',
    fontFamily: 'Baskerville',
    fontStyle: 'italic',
    letterSpacing: 0.5,
  },

  // ── Share buttons ───────────────────────────────────────────────────────────
  hint: {
    fontSize: 12,
    color: 'rgba(152, 212, 250, 0.45)',
    textAlign: 'center',
    fontFamily: 'GillSans-Light',
    lineHeight: 18,
    marginTop: 18,
    marginBottom: 20,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  loadingText: {
    color: 'rgba(152,212,250,0.6)',
    fontSize: 14,
    fontFamily: 'GillSans-Light',
  },

  buttonCol: {
    gap: 10,
    width: '100%',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    width: '100%',
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'GillSans-Light',
  },
});
