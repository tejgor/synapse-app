import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
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
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) return;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );

    recordingRef.current = recording;
    setIsRecording(true);
    setDuration(0);
    setAudioUri(null);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    intervalRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!recordingRef.current) return null;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsRecording(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    await recordingRef.current.stopAndUnloadAsync();
    const uri = recordingRef.current.getURI();
    recordingRef.current = null;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });

    if (uri) {
      // Use the new expo-file-system API
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
  }, []);

  const resetRecording = useCallback(() => {
    setAudioUri(null);
    setDuration(0);
  }, []);

  return { isRecording, duration, audioUri, startRecording, stopRecording, resetRecording };
}
