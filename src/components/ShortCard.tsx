/**
 * ShortCard — displays a single Wisdom Short in the feed.
 *
 * Anatomy (top → bottom):
 *   Source type badge + author
 *   Title
 *   Short body text (collapsible via "Read more" for long entries)
 *   Pullquote (visually accented)
 *   Action row: Save · Reflect
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WisdomShort } from '../types';

// ── Colours ────────────────────────────────────────────────────────────────────

const AUTHOR_COLOURS: Record<string, string> = {
  'Acharya Prashant':   'rgba(251, 146, 60, 0.85)',  // amber
  'Alan Watts':          'rgba(139, 92, 246, 0.85)',  // violet
  'Viktor Frankl':       'rgba(52, 211, 153, 0.85)',  // emerald
  'J. Krishnamurti':     'rgba(96, 165, 250, 0.85)',  // blue
  'Osho':                'rgba(244, 114, 182, 0.85)', // pink
  'Naval Ravikant':      'rgba(251, 191, 36, 0.85)',  // yellow
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  talk:  'Talk',
  book:  'Book',
  essay: 'Essay',
  paper: 'Research',
  video: 'Video',
};

function authorColour(author: string): string {
  for (const key of Object.keys(AUTHOR_COLOURS)) {
    if (author.startsWith(key)) return AUTHOR_COLOURS[key];
  }
  return 'rgba(152, 212, 250, 0.75)'; // default sky-blue
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  short: WisdomShort;
  isSaved: boolean;
  onSave: (id: string) => void;
  onUnsave: (id: string) => void;
  onReflect: (short: WisdomShort) => void;
}

const COLLAPSE_THRESHOLD = 240; // characters — show "Read more" beyond this

export default function ShortCard({ short, isSaved, onSave, onUnsave, onReflect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const needsCollapse = short.short.length > COLLAPSE_THRESHOLD;
  const displayText =
    needsCollapse && !expanded ? short.short.slice(0, COLLAPSE_THRESHOLD) + '…' : short.short;

  const accent = authorColour(short.source_author);

  const handleAuthorPress = () => {
    if (short.source_url) {
      Linking.openURL(short.source_url).catch(() => {});
    }
  };

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
          <Text style={[styles.badgeText, { color: accent }]}>
            {SOURCE_TYPE_LABELS[short.source_type] ?? short.source_type}
          </Text>
        </View>
        <TouchableOpacity onPress={handleAuthorPress} disabled={!short.source_url}>
          <Text style={[styles.author, short.source_url && styles.authorLink]}>
            {short.source_author}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Title ── */}
      <Text style={styles.title}>{short.title}</Text>

      {/* ── Body ── */}
      <Text style={styles.body}>{displayText}</Text>
      {needsCollapse && (
        <TouchableOpacity onPress={() => setExpanded(e => !e)}>
          <Text style={[styles.readMore, { color: accent }]}>
            {expanded ? 'Read less' : 'Read more'}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Pullquote ── */}
      <View style={[styles.pullquoteBar, { backgroundColor: accent + '18', borderLeftColor: accent }]}>
        <Text style={[styles.pullquote, { color: accent }]}>"{short.pullquote}"</Text>
      </View>

      {/* ── Theme chips ── */}
      <View style={styles.chipRow}>
        {short.themes.slice(0, 3).map(t => (
          <View key={t} style={styles.chip}>
            <Text style={styles.chipText}>{t}</Text>
          </View>
        ))}
      </View>

      {/* ── Actions ── */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => isSaved ? onUnsave(short.id) : onSave(short.id)}
        >
          <Feather
            name="bookmark"
            size={16}
            color={isSaved ? accent : 'rgba(152, 212, 250, 0.5)'}
          />
          <Text style={[styles.actionLabel, isSaved && { color: accent }]}>
            {isSaved ? 'Saved' : 'Save'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.reflectBtn, { borderColor: accent + '55' }]}
          onPress={() => onReflect(short)}
        >
          <Feather name="edit-3" size={14} color={accent} />
          <Text style={[styles.actionLabel, { color: accent }]}>Reflect</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(10, 18, 35, 0.92)',
    borderRadius: 16,
    borderLeftWidth: 3,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  author: {
    fontSize: 12,
    color: 'rgba(152, 212, 250, 0.65)',
    fontStyle: 'italic',
  },
  authorLink: {
    textDecorationLine: 'underline',
  },

  title: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(224, 242, 254, 0.95)',
    marginBottom: 10,
    lineHeight: 22,
    fontFamily: 'Baskerville',
  },

  body: {
    fontSize: 14,
    color: 'rgba(186, 226, 255, 0.78)',
    lineHeight: 22,
    marginBottom: 4,
  },
  readMore: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 2,
  },

  pullquoteBar: {
    borderLeftWidth: 2,
    borderRadius: 4,
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pullquote: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
    fontFamily: 'Baskerville',
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  chip: {
    backgroundColor: 'rgba(152, 212, 250, 0.08)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 11,
    color: 'rgba(152, 212, 250, 0.55)',
    textTransform: 'lowercase',
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  reflectBtn: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(152, 212, 250, 0.5)',
  },
});
