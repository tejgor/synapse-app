import { useState, useRef, useCallback } from 'react';
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from 'expo-audio';
import { Paths, Directory, File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';

interface UseRecorderReturn {
  isRecording: boolean;
  duration: number;
  audioUri: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  resetRecording: () => void;
}

export function useRecorder(): UseRecorderReturn {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [duration, setDuration] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async () => {
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    if (!granted) return;

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    await recorder.prepareToRecordAsync();
    recorder.record();

    setDuration(0);
    setAudioUri(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    intervalRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  }, [recorder]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!recorder.isRecording) return null;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await recorder.stop();

    await setAudioModeAsync({
      allowsRecording: false,
    });

    const uri = recorder.uri;
    if (uri) {
      const recordingsDir = new Directory(Paths.document, 'recordings');
      if (!recordingsDir.exists) {
        recordingsDir.create();
      }
      const filename = `recording-${Date.now()}.m4a`;
      const sourceFile = new File(uri);
      const destFile = new File(recordingsDir, filename);
      sourceFile.move(destFile);
      const destUri = destFile.uri;
      setAudioUri(destUri);
      return destUri;
    }

    return null;
  }, [recorder]);

  const resetRecording = useCallback(() => {
    setAudioUri(null);
    setDuration(0);
  }, []);

  return { isRecording: recorder.isRecording, duration, audioUri, startRecording, stopRecording, resetRecording };
}
