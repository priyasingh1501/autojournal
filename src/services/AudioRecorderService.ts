import { Audio } from 'expo-av';
import { PendingClip } from '../types';
import { StorageService } from './StorageService';

export type RecordingStatus = 'idle' | 'monitoring' | 'recording';

type StatusCallback = (status: RecordingStatus) => void;
type PendingClipCallback = (clip: PendingClip) => void;
type ErrorCallback = (error: string) => void;

const DEFAULT_VAD_THRESHOLD = -35; // dB
const DEFAULT_SILENCE_DURATION = 2000; // ms

class AudioRecorderService {
  private recording: Audio.Recording | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private isMonitoring = false;
  private currentStatus: RecordingStatus = 'idle';
  private recordingStartTime = 0;
  // Cached settings — read once on startMonitoring, not on every 100ms callback
  private vadThreshold = DEFAULT_VAD_THRESHOLD;
  private silenceDuration = DEFAULT_SILENCE_DURATION;
  private batchSize = 0;

  private onStatus: StatusCallback = () => {};
  private onPendingClip: PendingClipCallback = () => {};
  private onError: ErrorCallback = () => {};

  setCallbacks(callbacks: {
    onStatus: StatusCallback;
    onPendingClip: PendingClipCallback;
    onError: ErrorCallback;
  }) {
    this.onStatus = callbacks.onStatus;
    this.onPendingClip = callbacks.onPendingClip;
    this.onError = callbacks.onError;
  }

  private setStatus(status: RecordingStatus) {
    this.currentStatus = status;
    this.onStatus(status);
  }

  async requestPermissions(): Promise<boolean> {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;

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

    // Cache settings once so the 100ms metering callback never hits AsyncStorage
    const settings = await StorageService.getSettings();
    this.vadThreshold = settings?.vadThreshold ?? DEFAULT_VAD_THRESHOLD;
    this.silenceDuration = settings?.silenceDuration ?? DEFAULT_SILENCE_DURATION;
    this.batchSize = settings?.batchSize ?? 0;

    this.isMonitoring = true;
    this.setStatus('monitoring');
    await this.startListening();
  }

  private async startListening(): Promise<void> {
    if (!this.isMonitoring) return;
    try {
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        (status) => this.handleRecordingStatus(status),
        100,
      );
      this.recording = recording;
    } catch (err) {
      this.onError(`Failed to start recording: ${err}`);
    }
  }

  private handleRecordingStatus(status: Audio.RecordingStatus): void {
    if (!status.isRecording || !this.isMonitoring) return;

    const db = status.metering ?? -160;
    const isSpeaking = db > this.vadThreshold;

    if (isSpeaking && this.currentStatus === 'monitoring') {
      this.clearSilenceTimer();
      this.setStatus('recording');
      this.recordingStartTime = Date.now();
    } else if (!isSpeaking && this.currentStatus === 'recording') {
      if (!this.silenceTimer) {
        this.silenceTimer = setTimeout(() => this.saveClip(), this.silenceDuration);
      }
    }
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private async saveClip(): Promise<void> {
    if (!this.recording || this.currentStatus !== 'recording') return;

    this.clearSilenceTimer();
    const duration = (Date.now() - this.recordingStartTime) / 1000;
    const startTime = this.recordingStartTime;
    const recordingRef = this.recording;
    this.recording = null;

    await recordingRef.stopAndUnloadAsync();
    const uri = recordingRef.getURI();

    // Restart listening immediately
    if (this.isMonitoring) {
      this.setStatus('monitoring');
      await this.startListening();
    }

    // Save clip locally — no API call yet
    if (uri && duration > 0.5) {
      const clip: PendingClip = {
        id: `${startTime}-${Math.random().toString(36).substr(2, 9)}`,
        uri,
        timestamp: startTime,
        duration,
      };
      await StorageService.addPendingClip(clip);
      this.onPendingClip(clip);

      // Auto-transcribe if batch size threshold is reached
      if (this.batchSize > 0) {
        const pending = await StorageService.getPendingClips();
        if (pending.length >= this.batchSize) {
          this.onError('__BATCH_READY__');
        }
      }
    }
  }

  async stopMonitoring(): Promise<void> {
    this.isMonitoring = false;
    this.clearSilenceTimer();

    if (this.recording) {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch {}
      this.recording = null;
    }

    this.setStatus('idle');
  }

  getStatus(): RecordingStatus {
    return this.currentStatus;
  }
}

export const audioRecorderService = new AudioRecorderService();
