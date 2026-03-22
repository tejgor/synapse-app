import React, { useCallback, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import { colors, borderRadius } from '../constants/theme';

export interface YouTubePlayerHandle {
  seekTo: (seconds: number) => void;
}

interface YouTubePlayerProps {
  videoId: string;
  onCurrentTimeChange?: (time: number) => void;
}

export const YouTubePlayerComponent = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayerComponent({ videoId, onCurrentTimeChange }, ref) {
    const playerRef = useRef<YoutubeIframeRef>(null);
    const [playing, setPlaying] = useState(false);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        playerRef.current?.seekTo(seconds, true);
        setPlaying(true);
      },
    }));

    const onStateChange = useCallback((state: string) => {
      if (state === 'ended') {
        setPlaying(false);
      }
    }, []);

    return (
      <View style={styles.container}>
        <YoutubePlayer
          ref={playerRef}
          height={220}
          videoId={videoId}
          play={playing}
          onChangeState={onStateChange}
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
