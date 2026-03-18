import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

export default function SettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings');
  }, []);

  return <View className="flex-1 bg-background" />;
}
