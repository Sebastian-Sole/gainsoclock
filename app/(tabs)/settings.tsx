import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import {
  ChevronRight,
  Crown,
  Download,
  Heart,
  LogOut,
  RotateCcw,
  Ruler,
  Timer,
  Trash2,
  Vibrate,
  Weight,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import React, { useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useHealthKit } from "@/hooks/use-healthkit";
import { REST_TIME_PRESETS } from "@/lib/constants";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useExerciseLibraryStore } from "@/stores/exercise-library-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useTemplateStore } from "@/stores/template-store";
import { useSubscriptionStore } from "@/stores/subscription-store";
import { usePurchases } from "@/hooks/use-purchases";

export default function SettingsScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const iconColor = isDark ? "#fb923c" : "#f97316";
  const router = useRouter();
  const { signOut } = useAuthActions();

  const deleteAllData = useMutation(api.user.deleteAllData);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");

  const handleResetData = async () => {
    setResetModalVisible(false);
    setResetConfirmText("");

    // Clear local stores
    useHistoryStore.setState({ logs: [] });
    useTemplateStore.setState({ templates: [] });
    useExerciseLibraryStore.setState({ exercises: [] });

    // Clear server data
    try {
      await deleteAllData();
    } catch {
      // Server cleanup is best-effort
    }

    Alert.alert("Data Reset", "All your data has been deleted.");
  };

  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const defaultRestTime = useSettingsStore((s) => s.defaultRestTime);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setWeightUnit = useSettingsStore((s) => s.setWeightUnit);
  const setDistanceUnit = useSettingsStore((s) => s.setDistanceUnit);
  const setDefaultRestTime = useSettingsStore((s) => s.setDefaultRestTime);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const {
    isAvailable: healthKitAvailable,
    isEnabled: healthKitEnabled,
    isRequesting: healthKitRequesting,
    enable: enableHealthKit,
    disable: disableHealthKit,
  } = useHealthKit();

  const isPro = useSubscriptionStore((s) => s.isPro);
  const expiresAt = useSubscriptionStore((s) => s.expiresAt);
  const resetSubscription = useSubscriptionStore((s) => s.reset);
  const {
    restore,
    presentPaywall,
    presentCustomerCenter,
    isLoading: isRestoring,
  } = usePurchases();

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          resetSubscription();
          void signOut();
        },
      },
    ]);
  };

  const handleUpgradeToPro = async () => {
    const result = await presentPaywall();

    if (result === "purchased") {
      router.push("/purchase-success");
      return;
    }

    if (result === "error") {
      Alert.alert(
        "Purchase Error",
        "Something went wrong while opening purchases. Please try again."
      );
    }
  };

  const handleManageSubscription = async () => {
    const result = await presentCustomerCenter();

    if (result === "unavailable" || result === "error") {
      const manualPath =
        Platform.OS === "ios"
          ? "iOS Settings > Apple ID > Subscriptions."
          : "Google Play > Payments & subscriptions > Subscriptions.";
      Alert.alert(
        "Manage Subscription",
        `We couldn't open subscription management. You can also manage from ${manualPath}`
      );
    }
  };

  const handleRestore = async () => {
    const restored = await restore();
    if (restored) {
      Alert.alert("Restored", "Your Pro subscription has been restored!");
    } else {
      Alert.alert(
        "No Subscription Found",
        "We couldn't find an active subscription for your account."
      );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold">Settings</Text>
      </View>

      <ScrollView className="flex-1 px-4">
        {/* Units Section */}
        <Text className="mb-3 mt-4 text-sm font-medium text-muted-foreground">
          UNITS
        </Text>
        <View className="rounded-xl bg-card">
          {/* Weight Unit */}
          <View className="flex-row items-center gap-3 px-4 py-4">
            <Weight size={20} color={iconColor} />
            <View className="flex-1">
              <Text className="font-medium">Weight</Text>
            </View>
            <View className="flex-row rounded-lg bg-secondary">
              <Pressable
                onPress={() => setWeightUnit("kg")}
                className={cn(
                  "rounded-lg px-4 py-2",
                  weightUnit === "kg" && "bg-primary",
                )}
              >
                <Text
                  className={cn(
                    "text-sm font-medium",
                    weightUnit === "kg"
                      ? "text-primary-foreground"
                      : "text-secondary-foreground",
                  )}
                >
                  kg
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setWeightUnit("lbs")}
                className={cn(
                  "rounded-lg px-4 py-2",
                  weightUnit === "lbs" && "bg-primary",
                )}
              >
                <Text
                  className={cn(
                    "text-sm font-medium",
                    weightUnit === "lbs"
                      ? "text-primary-foreground"
                      : "text-secondary-foreground",
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
                onPress={() => setDistanceUnit("km")}
                className={cn(
                  "rounded-lg px-4 py-2",
                  distanceUnit === "km" && "bg-primary",
                )}
              >
                <Text
                  className={cn(
                    "text-sm font-medium",
                    distanceUnit === "km"
                      ? "text-primary-foreground"
                      : "text-secondary-foreground",
                  )}
                >
                  km
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDistanceUnit("mi")}
                className={cn(
                  "rounded-lg px-4 py-2",
                  distanceUnit === "mi" && "bg-primary",
                )}
              >
                <Text
                  className={cn(
                    "text-sm font-medium",
                    distanceUnit === "mi"
                      ? "text-primary-foreground"
                      : "text-secondary-foreground",
                  )}
                >
                  mi
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Rest Timer Section */}
        <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
          DEFAULT REST TIMER
        </Text>
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
                  "rounded-lg px-4 py-2",
                  defaultRestTime === seconds
                    ? "bg-primary"
                    : "border border-border",
                )}
              >
                <Text
                  className={cn(
                    "text-sm font-medium",
                    defaultRestTime === seconds
                      ? "text-primary-foreground"
                      : "text-foreground",
                  )}
                >
                  {formatTime(seconds)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Preferences Section */}
        <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
          PREFERENCES
        </Text>
        <View className="rounded-xl bg-card">
          <View className="flex-row items-center gap-3 px-4 py-4">
            <Vibrate size={20} color={iconColor} />
            <View className="flex-1">
              <Text className="font-medium">Haptic Feedback</Text>
              <Text className="text-sm text-muted-foreground">
                Vibrations on interactions
              </Text>
            </View>
            <Switch
              checked={hapticsEnabled}
              onCheckedChange={setHapticsEnabled}
            />
          </View>
        </View>

        {/* Subscription Section */}
        <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
          SUBSCRIPTION
        </Text>
        <View className="rounded-xl bg-card">
          {isPro ? (
            <Pressable
              onPress={handleManageSubscription}
              className="flex-row items-center gap-3 px-4 py-4"
            >
              <Crown size={20} color={iconColor} />
              <View className="flex-1">
                <Text className="font-medium">Manage Subscription</Text>
                <Text className="text-sm text-muted-foreground">
                  {expiresAt
                    ? `Renews ${new Date(expiresAt).toLocaleDateString()} • Change or cancel`
                    : "Change or cancel your plan"}
                </Text>
              </View>
              <ChevronRight size={20} className="text-muted-foreground" />
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={handleUpgradeToPro}
                className="flex-row items-center gap-3 px-4 py-4"
              >
                <Crown size={20} color={iconColor} />
                <View className="flex-1">
                  <Text className="font-medium">Upgrade to Pro</Text>
                  <Text className="text-sm text-muted-foreground">
                    Unlock AI Coach and more
                  </Text>
                </View>
                <ChevronRight size={20} className="text-muted-foreground" />
              </Pressable>
              <Separator />
              <Pressable
                onPress={handleRestore}
                disabled={isRestoring}
                className="flex-row items-center gap-3 px-4 py-4"
              >
                <RotateCcw size={20} color={iconColor} />
                <View className="flex-1">
                  <Text className="font-medium">Restore Purchases</Text>
                  <Text className="text-sm text-muted-foreground">
                    Recover a previous subscription
                  </Text>
                </View>
              </Pressable>
            </>
          )}
        </View>

        {/* Apple Health Section - iOS only */}
        {Platform.OS === "ios" && healthKitAvailable && (
          <>
            <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
              APPLE HEALTH
            </Text>
            <View className="rounded-xl bg-card">
              <View className="flex-row items-center gap-3 px-4 py-4">
                <Heart size={20} color={iconColor} />
                <View className="flex-1">
                  <Text className="font-medium">Sync with Apple Health</Text>
                  <Text className="text-sm text-muted-foreground">
                    {healthKitEnabled
                      ? "Workouts are synced to Health"
                      : "Save completed workouts to Apple Health"}
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
        <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
          DATA
        </Text>
        <View className="rounded-xl bg-card">
          <Pressable
            onPress={() => router.push("/import")}
            className="flex-row items-center gap-3 px-4 py-4"
          >
            <Download size={20} color={iconColor} />
            <View className="flex-1">
              <Text className="font-medium">Import Data</Text>
              <Text className="text-sm text-muted-foreground">
                Import workouts from other apps
              </Text>
            </View>
            <ChevronRight size={20} className="text-muted-foreground" />
          </Pressable>
          <Separator />
          <Pressable
            onPress={() => setResetModalVisible(true)}
            className="flex-row items-center gap-3 px-4 py-4"
          >
            <Trash2 size={20} color="#ef4444" />
            <View className="flex-1">
              <Text className="font-medium text-destructive">Reset Data</Text>
              <Text className="text-sm text-muted-foreground">
                Delete all workout data
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Account Section */}
        <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
          ACCOUNT
        </Text>
        <View className="rounded-xl bg-card">
          <Pressable
            onPress={handleSignOut}
            className="flex-row items-center gap-3 px-4 py-4"
          >
            <LogOut size={20} color="#ef4444" />
            <Text className="flex-1 font-medium text-destructive">
              Sign Out
            </Text>
          </Pressable>
        </View>

        {/* App info */}
        <View className="mt-8 items-center pb-8">
          <Text className="text-sm text-muted-foreground">
            Gainsoclock v1.0.0
          </Text>

          <Text className="text-sm text-muted-foreground">
            Powered by{" "}
            <Text
              className="text-sm underline text-blue-500"
              onPress={() => Linking.openURL("https://soleinnovations.com")}
            >
              Sole Innovations
            </Text>
          </Text>
        </View>
      </ScrollView>

      {/* Reset Data Confirmation Modal */}
      <Modal
        visible={resetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setResetModalVisible(false);
          setResetConfirmText("");
        }}
      >
        <Pressable
          onPress={() => {
            setResetModalVisible(false);
            setResetConfirmText("");
          }}
          className="flex-1 items-center justify-center bg-black/50 px-6"
        >
          <Pressable
            onPress={() => {}}
            className="w-full rounded-2xl bg-card p-6"
          >
            <Text className="text-lg font-bold text-destructive">
              Reset Data
            </Text>
            <Text className="mt-3 leading-5 text-muted-foreground">
              This will permanently delete all your workout history, templates,
              and exercises. This action cannot be undone.
            </Text>
            <Text className="mt-4 text-sm font-medium text-foreground">
              Type <Text className="font-bold">delete my data</Text> to confirm
            </Text>
            <TextInput
              value={resetConfirmText}
              onChangeText={setResetConfirmText}
              placeholder="delete my data"
              placeholderTextColor={isDark ? "#555" : "#aaa"}
              autoCapitalize="none"
              autoCorrect={false}
              className="mt-2 rounded-lg border border-border bg-background px-4 py-3 text-foreground"
            />
            <View className="mt-4 flex-row gap-3">
              <Pressable
                onPress={() => {
                  setResetModalVisible(false);
                  setResetConfirmText("");
                }}
                className="flex-1 items-center rounded-lg border border-border py-3"
              >
                <Text className="font-medium text-foreground">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleResetData}
                disabled={
                  resetConfirmText.toLowerCase().trim() !== "delete my data"
                }
                className={cn(
                  "flex-1 items-center rounded-lg py-3",
                  resetConfirmText.toLowerCase().trim() === "delete my data"
                    ? "bg-destructive"
                    : "bg-destructive/30",
                )}
              >
                <Text
                  className={cn(
                    "font-medium",
                    resetConfirmText.toLowerCase().trim() === "delete my data"
                      ? "text-white"
                      : "text-white/50",
                  )}
                >
                  Delete All Data
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
