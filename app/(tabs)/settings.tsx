import React from 'react';
import { View, ScrollView, Pressable, Alert, Platform } from 'react-native';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Weight, Ruler, Timer, Vibrate, LogOut, Heart, Download, ChevronRight } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'expo-router';

import { useSettingsStore } from '@/stores/settings-store';
import { useHealthKit } from '@/hooks/use-healthkit';
import { REST_TIME_PRESETS } from '@/lib/constants';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function SettingsScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? '#fb923c' : '#f97316';
  const router = useRouter();
  const { signOut } = useAuthActions();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const defaultRestTime = useSettingsStore((s) => s.defaultRestTime);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setWeightUnit = useSettingsStore((s) => s.setWeightUnit);
  const setDistanceUnit = useSettingsStore((s) => s.setDistanceUnit);
  const setDefaultRestTime = useSettingsStore((s) => s.setDefaultRestTime);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const { isAvailable: healthKitAvailable, isEnabled: healthKitEnabled, isRequesting: healthKitRequesting, enable: enableHealthKit, disable: disableHealthKit } = useHealthKit();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold">Settings</Text>
      </View>

      <ScrollView className="flex-1 px-4">
        {/* Units Section */}
        <Text className="mb-3 mt-4 text-sm font-medium text-muted-foreground">UNITS</Text>
        <View className="rounded-xl bg-card">
          {/* Weight Unit */}
          <View className="flex-row items-center gap-3 px-4 py-4">
            <Weight size={20} color={iconColor} />
            <View className="flex-1">
              <Text className="font-medium">Weight</Text>
            </View>
            <View className="flex-row rounded-lg bg-secondary">
              <Pressable
                onPress={() => setWeightUnit('kg')}
                className={cn(
                  'rounded-lg px-4 py-2',
                  weightUnit === 'kg' && 'bg-primary'
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    weightUnit === 'kg' ? 'text-primary-foreground' : 'text-secondary-foreground'
                  )}
                >
                  kg
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setWeightUnit('lbs')}
                className={cn(
                  'rounded-lg px-4 py-2',
                  weightUnit === 'lbs' && 'bg-primary'
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    weightUnit === 'lbs' ? 'text-primary-foreground' : 'text-secondary-foreground'
                  )}
                >
                  lbs
                </Text>
              </Pressable>
            </View>
          </View>

          <Separator />

          {/* Distance Unit */}
          <View className="flex-row items-center gap-3 px-4 py-4">
            <Ruler size={20} color={iconColor} />
            <View className="flex-1">
              <Text className="font-medium">Distance</Text>
            </View>
            <View className="flex-row rounded-lg bg-secondary">
              <Pressable
                onPress={() => setDistanceUnit('km')}
                className={cn(
                  'rounded-lg px-4 py-2',
                  distanceUnit === 'km' && 'bg-primary'
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    distanceUnit === 'km' ? 'text-primary-foreground' : 'text-secondary-foreground'
                  )}
                >
                  km
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDistanceUnit('mi')}
                className={cn(
                  'rounded-lg px-4 py-2',
                  distanceUnit === 'mi' && 'bg-primary'
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    distanceUnit === 'mi' ? 'text-primary-foreground' : 'text-secondary-foreground'
                  )}
                >
                  mi
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Rest Timer Section */}
        <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">DEFAULT REST TIMER</Text>
        <View className="rounded-xl bg-card px-4 py-4">
          <View className="flex-row items-center gap-3">
            <Timer size={20} color={iconColor} />
            <Text className="flex-1 font-medium">Rest Time</Text>
          </View>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {REST_TIME_PRESETS.map((seconds) => (
              <Pressable
                key={seconds}
                onPress={() => setDefaultRestTime(seconds)}
                className={cn(
                  'rounded-lg px-4 py-2',
                  defaultRestTime === seconds
                    ? 'bg-primary'
                    : 'border border-border'
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    defaultRestTime === seconds ? 'text-primary-foreground' : 'text-foreground'
                  )}
                >
                  {formatTime(seconds)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Preferences Section */}
        <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">PREFERENCES</Text>
        <View className="rounded-xl bg-card">
          <View className="flex-row items-center gap-3 px-4 py-4">
            <Vibrate size={20} color={iconColor} />
            <View className="flex-1">
              <Text className="font-medium">Haptic Feedback</Text>
              <Text className="text-sm text-muted-foreground">Vibrations on interactions</Text>
            </View>
            <Switch
              checked={hapticsEnabled}
              onCheckedChange={setHapticsEnabled}
            />
          </View>
        </View>

        {/* Apple Health Section - iOS only */}
        {Platform.OS === 'ios' && healthKitAvailable && (
          <>
            <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">APPLE HEALTH</Text>
            <View className="rounded-xl bg-card">
              <View className="flex-row items-center gap-3 px-4 py-4">
                <Heart size={20} color={iconColor} />
                <View className="flex-1">
                  <Text className="font-medium">Sync with Apple Health</Text>
                  <Text className="text-sm text-muted-foreground">
                    {healthKitEnabled
                      ? 'Workouts are synced to Health'
                      : 'Save completed workouts to Apple Health'}
                  </Text>
                </View>
                <Switch
                  checked={healthKitEnabled}
                  onCheckedChange={async (checked) => {
                    if (checked) {
                      await enableHealthKit();
                    } else {
                      disableHealthKit();
                    }
                  }}
                  disabled={healthKitRequesting}
                />
              </View>
            </View>
          </>
        )}

        {/* Data Section */}
        <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">DATA</Text>
        <View className="rounded-xl bg-card">
          <Pressable
            onPress={() => router.push('/import')}
            className="flex-row items-center gap-3 px-4 py-4"
          >
            <Download size={20} color={iconColor} />
            <View className="flex-1">
              <Text className="font-medium">Import Data</Text>
              <Text className="text-sm text-muted-foreground">Import workouts from other apps</Text>
            </View>
            <ChevronRight size={20} className="text-muted-foreground" />
          </Pressable>
        </View>

        {/* Account Section */}
        <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">ACCOUNT</Text>
        <View className="rounded-xl bg-card">
          <Pressable
            onPress={handleSignOut}
            className="flex-row items-center gap-3 px-4 py-4"
          >
            <LogOut size={20} color="#ef4444" />
            <Text className="flex-1 font-medium text-destructive">Sign Out</Text>
          </Pressable>
        </View>

        {/* App info */}
        <View className="mt-8 items-center pb-8">
          <Text className="text-sm text-muted-foreground">Gainsoclock v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
