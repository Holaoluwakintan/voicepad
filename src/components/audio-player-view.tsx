import { useState } from 'react';
import { View, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { ThemedText } from './themed-text';
import { formatDuration } from '@/lib/notes';

const ACCENT = '#6D5DFB';
const INK = '#17152A';
const MUTED = '#79768A';
const TRACK_BG = '#E5E7EB';

const SPEEDS = [1.0, 1.25, 1.5, 2.0];

interface AudioPlayerViewProps {
  source: string | null;
  onFinished?: () => void;
}

export function AudioPlayerView({ source }: AudioPlayerViewProps) {
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);

  if (!source) return null;

  const duration = status.duration ?? 0;
  const currentTime = status.currentTime ?? 0;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  async function togglePlay() {
    if (!player) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (status.playing) {
      player.pause();
      return;
    }

    if (duration > 0 && currentTime >= duration - 0.2) {
      await player.seekTo(0);
    }

    player.play();
  }

  async function cycleSpeed() {
    if (!player) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    const nextIndex = (speedIndex + 1) % SPEEDS.length;
    const nextSpeed = SPEEDS[nextIndex];
    setSpeedIndex(nextIndex);
    player.setPlaybackRate(nextSpeed);
  }

  async function handleSeek(e: { nativeEvent: { locationX: number } }) {
    if (!player || duration <= 0 || trackWidth <= 0) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    const touchX = Math.max(0, Math.min(trackWidth, e.nativeEvent.locationX));
    const targetSeconds = (touchX / trackWidth) * duration;
    await player.seekTo(targetSeconds);
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable
          onPress={togglePlay}
          style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
          accessibilityLabel={status.playing ? 'Pause audio' : 'Play audio'}>
          <ThemedText style={styles.playIcon}>{status.playing ? '⏸' : '▶'}</ThemedText>
        </Pressable>

        <View style={styles.timeInfo}>
          <ThemedText style={styles.timeLabel}>
            {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(duration))}
          </ThemedText>
          <ThemedText style={styles.stateLabel}>
            {status.playing ? 'Playing' : status.isBuffering ? 'Buffering…' : 'Voice note'}
          </ThemedText>
        </View>

        <Pressable onPress={cycleSpeed} style={styles.speedPill} accessibilityLabel="Playback speed">
          <ThemedText style={styles.speedText}>{SPEEDS[speedIndex]}x</ThemedText>
        </Pressable>
      </View>

      {/* Progress Track / Seek Bar */}
      <Pressable
        onPress={handleSeek}
        onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
        style={styles.trackContainer}>
        <View style={styles.trackBackground}>
          <View style={[styles.trackFill, { width: `${progressPercent}%` }]} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F8F9FD',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8ECF4',
    padding: 16,
    marginTop: 18,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  playIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    marginLeft: 2,
  },
  timeInfo: {
    flex: 1,
  },
  timeLabel: {
    color: INK,
    fontSize: 15,
    fontWeight: '800',
  },
  stateLabel: {
    color: MUTED,
    fontSize: 12,
    marginTop: 2,
  },
  speedPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8DEEB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  speedText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '800',
  },
  trackContainer: {
    height: 24,
    justifyContent: 'center',
    marginTop: 10,
  },
  trackBackground: {
    height: 6,
    backgroundColor: TRACK_BG,
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: ACCENT,
    borderRadius: 3,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.88,
  },
});
