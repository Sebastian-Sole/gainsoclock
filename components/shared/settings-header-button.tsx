import React from 'react';
import { Pressable } from 'react-native';
import { Settings } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { useRouter } from 'expo-router';

export function SettingsHeaderButton() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push('/settings')} className="p-2">
      <Icon as={Settings} size={22} className="text-foreground" />
    </Pressable>
  );
}
