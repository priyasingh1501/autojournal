import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { TranscriptEntry } from '../types';
import { transcribeAudio } from './TranscriptionService';
import { StorageService } from './StorageService';

export type RecordingStatus = 'idle' | 'monitoring' | 'recording' | 'transcribing';

type StatusCallback = (status: RecordingStatus) => void;
type TranscriptCallback = (entry: TranscriptEntry) => void;
type ErrorCallback = (error: string) => void;

const DEFAULT_VAD_THRESHOLD = -35; // dB
const DEFAULT_SILENCE_DURATION = 2000; // ms

class AudioRecorderService {
  private recording: Audio.Recording | null = null;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private isMonitoring = false;
  private currentStatus: RecordingStatus = 'idle';
  private recordingStartTime = 0;

  private onStatus: StatusCallback = () => {};
  private onTranscript: TranscriptCallback = () => {};
  private onError: ErrorCallback = () => {};

  setCallbacks(callbacks: {
    onStatus: StatusCallback;
    onTranscript: TranscriptCallback;
    onError: ErrorCallback;
  }) {
    this.onStatus = callbacks.onStatus;
    this.onTranscript = callbacks.onTranscript;
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

    this.isMonitoring = true;
    this.setStatus('monitoring');

    // Use a recording with metering to detect voice activity
    this.monitorInterval = setInterval(() => this.checkAudioLevel(), 200);
    await this.startLevelMonitorRecording();
  }

  private async startLevelMonitorRecording(): Promise<void> {
    if (!this.isMonitoring) return;
    try {
      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        },
        (status) => this.handleRecordingStatus(status),
        100,
      );
      this.recording = recording;
    } catch (err) {
      this.onError(`Failed to start recording: ${err}`);
    }
  }

  private async handleRecordingStatus(status: Audio.RecordingStatus): Promise<void> {
    if (!status.isRecording || !this.isMonitoring) return;

    const settings = await StorageService.getSettings();
    const threshold = settings?.vadThreshold ?? DEFAULT_VAD_THRESHOLD;
    const silenceDuration = settings?.silenceDuration ?? DEFAULT_SILENCE_DURATION;

    const db = status.metering ?? -160;
    const isSpeaking = db > threshold;

    if (isSpeaking && this.currentStatus === 'monitoring') {
      // Voice detected — start capturing
      this.clearSilenceTimer();
      this.setStatus('recording');
      this.recordingStartTime = Date.now();
    } else if (!isSpeaking && this.currentStatus === 'recording') {
      // Silence detected — start silence timer
      if (!this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          this.finishRecording();
        }, silenceDuration);
      }
    }
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private async finishRecording(): Promise<void> {
    if (!this.recording || this.currentStatus !== 'recording') return;

    this.clearSilenceTimer();
    this.setStatus('transcribing');

    const duration = (Date.now() - this.recordingStartTime) / 1000;
    const recordingRef = this.recording;
    this.recording = null;

    try {
      await recordingRef.stopAndUnloadAsync();
      const uri = recordingRef.getURI();

      if (uri && duration > 0.5) {
        // Only transcribe if more than 0.5 seconds of speech
        const text = await transcribeAudio(uri);

        if (text.length > 2) {
          const entry: TranscriptEntry = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: this.recordingStartTime,
            text,
            duration,
            audioUri: uri,
          };
          await StorageService.addTranscript(entry);
          this.onTranscript(entry);
        }

        // Clean up audio file to save storage
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch {}
      }
    } catch (err: any) {
      this.onError(`Transcription failed: ${err.message}`);
    }

    if (this.isMonitoring) {
      this.setStatus('monitoring');
      // Restart a fresh recording for level monitoring
      await this.startLevelMonitorRecording();
    }
  }

  async stopMonitoring(): Promise<void> {
    this.isMonitoring = false;
    this.clearSilenceTimer();

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

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

  // Placeholder to satisfy the setInterval call structure (actual VAD is via status callback)
  private checkAudioLevel(): void {
    // Audio level checking is handled via the recording status callback
    // This interval exists as a keepalive mechanism
  }
}

export const audioRecorderService = new AudioRecorderService();
