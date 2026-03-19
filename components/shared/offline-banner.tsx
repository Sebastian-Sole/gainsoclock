import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { WifiOff } from 'lucide-react-native';
import { useNetwork } from '@/hooks/use-network';

export function OfflineBanner() {
  const { isOffline } = useNetwork();

  if (!isOffline) return null;

  return (
    <View className="flex-row items-center justify-center gap-2 bg-destructive px-4 py-2">
      <WifiOff size={16} color="#fff" />
      <Text className="text-sm font-medium text-white">
        You are offline — AI features require an internet connection
      </Text>
    </View>
  );
}
