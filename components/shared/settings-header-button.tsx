import React from 'react';
import { Pressable } from 'react-native';
import { Settings2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';

export function SettingsHeaderButton() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#f2f2f2' : '#1c1008';

  return (
    <Pressable onPress={() => router.push('/settings')} className="p-2">
      <Settings2 size={22} color={iconColor} />
    </Pressable>
  );
}
