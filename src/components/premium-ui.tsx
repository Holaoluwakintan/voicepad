import { PropsWithChildren } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { ThemedText } from './themed-text';
import { DS } from '@/constants/design';

export function PremiumCard({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {action && onPress && (
        <Pressable onPress={onPress} style={styles.sectionAction} accessibilityRole="button">
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
  card: { backgroundColor: DS.colors.surface, borderRadius: DS.radius.lg, borderWidth: 1, borderColor: DS.colors.border, ...DS.shadow.card },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: DS.space.md },
  sectionTitle: { color: DS.colors.ink, fontSize: DS.font.h3, fontWeight: '800', letterSpacing: -0.2 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingLeft: 8 },
  sectionActionText: { color: DS.colors.primary, fontSize: DS.font.xs, fontWeight: '800' },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: DS.radius.full },
  pillText: { fontSize: DS.font.caption, fontWeight: '800', letterSpacing: 0.2 },
});
