import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';

const NUM_BARS = 29;

interface AudioWaveformProps {
  isRecording: boolean;
  metering?: number;
  height?: number;
  color?: string;
}

/**
 * Live level meter: symmetric bars that swell from the centre with the mic's
 * loudness. Plain Views (no canvas) so it stays cheap on low-end phones.
 */
export function AudioWaveform({ isRecording, metering, height = 100, color = '#FFFFFF' }: AudioWaveformProps) {
  const power = useMemo(() => {
    if (!isRecording || metering === undefined || metering < -60) return isRecording ? 0.18 : 0;
    return Math.max(0.14, Math.min(1, (metering + 55) / 50));
  }, [isRecording, metering]);

  const bars = useMemo(() => {
    const min = 4;
    const max = height * 0.92;
    const mid = (NUM_BARS - 1) / 2;
    // A changing seed so neighbouring bars move independently as the level updates.
    const seed = Math.round((metering ?? 0) * 7);
    return Array.from({ length: NUM_BARS }).map((_, i) => {
      const distance = Math.abs(i - mid) / mid; // 0 at centre, 1 at edges
      const envelope = Math.cos(distance * Math.PI * 0.5) ** 1.4;
      if (!isRecording) return { h: min + envelope * 6, o: 0.22 + envelope * 0.18 };
      const jitter = 0.55 + (((i * 73 + seed * 31) % 97) / 97) * 0.45;
      const h = Math.min(max, Math.max(min, min + power * max * envelope * jitter));
      return { h, o: 0.45 + envelope * 0.55 };
    });
  }, [isRecording, power, metering, height]);

  return (
    <View style={[styles.container, { height }]}>
      {bars.map((b, index) => (
        <View key={index} style={[styles.bar, { height: b.h, opacity: b.o, backgroundColor: color }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%' },
  bar: { width: 4, borderRadius: 2 },
});
