import { PropsWithChildren, ReactNode, memo } from 'react';
import { Pressable, PressableProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ChevronRight } from 'lucide-react-native';
import { ThemedText } from './themed-text';
import { DS, displayType } from '@/constants/design';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable that gently scales down while pressed. Runs on the UI thread
 * (Reanimated), so it stays smooth on low-end Android.
 */
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  ...rest
}: PropsWithChildren<PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number }>) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        scale.set(withTiming(scaleTo, { duration: 90 }));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { damping: 14, stiffness: 260 }));
        rest.onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Midnight surface lit by a soft aurora (two radial glows over a deep
 * gradient). Pure SVG — no images, no blur — so it's cheap to draw.
 */
export const AuroraBackdrop = memo(function AuroraBackdrop({
  intensity = 1,
  variant = 'violet',
}: { intensity?: number; variant?: 'violet' | 'coral' | 'teal' }) {
  const a = variant === 'coral' ? DS.colors.aurora2 : variant === 'teal' ? DS.colors.aurora3 : DS.colors.aurora1;
  const b = variant === 'coral' ? DS.colors.aurora1 : DS.colors.aurora2;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="base" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#151827" />
            <Stop offset="1" stopColor={DS.colors.night} />
          </LinearGradient>
          <RadialGradient id="glowA" cx="85%" cy="0%" rx="70%" ry="80%">
            <Stop offset="0" stopColor={a} stopOpacity={0.55 * intensity} />
            <Stop offset="1" stopColor={a} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowB" cx="0%" cy="100%" rx="65%" ry="70%">
            <Stop offset="0" stopColor={b} stopOpacity={0.32 * intensity} />
            <Stop offset="1" stopColor={b} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#base)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowA)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowB)" />
      </Svg>
    </View>
  );
});

export function PremiumCard({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Large editorial screen title with an optional eyebrow and right-side slot. */
export function ScreenTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <View style={styles.screenTitleRow}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <ThemedText style={styles.eyebrow}>{eyebrow}</ThemedText> : null}
        <ThemedText style={styles.screenTitle}>{title}</ThemedText>
      </View>
      {right}
    </View>
  );
}

export function SectionHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {action && onPress && (
        <Pressable onPress={onPress} style={styles.sectionAction} accessibilityRole="button" hitSlop={8}>
          <ThemedText style={styles.sectionActionText}>{action}</ThemedText>
          <ChevronRight size={15} color={DS.colors.primary} strokeWidth={2.5} />
        </Pressable>
      )}
    </View>
  );
}

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const palette = {
    neutral: { bg: DS.colors.surfaceSoft, fg: DS.colors.muted },
    success: { bg: DS.colors.successLight, fg: DS.colors.success },
    warning: { bg: DS.colors.warningLight, fg: DS.colors.warning },
    danger: { bg: DS.colors.dangerLight, fg: DS.colors.danger },
  }[tone];
  return <View style={[styles.pill, { backgroundColor: palette.bg }]}><ThemedText style={[styles.pillText, { color: palette.fg }]}>{label}</ThemedText></View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: DS.colors.surface, borderRadius: DS.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: DS.colors.borderStrong, ...DS.shadow.card },
  screenTitleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 18 },
  eyebrow: { color: DS.colors.subtle, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 2 },
  screenTitle: { color: DS.colors.ink, ...displayType(40) },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: DS.space.md },
  sectionTitle: { color: DS.colors.ink, fontSize: 13, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingLeft: 8 },
  sectionActionText: { color: DS.colors.primary, fontSize: DS.font.xs, fontWeight: '700' },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: DS.radius.full },
  pillText: { fontSize: DS.font.caption, fontWeight: '700', letterSpacing: 0.2 },
});
