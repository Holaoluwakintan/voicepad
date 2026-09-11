import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';

const ACCENT = '#6D5DFB';
const NUM_BARS = 18;

// Harmonic base multipliers to give a pleasant curved frequency-like profile
const HARMONICS = [
  0.35, 0.45, 0.65, 0.85, 1.0, 1.15, 1.3, 1.1, 0.95,
  1.2, 1.35, 1.1, 0.9, 0.75, 0.6, 0.5, 0.4, 0.35,
];

interface AudioWaveformProps {
  isRecording: boolean;
  metering?: number;
  height?: number;
}

export function AudioWaveform({ isRecording, metering, height = 100 }: AudioWaveformProps) {
  // Normalize metering dBFS (-60dB to 0dB) into 0.0 to 1.0
  const normalizedPower = useMemo(() => {
    if (!isRecording || metering === undefined || metering < -60) return 0.08;
    return Math.max(0.12, Math.min(1.0, (metering + 60) / 60));
  }, [isRecording, metering]);

  const barHeights = useMemo(() => {
    const minHeight = 8;
    const maxHeight = height * 0.82;

    return Array.from({ length: NUM_BARS }).map((_, i) => {
      const harmonic = HARMONICS[i % HARMONICS.length];
      if (!isRecording) {
        return minHeight + harmonic * 4;
      }
      // Combine live mic power with frequency harmonic curve
      const dynamic = minHeight + normalizedPower * maxHeight * harmonic * 0.75;
      return Math.min(maxHeight, Math.max(minHeight, dynamic));
    });
  }, [isRecording, normalizedPower, height]);

  return (
    <View style={[styles.container, { height }]}>
      {barHeights.map((h, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            {
              height: h,
              opacity: isRecording ? 0.75 + (h / height) * 0.25 : 0.35,
              backgroundColor: isRecording ? ACCENT : '#625F75',
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
  },
  bar: {
    width: 6,
    borderRadius: 4,
    transitionProperty: 'height',
  },
});
