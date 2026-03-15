import React, { useState } from "react";
import {
  View,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
  Platform,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthActions } from "@convex-dev/auth/react";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSignInErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error);

  if (message.includes("InvalidAccountId") || message.includes("Could not find")) {
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const validate = (): string | null => {
    if (!email.trim()) return "Email is required";
    if (!EMAIL_REGEX.test(email.trim())) return "Please enter a valid email address";
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

    setError("");
    setIsLoading(true);
    try {
      await signIn("password", {
        email: email.trim(),
        password,
        flow: "signIn",
      });
    } catch (err) {
      setError(getSignInErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    Keyboard.dismiss();
    setError("");
    setIsLoading(true);
    try {
      await signIn(provider);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="flex-1 justify-center px-6" keyboardShouldPersistTaps="handled">
          <Text className="mb-2 text-center text-3xl font-bold">
            Welcome Back
          </Text>
          <Text className="mb-8 text-center text-muted-foreground">
            Sign in to sync your workouts
          </Text>

          {error !== "" && (
            <View className="mb-4 rounded-xl bg-destructive/10 px-4 py-3">
              <Text className="text-sm text-destructive">{error}</Text>
            </View>
          )}

          {/* Email */}
          <Text className="mb-2 text-sm font-medium text-muted-foreground">
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
            className="mb-4 rounded-xl border border-input bg-card px-4 py-4 text-base text-foreground"
          />

          {/* Password */}
          <Text className="mb-2 text-sm font-medium text-muted-foreground">
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
            className="mb-6 rounded-xl border border-input bg-card px-4 py-4 text-base text-foreground"
          />

          {/* Sign In Button */}
          <Pressable
            onPress={handleSignIn}
            disabled={isLoading}
            className="mb-4 items-center justify-center rounded-xl bg-primary py-4 active:bg-primary/90"
            style={isLoading ? { opacity: 0.5 } : undefined}
          >
            {isLoading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-base font-semibold" style={{ color: "#fff" }}>
                Sign In
              </Text>
            )}
          </Pressable>

          {/* Divider */}
          <View className="my-4 flex-row items-center gap-4">
            <View className="h-px flex-1 bg-border" />
            <Text className="text-sm text-muted-foreground">or</Text>
            <View className="h-px flex-1 bg-border" />
          </View>

          {/* OAuth Buttons */}
          <Pressable
            onPress={() => handleOAuth("google")}
            disabled={isLoading}
            className="mb-3 items-center justify-center rounded-xl border border-border bg-card py-4 active:bg-accent"
          >
            <Text className="text-base font-medium">Continue with Google</Text>
          </Pressable>

          <Pressable
            onPress={() => handleOAuth("apple")}
            disabled={isLoading}
            className="mb-6 items-center justify-center rounded-xl border border-border bg-card py-4 active:bg-accent"
          >
            <Text className="text-base font-medium">Continue with Apple</Text>
          </Pressable>

          {/* Sign Up Link */}
          <View className="flex-row items-center justify-center gap-1">
            <Text className="text-muted-foreground">
              Don&apos;t have an account?
            </Text>
            <Pressable onPress={() => router.push("/(auth)/sign-up" as never)}>
              <Text className="font-semibold text-primary">Sign Up</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
