import { Audio } from 'expo-av';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { PendingClip } from '../types';
import { StorageService } from './StorageService';

export type RecordingStatus = 'idle' | 'recording';

type StatusCallback    = (status: RecordingStatus) => void;
type PendingClipCallback = (clip: PendingClip) => void;
type ErrorCallback     = (error: string) => void;

class AudioRecorderService {
  private recording: Audio.Recording | null = null;
  private recordingStartTime = 0;
  private currentStatus: RecordingStatus = 'idle';

  private onStatus:      StatusCallback      = () => {};
  private onPendingClip: PendingClipCallback = () => {};
  private onError:       ErrorCallback       = () => {};

  setCallbacks(callbacks: {
    onStatus:      StatusCallback;
    onPendingClip: PendingClipCallback;
    onError:       ErrorCallback;
  }) {
    this.onStatus      = callbacks.onStatus;
    this.onPendingClip = callbacks.onPendingClip;
    this.onError       = callbacks.onError;
  }

  private setStatus(status: RecordingStatus) {
    this.currentStatus = status;
    this.onStatus(status);
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Access',
            message: 'untangle needs the microphone to record your voice for journaling.',
            buttonNeutral: 'Ask Later',
            buttonNegative: 'Deny',
            buttonPositive: 'Allow',
          },
        );
        if (result === PermissionsAndroid.RESULTS.GRANTED) return true;
        if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          Alert.alert(
            'Microphone Access Needed',
            'untangle needs the microphone to record your voice. Please enable it in your device Settings.',
            [
              { text: 'Not Now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        }
        return false;
      } catch {
        return false;
      }
    }

    // iOS
    const { status, canAskAgain } = await Audio.requestPermissionsAsync();
    if (status === 'granted') return true;
    if (!canAskAgain) {
      Alert.alert(
        'Microphone Access Needed',
        'untangle needs the microphone to record your voice. Please enable it in your device Settings.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
    return false;
  }

  // Tap once → start recording
  async startMonitoring(): Promise<void> {
    if (this.currentStatus === 'recording') return;

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      this.onError('Microphone permission denied.');
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });

    try {
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      this.recording = recording;
      this.recordingStartTime = Date.now();
      this.setStatus('recording');
    } catch (err) {
      this.onError(`Failed to start recording: ${err}`);
    }
  }

  // Tap again → stop, save one clip
  async stopMonitoring(): Promise<void> {
    const recordingRef = this.recording;
    const startTime    = this.recordingStartTime;
    this.recording     = null;
    this.setStatus('idle');

    if (!recordingRef) return;

    try {
      await recordingRef.stopAndUnloadAsync();
      const uri      = recordingRef.getURI();
      const duration = (Date.now() - startTime) / 1000;

      if (uri && duration > 0.5) {
        const clip: PendingClip = {
          id:        `${startTime}-${Math.random().toString(36).substr(2, 9)}`,
          uri,
          timestamp: startTime,
          duration,
        };
        await StorageService.addPendingClip(clip);
        this.onPendingClip(clip);
      }
    } catch (err) {
      this.onError(`Failed to save recording: ${err}`);
    }
  }

  getStatus(): RecordingStatus {
    return this.currentStatus;
  }
}

export const audioRecorderService = new AudioRecorderService();
