import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { useEffect } from 'react';
import { Pressable, View, StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { DS } from '@/constants/design';

export default function AppTabs() {
  return (
    <Tabs style={styles.tabsRoot}>
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="🏠" label="Home" />
          </TabTrigger>
          <TabTrigger name="scan" href="/scan" asChild>
            <TabButton icon="📷" label="Scan" />
          </TabTrigger>
          <TabTrigger name="notes" href="/notes" asChild>
            <TabButton icon="✏️" label="Notes" />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton icon="👤" label="Profile" />
          </TabTrigger>
        </CustomTabList>
      </TabList>
      <TabSlot style={styles.tabSlot} />
    </Tabs>
  );
}

export function TabButton({ children, isFocused, icon, label, ...props }: TabTriggerSlotProps & { icon?: string; label?: string }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(isFocused ? 1.1 : 1, { damping: 14, stiffness: 200 });
  }, [isFocused, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable {...props} style={({ pressed }) => [styles.tabButtonPressable, pressed && styles.pressed]}>
      <Animated.View style={[styles.tabButtonInner, isFocused && styles.tabButtonActive, animStyle]}>
        <Text style={styles.tabIcon}>{icon}</Text>
        <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  return (
    <View
      {...props}
      style={[
        styles.tabListContainer,
        { backgroundColor: 'rgba(255,255,255,0.88)', borderBottomColor: DS.colors.border },
      ]}
    >
      <View style={styles.innerContainer}>
        <View style={styles.brandRow}>
          <Text style={styles.brandText}>🎙️ VoicePad</Text>
        </View>
        <View style={styles.tabButtonsRow}>
          {props.children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabsRoot: {
    flex: 1,
    height: '100%',
  },
  tabListContainer: {
    width: '100%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    borderBottomWidth: 1,
    zIndex: 100,
  },
  innerContainer: {
    paddingVertical: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: DS.colors.ink,
  },
  tabButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabButtonPressable: {
    borderRadius: DS.radius.sm,
  },
  tabButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: DS.radius.sm,
  },
  tabButtonActive: {
    backgroundColor: DS.colors.primaryLight,
  },
  tabIcon: {
    fontSize: 16,
  },
  tabLabel: {
    fontSize: DS.font.xs,
    fontWeight: '600',
    color: DS.colors.muted,
  },
  tabLabelActive: {
    color: DS.colors.primary,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.75,
  },
  tabSlot: {
    flex: 1,
    height: '100%',
  },
});
