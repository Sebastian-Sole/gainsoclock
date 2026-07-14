import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useConvexAuth } from "convex/react";
import * as WebBrowser from "expo-web-browser";

import { api } from "@/convex/_generated/api";
import { Text } from "@/components/ui/text";
import { AppleSignInButton } from "@/components/auth/apple-sign-in-button";
import { LinkAppleSheet } from "@/components/auth/link-apple-sheet";
import { capture } from "@/lib/analytics";
import { SIWA_COLLISION_COPY } from "@/lib/privacy-notice";
import { useOnboardingStatus } from "@/hooks/use-onboarding-status";
import { useColorScheme } from "@/hooks/use-color-scheme";

const TERMS_URL = "https://www.fitbull.app/terms";
const PRIVACY_URL = "https://www.fitbull.app/privacy";

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
  const colorScheme = useColorScheme();
  const { signIn } = useAuthActions();
  const checkAppleSignIn = useAction(api.accountLinking.checkAppleSignIn);
  const { isAuthenticated } = useConvexAuth();
  const onboarding = useOnboardingStatus();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Set when a SIWA attempt collides with an existing password account; drives
  // the password→link sheet. Holds the verified Apple token + colliding email.
  const [linkPrompt, setLinkPrompt] = useState<{
    email: string;
    identityToken: string;
  } | null>(null);

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
      // Pre-flight: decide collision-vs-sign-in WITHOUT throwing, so a
      // collision is normal control flow (no red dev error box, works in prod).
      const status = await checkAppleSignIn({ idToken: identityToken });
      if (status === "needs_link") {
        // Apple omits the email on a returning authorization, so the prefill is
        // best-effort — the link sheet collects the email itself.
        setLinkPrompt({
          email: credential.email ?? email.trim(),
          identityToken,
        });
        return;
      }
      // Apple only sends `fullName` on the FIRST sign-in for a given
      // (Apple ID, app) pair; on subsequent attempts these fields are null.
      // The server-side `apple-native` provider persists the name on the
      // `users` row when present.
      const fullName = credential.fullName
        ? [
            credential.fullName.givenName,
            credential.fullName.familyName,
          ]
            .filter(Boolean)
            .join(" ")
            .trim() || undefined
        : undefined;
      await signIn("apple-native", {
        id_token: identityToken,
        ...(fullName ? { name: fullName } : {}),
      });
      capture({ name: "auth_succeeded", props: { method: "apple" } });
      focusHeading();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err ?? "");
      // Fallback for the rare race where a collision appears between the
      // pre-flight check and signIn (authorize's safety net throws).
      if (message.includes("siwa_email_collision")) {
        const token = credential.identityToken;
        if (token) {
          setLinkPrompt({
            email: credential.email ?? email.trim(),
            identityToken: token,
          });
        } else {
          setError(SIWA_COLLISION_COPY);
        }
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
            testID="signin-email-input"
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
            testID="signin-password-input"
            className="mb-6 min-h-[44px] rounded-xl border border-input bg-card px-4 py-4 text-[16px] text-foreground"
          />

          {/* Submit */}
          <Pressable
            onPress={handleSignIn}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Sign in with email"
            accessibilityState={{ disabled: isLoading }}
            className="mb-4 min-h-[44px] items-center justify-center rounded-xl bg-primary py-4 active:bg-primary/90"
            style={isLoading ? { opacity: 0.5 } : undefined}
            testID="signin-submit"
          >
            {isLoading ? (
              <ActivityIndicator
                color={colorScheme === "dark" ? "#000" : "#fff"}
                size="small"
              />
            ) : (
              <Text className="text-base font-semibold text-primary-foreground">
                Sign in
              </Text>
            )}
          </Pressable>

          {/* Legal acceptance line — basis for account access. Toggleable
              consents (analytics, AI, health) live in Settings → Privacy.
              Single Text container with nested onPress runs so the line wraps
              as natural prose; flex-row siblings would let punctuation orphan
              onto its own line. */}
          <Text className="mb-6 px-4 text-center text-xs text-muted-foreground">
            By continuing, you agree to our{" "}
            <Text
              className="font-medium text-foreground underline"
              onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}
              accessibilityRole="link"
              accessibilityLabel={TERMS_URL}
            >
              Terms
            </Text>
            , which describe how we use OpenAI to power the AI coach, and our{" "}
            <Text
              className="font-medium text-foreground underline"
              onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
              accessibilityRole="link"
              accessibilityLabel={PRIVACY_URL}
            >
              Privacy Policy
            </Text>
            .
          </Text>

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

        <Modal
          visible={linkPrompt !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setLinkPrompt(null)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 justify-end bg-black/40"
          >
            {linkPrompt && (
              <View className="px-4 pb-8">
                <LinkAppleSheet
                  email={linkPrompt.email}
                  identityToken={linkPrompt.identityToken}
                  onLinked={() => {
                    setLinkPrompt(null);
                    capture({
                      name: "auth_succeeded",
                      props: { method: "apple" },
                    });
                    focusHeading();
                  }}
                  onCancel={() => setLinkPrompt(null)}
                />
              </View>
            )}
          </KeyboardAvoidingView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
