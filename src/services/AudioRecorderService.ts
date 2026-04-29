import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { PendingClip } from '../types';
import { StorageService } from './StorageService';

export type RecordingStatus = 'idle' | 'monitoring' | 'recording';

type StatusCallback    = (status: RecordingStatus) => void;
type PendingClipCallback = (clip: PendingClip) => void;
type ErrorCallback     = (error: string) => void;
type AudioLevelCallback = (db: number) => void;

const MAX_RECORDING_MS = 25 * 60 * 1000; // 25 minutes

// A clip below this size is almost certainly a failed recording (mic blocked
// at the OS level, hardware fault, or the encoder closing without writing
// any audio frames). Whisper would either 400 the upload or return empty
// text — either way, sending it wastes a round-trip and worries the user.
const MIN_CLIP_BYTES = 1024; // 1 KB

// Whisper's hard limit is 25 MB. We cap a little lower for header/upload
// overhead and to leave a safety margin so a borderline clip doesn't fail
// after the user has already waited for an upload. With our voice-optimized
// recording profile (mono, 16 kHz, 32 kbps), reaching this size requires
// roughly 100 minutes of audio — well past MAX_RECORDING_MS — so this is
// only a real cap for legacy clips recorded before that profile shipped.
export const MAX_CLIP_BYTES = 24 * 1024 * 1024; // 24 MB

// Voice-optimized recording profile. Whisper internally downsamples
// everything to 16 kHz mono, so recording at 44.1 kHz stereo (the
// HIGH_QUALITY preset) wastes ~10× the bytes for zero quality gain. This
// profile lands at ~240 KB/min, keeping a 25-minute entry well under the
// Whisper size limit and reducing upload time on slow networks.
const VOICE_RECORDING_OPTIONS: Audio.RecordingOptions = {
  ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  ios: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  android: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
};

class AudioRecorderService {
  private recording: Audio.Recording | null = null;
  private recordingStartTime = 0;
  private currentStatus: RecordingStatus = 'idle';
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  // Coalesce concurrent start/stop calls (rapid double-tap) onto the same
  // in-flight promise so we never leak a half-constructed recording.
  private startInFlight: Promise<void> | null = null;
  private stopInFlight:  Promise<void> | null = null;

  private onStatus:      StatusCallback      = () => {};
  private onPendingClip: PendingClipCallback = () => {};
  private onError:       ErrorCallback       = () => {};
  private onAudioLevel:  AudioLevelCallback | null = null;

  setCallbacks(callbacks: {
    onStatus:      StatusCallback;
    onPendingClip: PendingClipCallback;
    onError:       ErrorCallback;
    onAudioLevel?: AudioLevelCallback;
  }) {
    this.onStatus      = callbacks.onStatus;
    this.onPendingClip = callbacks.onPendingClip;
    this.onError       = callbacks.onError;
    this.onAudioLevel  = callbacks.onAudioLevel ?? null;
  }

  private setStatus(status: RecordingStatus) {
    this.currentStatus = status;
    this.onStatus(status);
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        // Check first — avoids showing the dialog on every tap if already granted
        const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (already) return true;

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

    // iOS — check first before requesting
    const { status: existing } = await Audio.getPermissionsAsync();
    if (existing === 'granted') return true;

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
    // Coalesce double-taps. Without this, two near-simultaneous taps both
    // pass the `currentStatus !== 'recording'` gate, both call createAsync,
    // and we leak the first recording while only the second is tracked.
    if (this.startInFlight) return this.startInFlight;
    if (this.currentStatus === 'recording') return;
    this.startInFlight = this._doStart();
    try {
      await this.startInFlight;
    } finally {
      this.startInFlight = null;
    }
  }

  private async _doStart(): Promise<void> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      // Silent return — requestPermissions already showed an OS dialog and,
      // when applicable, an "Open Settings" alert. Surfacing another generic
      // "Error" alert here would stack three modals on the user.
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });

    try {
      const { recording } = await Audio.Recording.createAsync(
        VOICE_RECORDING_OPTIONS,
        (status) => {
          // Forward dB level (0 = max, around -160 = silence) to the UI so
          // it can warn the user if their voice is consistently too quiet.
          if (status.isRecording && typeof status.metering === 'number') {
            this.onAudioLevel?.(status.metering);
          }
          // Detect external interruption (phone call, another app grabbing
          // audio, mic permission revoked mid-record). The OS stops the
          // recording silently — without this watcher the UI would stay in
          // 'recording' state forever.
          if (
            this.currentStatus === 'recording' &&
            status.isDoneRecording === false &&
            status.canRecord === false
          ) {
            this.onError('Recording was interrupted');
            this.stopMonitoring().catch(() => {});
          }
        },
        100, // status update interval (ms)
      );
      this.recording = recording;
      this.recordingStartTime = Date.now();
      this.setStatus('recording');
      this.autoStopTimer = setTimeout(() => this.stopMonitoring(), MAX_RECORDING_MS);
    } catch (err) {
      this.onError(`Failed to start recording: ${err}`);
    }
  }

  // Tap again → stop, save one clip
  async stopMonitoring(): Promise<void> {
    // Coalesce concurrent stop calls (e.g. user tap + auto-stop timer +
    // interruption watcher all racing). Otherwise stopAndUnloadAsync runs
    // twice on the same Recording object and the second throws.
    if (this.stopInFlight) return this.stopInFlight;
    this.stopInFlight = this._doStop();
    try {
      await this.stopInFlight;
    } finally {
      this.stopInFlight = null;
    }
  }

  private async _doStop(): Promise<void> {
    if (this.autoStopTimer) { clearTimeout(this.autoStopTimer); this.autoStopTimer = null; }
    const recordingRef = this.recording;
    const startTime    = this.recordingStartTime;
    this.recording     = null;
    this.setStatus('idle');

    if (!recordingRef) return;

    try {
      await recordingRef.stopAndUnloadAsync();
      const uri      = recordingRef.getURI();
      const duration = (Date.now() - startTime) / 1000;

      if (!uri || duration <= 0.5) return;

      // Validate the file is plausibly transcribable before adding it to
      // the pending queue. Letting a 0-byte or oversized file in means the
      // orb shows "thinking…" only for the upload to fail at the server,
      // which burns network round-trips and confuses the user. Catching
      // it here is cheap and the error message can be specific.
      const info = await FileSystem.getInfoAsync(uri);
      const size = info.exists ? (info.size ?? 0) : 0;

      if (!info.exists || size < MIN_CLIP_BYTES) {
        // Best-effort cleanup — the file is unusable.
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
        this.onError(
          'No audio was captured. Make sure the microphone is allowed in Settings and try again.',
        );
        return;
      }
      if (size > MAX_CLIP_BYTES) {
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
        this.onError(
          'That recording is too long to transcribe. Try splitting it into shorter clips.',
        );
        return;
      }

      const clip: PendingClip = {
        id:        `${startTime}-${Math.random().toString(36).substr(2, 9)}`,
        uri,
        timestamp: startTime,
        duration,
      };
      await StorageService.addPendingClip(clip);
      this.onPendingClip(clip);
    } catch (err) {
      this.onError(`Failed to save recording: ${err}`);
    }
  }

  getStatus(): RecordingStatus {
    return this.currentStatus;
  }
}

export const audioRecorderService = new AudioRecorderService();
