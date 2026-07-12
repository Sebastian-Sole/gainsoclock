import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

// Mirrors the sign-up rule and the Password provider default (>= 8 chars).
const MIN_PASSWORD_LENGTH = 8;

const PROVIDER_LABELS: Record<string, string> = {
  password: "Email & password",
  google: "Google",
  "apple-native": "Apple",
};

type SaveState = "idle" | "saving" | "saved";

/**
 * Settings → Account: change display name and (for password accounts)
 * password.
 *
 * Email change is intentionally absent: @convex-dev/auth keys the password
 * account by the email and has no supported re-key API, and a safe change
 * needs verify-before-activate infrastructure we don't have. Full rationale
 * lives next to the backend functions in `convex/user.ts`.
 */
export default function AccountScreen() {
  const router = useRouter();
  const info = useQuery(api.user.getAccountInfo);
  const updateName = useMutation(api.user.updateName);
  const changePassword = useAction(api.user.changePassword);

  // Name — draft is null until the user edits, so the query stays the source
  // of truth for the initial value without effect-based syncing.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameState, setNameState] = useState<SaveState>("idle");
  const [nameError, setNameError] = useState<string | null>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordState, setPasswordState] = useState<SaveState>("idle");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const serverName = info?.name ?? "";
  const name = nameDraft ?? serverName;
  const nameDirty = name.trim().length > 0 && name.trim() !== serverName;

  const handleSaveName = async () => {
    setNameState("saving");
    setNameError(null);
    try {
      const result = await updateName({ name: name.trim() });
      if (result === "invalid_name") {
        setNameError("Enter a name of at most 80 characters.");
        setNameState("idle");
        return;
      }
      setNameDraft(null);
      setNameState("saved");
    } catch {
      setNameError("Couldn't save your name. Try again in a moment.");
      setNameState("idle");
    }
  };

  const passwordFormValid =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0;

  const handleChangePassword = async () => {
    setPasswordError(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(
        `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    setPasswordState("saving");
    try {
      const result = await changePassword({ currentPassword, newPassword });
      switch (result) {
        case "ok":
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setPasswordState("saved");
          return;
        case "wrong_password":
          setPasswordError("Current password is incorrect.");
          break;
        case "too_many_attempts":
          setPasswordError("Too many attempts. Try again in a few minutes.");
          break;
        case "invalid_new_password":
          setPasswordError(
            `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`
          );
          break;
        case "no_password_account":
          setPasswordError(
            "This account doesn't sign in with a password."
          );
          break;
      }
      setPasswordState("idle");
    } catch {
      setPasswordError("Couldn't change your password. Try again in a moment.");
      setPasswordState("idle");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="p-1"
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Icon as={ChevronLeft} size={24} className="text-foreground" />
        </Pressable>
        <Text className="text-3xl font-bold">Account</Text>
      </View>

      {info === undefined ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : info === null ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-muted-foreground">
            You need to be signed in to manage your account.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4"
          contentContainerClassName="pb-10"
          keyboardShouldPersistTaps="handled"
        >
          {/* Display name */}
          <Text className="mb-3 mt-4 text-sm font-medium text-muted-foreground">
            PROFILE
          </Text>
          <View className="rounded-xl bg-card px-4 py-4">
            <Text
              nativeID="account-name-label"
              className="mb-2 text-sm font-medium text-muted-foreground"
            >
              Display name
            </Text>
            <Input
              value={name}
              onChangeText={(t) => {
                setNameDraft(t);
                setNameState("idle");
                setNameError(null);
              }}
              placeholder="Your name"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={80}
              textContentType="name"
              accessibilityLabel="Display name"
              accessibilityLabelledBy="account-name-label"
              testID="account-name-input"
            />
            {nameError ? (
              <Text className="mt-2 text-sm text-destructive">{nameError}</Text>
            ) : nameState === "saved" ? (
              <Text className="mt-2 text-sm text-muted-foreground">
                Name saved.
              </Text>
            ) : null}
            <Pressable
              onPress={() => {
                void handleSaveName();
              }}
              disabled={!nameDirty || nameState === "saving"}
              accessibilityRole="button"
              accessibilityLabel="Save display name"
              accessibilityState={{
                disabled: !nameDirty || nameState === "saving",
                busy: nameState === "saving",
              }}
              testID="account-save-name"
              className={cn(
                "mt-4 min-h-[44px] items-center justify-center rounded-xl py-3",
                nameDirty && nameState !== "saving"
                  ? "bg-primary"
                  : "bg-primary/40"
              )}
            >
              {nameState === "saving" ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="font-medium text-primary-foreground">
                  Save name
                </Text>
              )}
            </Pressable>
          </View>

          {/* Sign-in overview */}
          <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
            SIGN-IN
          </Text>
          <View className="rounded-xl bg-card">
            {/* Hide-My-Email relay addresses are Apple-internal — never
                surface or offer to change them. */}
            {info.email && !info.isAppleRelay ? (
              <>
                <View className="px-4 py-4">
                  <Text className="text-sm font-medium text-muted-foreground">
                    Email
                  </Text>
                  <Text className="mt-1 text-foreground">{info.email}</Text>
                  <Text className="mt-1 text-xs text-muted-foreground">
                    Email can&apos;t be changed in the app yet. Contact
                    support@fitbull.app if you need to move your account.
                  </Text>
                </View>
                <Separator />
              </>
            ) : null}
            <View className="px-4 py-4">
              <Text className="text-sm font-medium text-muted-foreground">
                Sign-in methods
              </Text>
              <Text className="mt-1 text-foreground">
                {info.providers.length > 0
                  ? info.providers
                      .map((p) => PROVIDER_LABELS[p] ?? p)
                      .join(", ")
                  : "None"}
              </Text>
            </View>
          </View>

          {/* Password — only for accounts that actually have one */}
          {info.hasPassword ? (
            <>
              <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
                CHANGE PASSWORD
              </Text>
              <View className="rounded-xl bg-card px-4 py-4">
                <Text
                  nativeID="account-current-password-label"
                  className="mb-2 text-sm font-medium text-muted-foreground"
                >
                  Current password
                </Text>
                <Input
                  value={currentPassword}
                  onChangeText={(t) => {
                    setCurrentPassword(t);
                    setPasswordState("idle");
                    setPasswordError(null);
                  }}
                  placeholder="Your current password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  accessibilityLabel="Current password"
                  accessibilityLabelledBy="account-current-password-label"
                  testID="account-current-password-input"
                />

                <Text
                  nativeID="account-new-password-label"
                  className="mb-2 mt-4 text-sm font-medium text-muted-foreground"
                >
                  New password
                </Text>
                <Input
                  value={newPassword}
                  onChangeText={(t) => {
                    setNewPassword(t);
                    setPasswordState("idle");
                    setPasswordError(null);
                  }}
                  placeholder="At least 8 characters"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  accessibilityLabel="New password"
                  accessibilityLabelledBy="account-new-password-label"
                  testID="account-new-password-input"
                />

                <Text
                  nativeID="account-confirm-password-label"
                  className="mb-2 mt-4 text-sm font-medium text-muted-foreground"
                >
                  Confirm new password
                </Text>
                <Input
                  value={confirmPassword}
                  onChangeText={(t) => {
                    setConfirmPassword(t);
                    setPasswordState("idle");
                    setPasswordError(null);
                  }}
                  placeholder="Repeat the new password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  accessibilityLabel="Confirm new password"
                  accessibilityLabelledBy="account-confirm-password-label"
                  testID="account-confirm-password-input"
                />

                {passwordError ? (
                  <Text className="mt-3 text-sm text-destructive">
                    {passwordError}
                  </Text>
                ) : passwordState === "saved" ? (
                  <Text className="mt-3 text-sm text-muted-foreground">
                    Password changed. Other devices were signed out.
                  </Text>
                ) : null}

                <Pressable
                  onPress={() => {
                    void handleChangePassword();
                  }}
                  disabled={!passwordFormValid || passwordState === "saving"}
                  accessibilityRole="button"
                  accessibilityLabel="Change password"
                  accessibilityState={{
                    disabled: !passwordFormValid || passwordState === "saving",
                    busy: passwordState === "saving",
                  }}
                  testID="account-change-password"
                  className={cn(
                    "mt-4 min-h-[44px] items-center justify-center rounded-xl py-3",
                    passwordFormValid && passwordState !== "saving"
                      ? "bg-primary"
                      : "bg-primary/40"
                  )}
                >
                  {passwordState === "saving" ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="font-medium text-primary-foreground">
                      Change password
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
