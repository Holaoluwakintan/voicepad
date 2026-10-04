import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { DS } from '@/constants/design';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={DS.colors.surface}
      indicatorColor={DS.colors.primaryLight}
      labelStyle={{ selected: { color: DS.colors.primary }, default: { color: DS.colors.subtle } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md={{ default: 'home', selected: 'home' }} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan">
        <NativeTabs.Trigger.Label>Scan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'viewfinder', selected: 'viewfinder' }} md={{ default: 'document_scanner', selected: 'document_scanner' }} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notes">
        <NativeTabs.Trigger.Label>Notes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} md={{ default: 'description', selected: 'description' }} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md={{ default: 'person', selected: 'person' }} renderingMode="template" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
