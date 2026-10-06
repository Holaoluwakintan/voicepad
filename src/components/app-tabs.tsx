import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router/js-tabs';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { FileText, House, Mic, ScanLine, UserRound } from 'lucide-react-native';
import { ThemedText } from '@/components/themed-text';
import { DS } from '@/constants/design';

const ICONS = { index: House, notes: FileText, scan: ScanLine, profile: UserRound } as const;
const LABELS = { index: 'Home', notes: 'Notes', scan: 'Scan', profile: 'Profile' } as const;
type TabName = keyof typeof ICONS;

function TabButton({ name, focused, onPress }: { name: TabName; focused: boolean; onPress: () => void }) {
  const Icon = ICONS[name];
  const progress = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(focused ? 1 : 0, { duration: 220 }));
  }, [focused, progress]);
  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: 0.7 + progress.get() * 0.3 }],
  }));
  return (
    <Pressable
      onPress={onPress}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={LABELS[name]}
      hitSlop={6}
    >
      <Animated.View style={[styles.activePill, pillStyle]} />
      <Icon size={21} color={focused ? DS.colors.white : 'rgba(255,255,255,0.52)'} strokeWidth={focused ? 2.3 : 2} />
      <ThemedText style={[styles.label, focused && styles.labelActive]}>{LABELS[name]}</ThemedText>
    </Pressable>
  );
}

function RecordButton() {
  const router = useRouter();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      onPressIn={() => { scale.set(withTiming(0.92, { duration: 90 })); }}
      onPressOut={() => { scale.set(withSpring(1, { damping: 12, stiffness: 240 })); }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        router.push('/note/record');
      }}
      accessibilityRole="button"
      accessibilityLabel="Record a voice note"
      style={styles.recordSlot}
    >
      <Animated.View style={[styles.recordButton, style]}>
        <Mic size={24} color={DS.colors.white} strokeWidth={2.4} />
      </Animated.View>
    </Pressable>
  );
}

function VoicePadTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const routes = state.routes as { key: string; name: TabName }[];
  const go = (route: { key: string; name: TabName }, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      Haptics.selectionAsync().catch(() => {});
      navigation.navigate(route.name);
    }
  };
  const render = (route: { key: string; name: TabName }) => {
    const index = routes.findIndex((r) => r.key === route.key);
    const focused = state.index === index;
    return <TabButton key={route.key} name={route.name} focused={focused} onPress={() => go(route, focused)} />;
  };
  const visible = routes.filter((r) => r.name in ICONS);
  const left = visible.slice(0, 2);
  const right = visible.slice(2);
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        {left.map(render)}
        <RecordButton />
        {right.map(render)}
      </View>
    </View>
  );
}

export default function AppTabs() {
  return (
    <Tabs
      tabBar={(props) => <VoicePadTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: DS.colors.canvas } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="notes" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: DS.colors.canvas, paddingHorizontal: 14, paddingTop: 6 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.colors.night,
    borderRadius: 28,
    height: 64,
    paddingHorizontal: 6,
    ...DS.shadow.floating,
  },
  tab: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', gap: 3 },
  activePill: {
    position: 'absolute',
    width: 54,
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  label: { fontSize: 10.5, lineHeight: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)', letterSpacing: 0.2 },
  labelActive: { color: DS.colors.white },
  recordSlot: { width: 70, alignItems: 'center', justifyContent: 'center' },
  recordButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: DS.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    borderWidth: 4,
    borderColor: DS.colors.canvas,
    ...DS.shadow.record,
  },
});
