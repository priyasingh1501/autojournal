import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import MicOrb, { MicState } from './MicOrb';
import { WarmLine } from '../../services/WarmLineService';

interface Props {
  micState: MicState;
  audioLevel?: number;
  onMicPress: () => void;
  shouldPlay: boolean;
  warmLine?: WarmLine | null;
  warmLineLoading?: boolean;
}

const { height: SCREEN_H } = Dimensions.get('window');
const MIN_H = Math.max(Math.floor(SCREEN_H * 0.33), 180);

export default function MicTile({
  micState, audioLevel, onMicPress, shouldPlay,
  warmLine, warmLineLoading,
}: Props) {
  const videoRef = useRef<Video>(null);
  const [videoError, setVideoError] = useState(false);


  return (
    <View style={s.tile}>
      {/* Layer 1: video background (or fallback) */}
      {videoError ? (
        <View style={[StyleSheet.absoluteFill, s.fallback]} />
      ) : (
        <View style={Platform.OS === 'android'
          ? [StyleSheet.absoluteFill, s.androidClip]
          : StyleSheet.absoluteFill}>
          <Video
            ref={videoRef}
            source={require('../../../assets/video/ocean_home.mp4')}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            isLooping
            isMuted
            shouldPlay={shouldPlay}
            onError={() => setVideoError(true)}
            useNativeControls={false}
          />
        </View>
      )}

      {/* Layer 2: flat dark overlay */}
      <View style={[StyleSheet.absoluteFill, s.overlay]} pointerEvents="none" />

      {/* Layer 3: gradient darkening toward bottom */}
      <LinearGradient
        colors={['rgba(0,0,0,0.10)', 'rgba(0,0,0,0.60)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Content column: orb + warm line */}
      <View style={s.content}>
        {/* Orb — warm line replaces "tap to speak" when loaded */}
        <View style={s.orbSection}>
          <MicOrb
            state={micState}
            audioLevel={audioLevel}
            onPress={onMicPress}
            idleLabel={warmLine?.text
              ? warmLine.text.replace(/[.!?]\s*$/, '').trimEnd() + '. Tap to speak about it.'
              : undefined}
          />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tile: {
    minHeight: MIN_H,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0d1f3c',
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.12)',
  },
  androidClip: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  fallback: {
    backgroundColor: '#0d1f3c',
  },

  content: {
    flexDirection: 'column',
  },

  orbSection: {
    minHeight: MIN_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
  },

});
