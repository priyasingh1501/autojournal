/**
 * MonthChapterCard — one slide of the Past months carousel. Renders a
 * generated chapter (image, title, story, enneagram) for an archived month.
 * Triggers lazy generation on mount via MonthChapterService.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Animated,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { MonthChapter, PatternsReport } from '../types';
import {
  ensureChapter,
  regenerateChapter,
} from '../services/MonthChapterService';
import EnneagramWheel from './EnneagramWheel';

interface Props {
  month: string;             // YYYY-MM
  report: PatternsReport;
}

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W   = SCREEN_W;
const IMAGE_H  = Math.round(SCREEN_W * 0.62);

export default function MonthChapterCard({ month, report }: Props) {
  const [chapter, setChapter] = useState<MonthChapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const imageFade = useRef(new Animated.Value(0)).current;
  const monthLabel = monthLabelOf(month);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ensureChapter(month, report).then(c => {
      if (cancelled) return;
      setChapter(c);
      setLoading(false);
      if (c?.imageUri) {
        Animated.timing(imageFade, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }).start();
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const handleRegenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    imageFade.setValue(0);
    const fresh = await regenerateChapter(month, report);
    setChapter(fresh);
    setRegenerating(false);
    if (fresh?.imageUri) {
      Animated.timing(imageFade, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }
  };

  return (
    <View style={s.card}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Image */}
        <View style={s.imageWrap}>
          {chapter?.imageUri ? (
            <Animated.Image
              source={{ uri: chapter.imageUri }}
              style={[s.image, { opacity: imageFade }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[s.image, s.imageFallback]}>
              <Text style={s.imageFallbackText}>
                {loading || regenerating ? 'painting your chapter…' : 'no image yet'}
              </Text>
            </View>
          )}
          {/* Gradient + month label overlay */}
          <LinearGradient
            colors={['rgba(2,6,14,0)', 'rgba(2,6,14,0.85)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={s.imageGradient}
            pointerEvents="none"
          />
          <Text style={s.monthLabel}>{monthLabel}</Text>
        </View>

        {/* Title + story */}
        <View style={s.body}>
          {chapter?.title ? (
            <Text style={s.title}>{chapter.title}</Text>
          ) : loading ? (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
              <Text style={s.loadingText}>writing your chapter…</Text>
            </View>
          ) : (
            <Text style={s.title}>Couldn't write this chapter</Text>
          )}

          {chapter?.story ? (
            <Text style={s.story}>{chapter.story}</Text>
          ) : !loading && !chapter ? (
            <Text style={s.fallbackBody}>{report.thisMonth.reflection}</Text>
          ) : null}

          {/* Enneagram */}
          {chapter?.enneagram && chapter.enneagram.some(w => w > 0) && (
            <View style={s.wheelWrap}>
              <Text style={s.wheelHeading}>How you showed up</Text>
              <EnneagramWheel weights={chapter.enneagram} size={200} />
            </View>
          )}

          {/* Footer: entry count + regenerate */}
          <View style={s.footer}>
            <Text style={s.footerStat}>
              {report.entryCount} entr{report.entryCount === 1 ? 'y' : 'ies'} this month
            </Text>
            {chapter && !loading && (
              <TouchableOpacity onPress={handleRegenerate} disabled={regenerating} hitSlop={8}>
                <Text style={s.regenLink}>
                  {regenerating ? 'Regenerating…' : 'Regenerate'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function monthLabelOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const s = StyleSheet.create({
  card: {
    width: CARD_W,
    flex: 1,
  },
  scroll: {
    paddingBottom: 48,
  },
  imageWrap: {
    width: '100%',
    height: IMAGE_H,
    backgroundColor: '#0d1f3c',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d1f3c',
  },
  imageFallbackText: {
    fontSize: 12,
    color: 'rgba(152,212,250,0.50)',
    fontFamily: 'GillSans-Light',
    letterSpacing: 0.4,
  },
  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
  },
  monthLabel: {
    position: 'absolute',
    left: 20,
    bottom: 14,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(224,242,254,0.85)',
    fontFamily: 'GillSans-Light',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  title: {
    fontSize: 22,
    lineHeight: 30,
    color: 'rgba(224,242,254,0.95)',
    fontFamily: 'Baskerville',
    marginBottom: 16,
  },
  story: {
    fontSize: 15,
    lineHeight: 26,
    color: 'rgba(224,242,254,0.80)',
    fontFamily: 'GillSans-Light',
  },
  fallbackBody: {
    fontSize: 14,
    lineHeight: 23,
    color: 'rgba(224,242,254,0.75)',
    fontFamily: 'GillSans-Light',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.60)',
    fontFamily: 'GillSans-Light',
  },
  wheelWrap: {
    marginTop: 32,
    alignItems: 'center',
  },
  wheelHeading: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    marginBottom: 16,
  },
  footer: {
    marginTop: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152,212,250,0.10)',
  },
  footerStat: {
    fontSize: 11.5,
    color: 'rgba(152,212,250,0.45)',
    fontFamily: 'GillSans-Light',
  },
  regenLink: {
    fontSize: 12,
    color: 'rgba(152,212,250,0.70)',
    fontFamily: 'GillSans',
    letterSpacing: 0.3,
  },
});
