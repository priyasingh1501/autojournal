import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { WarmLine } from '../../services/WarmLineService';

interface Props {
  warmLine: WarmLine | null;
  loading: boolean;
  onTap: () => void;
  onTellMeMore: () => void;
  onJournalThis: () => void;
}

export default function WarmLineCard({ warmLine, loading, onTap, onTellMeMore, onJournalThis }: Props) {
  const translateY = useRef(new Animated.Value(8)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (warmLine && !loading && !hasAnimated.current) {
      hasAnimated.current = true;
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [warmLine, loading]);

  if (loading) {
    return <View style={s.skeleton} />;
  }

  if (!warmLine) return null;

  const isTappable = warmLine.tapTarget !== 'none';

  return (
    <Animated.View style={[s.card, { opacity, transform: [{ translateY }] }]}>

      <TouchableOpacity
        onPress={onTap}
        disabled={!isTappable}
        activeOpacity={1}
        style={s.inner}
      >
        <Text style={s.text}>{warmLine.text}</Text>

        <View style={s.actions}>
          <TouchableOpacity onPress={onTellMeMore} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={s.actionBtn}>
            <Text style={s.actionText}>tell me more →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onJournalThis} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={s.actionBtn}>
            <Text style={s.actionText}>journal this →</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  skeleton: {
    height: 80,
    borderRadius: 16,
    backgroundColor: 'rgba(152,212,250,0.06)',
    marginBottom: 0,
  },

  card: {
    flexDirection: 'row',
    backgroundColor: 'rgba(3,18,40,0.80)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.16)',
    overflow: 'hidden',
  },

  inner: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },

  text: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Baskerville' : 'serif',
    color: 'rgba(224,242,254,0.88)',
    lineHeight: 22,
    marginBottom: 10,
  },

  actions: {
    flexDirection: 'row',
    gap: 12,
  },

  actionBtn: {
    paddingVertical: 8,
  },

  actionText: {
    fontSize: 12,
    color: '#5dcaa5',
    fontFamily: 'GillSans-Light',
  },
});
