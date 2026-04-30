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
import * as WebBrowser from "expo-web-browser";

import { Text } from "@/components/ui/text";
import { AppleSignInButton } from "@/components/auth/apple-sign-in-button";
import { capture } from "@/lib/analytics";
import { SIWA_COLLISION_COPY } from "@/lib/privacy-notice";

const TERMS_URL = "https://www.fitbull.app/terms";
const PRIVACY_URL = "https://www.fitbull.app/privacy";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSignUpErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("AccountAlreadyExists") ||
    message.includes("already exists")
  ) {
    return "An account with this email already exists. Please sign in instead.";
  }
  return "Could not create account. Please try again.";
}

export default function SignUpScreen() {
  const router = useRouter();
  const { signIn } = useAuthActions();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const headingRef = useRef<View | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    capture({ name: "intake_started", props: {} });
  }, []);

  const focusHeading = () => {
    const node = headingRef.current
      ? findNodeHandle(headingRef.current)
      : null;
    if (node != null) {
      AccessibilityInfo.setAccessibilityFocus(node);
    }
  };

  const validate = (): string | null => {
    if (!email.trim()) return "Email is required";
    if (!EMAIL_REGEX.test(email.trim()))
      return "Please enter a valid email address";
    if (!password) return "Password is required";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!confirmPassword) return "Please confirm your password";
    if (password !== confirmPassword) return "Passwords do not match";
    return null;
  };

  const clearError = () => {
    if (error) setError("");
  };

  const handleEmailSignUp = async () => {
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
        flow: "signUp",
      });
      capture({ name: "auth_succeeded", props: { method: "email" } });
      focusHeading();
    } catch (err) {
      setError(getSignUpErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSuccess = async (
    _credential: Parameters<
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
      const identityToken = _credential.identityToken;
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
              Create Account
            </Text>
          </View>
          <Text className="mb-6 text-center text-muted-foreground">
            One account, syncs across iPhone and iPad. We don&apos;t share
            your data with advertisers.
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
              testID="signup-siwa-button"
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
            nativeID="signup-email-label"
            className="mb-2 text-sm font-medium text-muted-foreground"
          >
            EMAIL
          </Text>
          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              clearError();
            }}
            placeholder="you@example.com"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            accessibilityLabelledBy="signup-email-label"
            className="mb-4 min-h-[44px] rounded-xl border border-input bg-card px-4 py-4 text-[16px] text-foreground"
          />

          {/* Password */}
          <Text
            nativeID="signup-password-label"
            className="mb-2 text-sm font-medium text-muted-foreground"
          >
            PASSWORD
          </Text>
          <TextInput
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              clearError();
            }}
            placeholder="At least 8 characters"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            textContentType="newPassword"
            accessibilityLabelledBy="signup-password-label"
            className="mb-4 min-h-[44px] rounded-xl border border-input bg-card px-4 py-4 text-[16px] text-foreground"
          />

          {/* Confirm Password */}
          <Text
            nativeID="signup-confirm-label"
            className="mb-2 text-sm font-medium text-muted-foreground"
          >
            CONFIRM PASSWORD
          </Text>
          <TextInput
            value={confirmPassword}
            onChangeText={(t) => {
              setConfirmPassword(t);
              clearError();
            }}
            placeholder="Repeat your password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            textContentType="newPassword"
            accessibilityLabelledBy="signup-confirm-label"
            className="mb-4 min-h-[44px] rounded-xl border border-input bg-card px-4 py-4 text-[16px] text-foreground"
          />

          {/* Submit */}
          <Pressable
            onPress={handleEmailSignUp}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Create account with email"
            accessibilityState={{ disabled: isLoading }}
            className="mb-4 min-h-[44px] items-center justify-center rounded-xl bg-primary py-4 active:bg-primary/90"
            style={
              isLoading ? { opacity: 0.5 } : undefined
            }
            testID="signup-submit"
          >
            {isLoading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text
                className="text-base font-semibold"
                style={{ color: "#fff" }}
              >
                Create Account
              </Text>
            )}
          </Pressable>

          {/* Legal acceptance line — basis for account creation. Toggleable
              consents (analytics, AI, health) live in Settings → Privacy. */}
          <View className="mb-6 flex-row flex-wrap items-center justify-center gap-x-1 px-4">
            <Text className="text-center text-xs text-muted-foreground">
              By continuing, you agree to our{" "}
            </Text>
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}
              accessibilityRole="link"
              accessibilityLabel={TERMS_URL}
              hitSlop={8}
            >
              <Text className="text-xs font-medium text-foreground underline">
                Terms
              </Text>
            </Pressable>
            <Text className="text-xs text-muted-foreground">
              , which describe how we use OpenAI to power the AI coach, and our{" "}
            </Text>
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
              accessibilityRole="link"
              accessibilityLabel={PRIVACY_URL}
              hitSlop={8}
            >
              <Text className="text-xs font-medium text-foreground underline">
                Privacy Policy
              </Text>
            </Pressable>
            <Text className="text-xs text-muted-foreground">.</Text>
          </View>

          {/* Sign-in link */}
          <Pressable
            onPress={() => router.push("/(auth)/sign-in" as never)}
            accessibilityRole="link"
            accessibilityLabel="Already have an account? Sign in"
            hitSlop={8}
            className="mb-3 min-h-[44px] items-center justify-center"
          >
            <Text className="text-sm">
              <Text className="text-muted-foreground">
                Already have an account?{" "}
              </Text>
              <Text className="font-semibold text-primary">Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
