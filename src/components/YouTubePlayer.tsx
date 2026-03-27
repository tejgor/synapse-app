import React, { useCallback, useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import { colors, borderRadius } from '../constants/theme';
import type { TimestampedHighlight } from '../types';

export interface YouTubePlayerHandle {
  seekTo: (seconds: number) => void;
  getDuration: () => Promise<number>;
}

interface YouTubePlayerProps {
  videoId: string;
  onCurrentTimeChange?: (time: number) => void;
  supercutMode?: boolean;
  highlights?: TimestampedHighlight[];
  onHighlightChange?: (index: number) => void;
  onSupercutComplete?: () => void;
  onReady?: () => void;
}

export const YouTubePlayerComponent = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayerComponent(
    { videoId, onCurrentTimeChange, supercutMode, highlights, onHighlightChange, onSupercutComplete, onReady },
    ref
  ) {
    const playerRef = useRef<YoutubeIframeRef>(null);
    const [playing, setPlaying] = useState(false);

    // Refs for supercut engine — avoids stale closures inside setInterval
    const highlightIndexRef = useRef(0);
    const seekingRef = useRef(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const playingRef = useRef(false);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        seekingRef.current = true;
        playerRef.current?.seekTo(seconds, true);
        setPlaying(true);
        playingRef.current = true;
      },
      getDuration: () => {
        return playerRef.current?.getDuration() ?? Promise.resolve(0);
      },
    }));

    // Keep playingRef in sync with playing state
    useEffect(() => {
      playingRef.current = playing;
    }, [playing]);

    const stopInterval = useCallback(() => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, []);

    const startInterval = useCallback(() => {
      if (!playerRef.current || !highlights || highlights.length === 0) return;
      stopInterval();

      intervalRef.current = setInterval(async () => {
        if (!playingRef.current) return;

        const currentTime = await playerRef.current?.getCurrentTime() ?? 0;
        onCurrentTimeChange?.(currentTime);

        const idx = highlightIndexRef.current;
        const currentHighlight = highlights[idx];
        if (!currentHighlight) return;

        // While seek is in flight, wait until we land inside the target segment
        if (seekingRef.current) {
          if (currentTime >= currentHighlight.timestamp && currentTime < currentHighlight.endTimestamp) {
            seekingRef.current = false;
          }
          return;
        }

        // Boundary check: current segment finished
        if (currentTime >= currentHighlight.endTimestamp) {
          const nextIdx = idx + 1;
          if (nextIdx < highlights.length) {
            highlightIndexRef.current = nextIdx;
            onHighlightChange?.(nextIdx);
            seekingRef.current = true;
            playerRef.current?.seekTo(highlights[nextIdx].timestamp, true);
          } else {
            // Supercut complete
            stopInterval();
            setPlaying(false);
            playingRef.current = false;
            onSupercutComplete?.();
          }
        }
      }, 500);
    }, [highlights, onCurrentTimeChange, onHighlightChange, onSupercutComplete, stopInterval]);

    // React to supercutMode toggling on/off
    useEffect(() => {
      if (supercutMode && highlights && highlights.length > 0) {
        highlightIndexRef.current = 0;
        seekingRef.current = true;
        playerRef.current?.seekTo(highlights[0].timestamp, true);
        setPlaying(true);
        playingRef.current = true;
        startInterval();
      } else {
        stopInterval();
      }

      return stopInterval;
    }, [supercutMode]); // eslint-disable-line react-hooks/exhaustive-deps — intentionally only triggers on mode change

    const onStateChange = useCallback((state: string) => {
      if (state === 'ended') {
        setPlaying(false);
        playingRef.current = false;
        stopInterval();
      } else if (state === 'paused') {
        playingRef.current = false;
        stopInterval();
      } else if (state === 'playing') {
        playingRef.current = true;
        if (supercutMode && highlights && highlights.length > 0) {
          startInterval();
        }
      }
    }, [supercutMode, highlights, startInterval, stopInterval]);

    return (
      <View style={styles.container}>
        <YoutubePlayer
          ref={playerRef}
          height={220}
          videoId={videoId}
          play={playing}
          onChangeState={onStateChange}
          onReady={onReady}
          webViewStyle={styles.webView}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  webView: {
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
  },
});
