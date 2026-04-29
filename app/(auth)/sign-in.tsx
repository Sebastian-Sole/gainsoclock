import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";

import { Text } from "@/components/ui/text";
import { AppleSignInButton } from "@/components/auth/apple-sign-in-button";
import { AbandonmentRecoveryInterstitial } from "@/components/auth/abandonment-recovery-interstitial";
import { capture } from "@/lib/analytics";
import { SIWA_COLLISION_COPY } from "@/lib/privacy-notice";
import { api } from "@/convex/_generated/api";
import { useOnboardingStatus } from "@/hooks/use-onboarding-status";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSignInErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("InvalidAccountId") ||
    message.includes("Could not find")
  ) {
    return "No account found with this email. Please sign up first.";
  }
  if (message.includes("InvalidSecret") || message.includes("incorrect")) {
    return "Incorrect password. Please try again.";
  }
  if (message.includes("TooManyFailedAttempts")) {
    return "Too many failed attempts. Please try again later.";
  }
  return "Could not sign in. Please check your credentials and try again.";
}

export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const userIdResult = useQuery(api.user.me);
  const onboarding = useOnboardingStatus();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const headingRef = useRef<View | null>(null);

  const focusHeading = () => {
    const node = headingRef.current
      ? findNodeHandle(headingRef.current)
      : null;
    if (node != null) {
      AccessibilityInfo.setAccessibilityFocus(node);
    }
  };

  useEffect(() => {
    if (isAuthenticated && onboarding.status === "pending") {
      // Returning user, not yet finished intake — fire the resume signal so
      // analytics can reason about re-entry rates even if the interstitial
      // gets dismissed without action.
      capture({ name: "intake_started", props: {} });
    }
  }, [isAuthenticated, onboarding.status]);

  const validate = (): string | null => {
    if (!email.trim()) return "Email is required";
    if (!EMAIL_REGEX.test(email.trim()))
      return "Please enter a valid email address";
    if (!password) return "Password is required";
    if (password.length < 8) return "Password must be at least 8 characters";
    return null;
  };

  const handleSignIn = async () => {
    Keyboard.dismiss();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    capture({
      name: "auth_method_selected",
      props: { method: "email" },
    });
    setError("");
    setIsLoading(true);
    try {
      await signIn("password", {
        email: email.trim(),
        password,
        flow: "signIn",
      });
      capture({ name: "auth_succeeded", props: { method: "email" } });
      focusHeading();
    } catch (err) {
      setError(getSignInErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSuccess = async (
    credential: Parameters<
      React.ComponentProps<typeof AppleSignInButton>["onSuccess"]
    >[0]
  ) => {
    capture({
      name: "auth_method_selected",
      props: { method: "apple" },
    });
    setError("");
    setIsLoading(true);
    try {
      const identityToken = credential.identityToken;
      if (!identityToken) {
        throw new Error("Apple sign-in did not return an identity token");
      }
      await signIn("apple", { id_token: identityToken });
      capture({ name: "auth_succeeded", props: { method: "apple" } });
      focusHeading();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err ?? "");
      if (message.includes("siwa_email_collision")) {
        setError(SIWA_COLLISION_COPY);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Could not sign in with Apple. Please try again."
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleError = (err: unknown) => {
    setError(
      err instanceof Error
        ? err.message
        : "Could not sign in with Apple. Please try again."
    );
  };

  const handleAppleCollision = () => {
    setError(SIWA_COLLISION_COPY);
  };

  const currentUserId =
    typeof userIdResult === "string" ? userIdResult : null;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingVertical: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            ref={headingRef}
            accessible
            accessibilityRole="header"
          >
            <Text className="mb-2 text-center text-3xl font-bold">
              Welcome back
            </Text>
          </View>
          <Text className="mb-8 text-center text-muted-foreground">
            Sign in to sync your workouts
          </Text>

          {error !== "" && (
            <View className="mb-4 rounded-xl bg-destructive/10 px-4 py-3">
              <Text className="text-sm text-destructive">{error}</Text>
            </View>
          )}

          {/* SIWA primary */}
          <View className="mb-4">
            <AppleSignInButton
              onSuccess={handleAppleSuccess}
              onError={handleAppleError}
              onCollision={handleAppleCollision}
              disabled={isLoading}
              testID="signin-siwa-button"
            />
          </View>

          {Platform.OS === "ios" && (
            <View className="my-4 flex-row items-center gap-4">
              <View className="h-px flex-1 bg-border" />
              <Text className="text-sm text-muted-foreground">or</Text>
              <View className="h-px flex-1 bg-border" />
            </View>
          )}

          {/* Email */}
          <Text
            nativeID="signin-email-label"
            className="mb-2 text-sm font-medium text-muted-foreground"
          >
            EMAIL
          </Text>
          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (error) setError("");
            }}
            placeholder="you@example.com"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            accessibilityLabelledBy="signin-email-label"
            className="mb-4 min-h-[44px] rounded-xl border border-input bg-card px-4 py-4 text-[16px] text-foreground"
          />

          {/* Password */}
          <Text
            nativeID="signin-password-label"
            className="mb-2 text-sm font-medium text-muted-foreground"
          >
            PASSWORD
          </Text>
          <TextInput
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (error) setError("");
            }}
            placeholder="Your password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            textContentType="password"
            accessibilityLabelledBy="signin-password-label"
            className="mb-6 min-h-[44px] rounded-xl border border-input bg-card px-4 py-4 text-[16px] text-foreground"
          />

          {/* Submit */}
          <Pressable
            onPress={handleSignIn}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Sign in with email"
            accessibilityState={{ disabled: isLoading }}
            className="mb-6 min-h-[44px] items-center justify-center rounded-xl bg-primary py-4 active:bg-primary/90"
            style={isLoading ? { opacity: 0.5 } : undefined}
            testID="signin-submit"
          >
            {isLoading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text
                className="text-base font-semibold"
                style={{ color: "#fff" }}
              >
                Sign in
              </Text>
            )}
          </Pressable>

          {/* Sign-up link */}
          <Pressable
            onPress={() => router.push("/(auth)/sign-up" as never)}
            accessibilityRole="link"
            accessibilityLabel="Create account"
            hitSlop={8}
            className="min-h-[44px] items-center justify-center"
          >
            <Text className="text-sm">
              <Text className="text-muted-foreground">
                Don&apos;t have an account?{" "}
              </Text>
              <Text className="font-semibold text-primary">
                Create account
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <AbandonmentRecoveryInterstitial
        userId={currentUserId}
        hasCompletedOnboarding={onboarding.status === "complete"}
      />
    </SafeAreaView>
  );
}
