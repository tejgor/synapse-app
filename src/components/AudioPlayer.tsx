import React, { useState, useRef, useCallback } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import { colors, borderRadius, spacing } from '../constants/theme';

interface AudioPlayerProps {
  uri: string;
}

export function AudioPlayer({ uri }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  const togglePlayback = useCallback(async () => {
    if (isPlaying && soundRef.current) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
      return;
    }

    if (soundRef.current) {
      await soundRef.current.playAsync();
      setIsPlaying(true);
      return;
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true },
      (status) => {
        if (status.isLoaded) {
          setPosition(status.positionMillis);
          setDuration(status.durationMillis ?? 0);
          if (status.didJustFinish) {
            setIsPlaying(false);
            setPosition(0);
            soundRef.current?.setPositionAsync(0);
          }
        }
      }
    );
    soundRef.current = sound;
    setIsPlaying(true);
  }, [isPlaying, uri]);

  const progress = duration > 0 ? position / duration : 0;

  function formatMs(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={togglePlayback} style={styles.playButton}>
        <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶️'}</Text>
      </Pressable>
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{formatMs(position)}</Text>
          <Text style={styles.time}>{formatMs(duration)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 18,
  },
  progressContainer: {
    flex: 1,
    gap: spacing.xs,
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.cardBorder,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
