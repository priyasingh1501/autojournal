/**
 * ShareModal — visual Story Card for a Wisdom Short.
 * Renders a 9:16 gradient card with the pullquote centred in large Baskerville,
 * then offers WhatsApp and native Share options.
 */

import React, { useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Linking,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { WisdomShort } from '../types';

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
  if (!short) return null;

  const colors = gradientFor(short.source_author);
  const accentColor = colors[2];

  const appLink = 'https://apps.apple.com/app/untangle/id6748722626';
  const shareText = `"${short.pullquote}"\n\n— ${short.source_author}\n\n${short.title}\n\n_via untangle · ${appLink}_`;

  const handleNativeShare = async () => {
    try {
      await Share.share({ message: shareText });
    } catch {
      Alert.alert('Could not open share sheet. Please try again.');
    }
  };

  const handleWhatsApp = async () => {
    const encoded = encodeURIComponent(shareText);
    const url = `whatsapp://send?text=${encoded}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      // Fallback: web WhatsApp
      await Linking.openURL(`https://wa.me/?text=${encoded}`);
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
            {/* ── Story Card ── */}
            <LinearGradient
              colors={colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.storyCard}
            >
              {/* Top label */}
              <View style={styles.storyBadge}>
                <Text style={[styles.storyBadgeText, { color: accentColor }]}>
                  {short.source_type.toUpperCase()}
                </Text>
              </View>

              {/* Pullquote — centred, large */}
              <View style={styles.quoteWrap}>
                <Text style={styles.openQuote}>"</Text>
                <Text style={styles.quotePrimary}>{short.pullquote}</Text>
                <Text style={styles.closeQuote}>"</Text>
              </View>

              {/* Author & title */}
              <View style={styles.storyFooter}>
                <View style={[styles.footerLine, { backgroundColor: accentColor }]} />
                <Text style={[styles.storyAuthor, { color: accentColor }]}>
                  {short.source_author}
                </Text>
                <Text style={styles.storyTitle} numberOfLines={2}>
                  {short.title}
                </Text>
              </View>

              {/* App watermark */}
              <Text style={styles.watermark}>untangle · get the app</Text>
            </LinearGradient>

            {/* ── Hint ── */}
            <Text style={styles.hint}>
              Screenshot the card above, then share it to Instagram Stories or WhatsApp Status.
            </Text>

            {/* ── Share buttons ── */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.shareBtn, { borderColor: '#25D366' + '55', backgroundColor: '#25D366' + '12' }]}
                onPress={handleWhatsApp}
              >
                <Feather name="message-circle" size={16} color="#25D366" />
                <Text style={[styles.shareBtnText, { color: '#25D366' }]}>WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.shareBtn, { borderColor: accentColor + '55', backgroundColor: accentColor + '12' }]}
                onPress={handleNativeShare}
              >
                <Feather name="share-2" size={16} color={accentColor} />
                <Text style={[styles.shareBtnText, { color: accentColor }]}>More…</Text>
              </TouchableOpacity>
            </View>
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

  // ── Story Card ─────────────────────────────────────────────────────────────
  storyCard: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: 20,
    overflow: 'hidden',
    padding: 28,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 16,
  },

  storyBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  storyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  quoteWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  openQuote: {
    fontSize: 64,
    lineHeight: 60,
    color: 'rgba(255,255,255,0.15)',
    fontFamily: 'Baskerville',
    marginBottom: -16,
  },
  quotePrimary: {
    fontSize: 22,
    lineHeight: 34,
    color: 'rgba(255,255,255,0.95)',
    fontFamily: 'Baskerville',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  closeQuote: {
    fontSize: 64,
    lineHeight: 60,
    color: 'rgba(255,255,255,0.15)',
    fontFamily: 'Baskerville',
    textAlign: 'right',
    marginTop: -16,
  },

  storyFooter: {
    gap: 6,
  },
  footerLine: {
    height: 1.5,
    width: 40,
    borderRadius: 2,
    marginBottom: 4,
  },
  storyAuthor: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  storyTitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'GillSans-Light',
    lineHeight: 17,
  },
  watermark: {
    position: 'absolute',
    bottom: 20,
    right: 24,
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
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

  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'GillSans-Light',
  },
});
