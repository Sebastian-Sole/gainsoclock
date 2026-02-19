import React, { useState } from "react";
import {
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthActions } from "@convex-dev/auth/react";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSignUpErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error);

  if (message.includes("AccountAlreadyExists") || message.includes("already exists")) {
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

  const validate = (): string | null => {
    if (!email.trim()) return "Email is required";
    if (!EMAIL_REGEX.test(email.trim())) return "Please enter a valid email address";
    if (!password) return "Password is required";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!confirmPassword) return "Please confirm your password";
    if (password !== confirmPassword) return "Passwords do not match";
    return null;
  };

  const handleSignUp = async () => {
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
        flow: "signUp",
      });
    } catch (err) {
      setError(getSignUpErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = () => {
    if (error) setError("");
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 justify-center px-6">
          <Text className="mb-2 text-center text-3xl font-bold">
            Create Account
          </Text>
          <Text className="mb-8 text-center text-muted-foreground">
            Start tracking your workouts
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
              clearError();
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
              clearError();
            }}
            placeholder="At least 8 characters"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            textContentType="newPassword"
            className="mb-4 rounded-xl border border-input bg-card px-4 py-4 text-base text-foreground"
          />

          {/* Confirm Password */}
          <Text className="mb-2 text-sm font-medium text-muted-foreground">
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
            className="mb-6 rounded-xl border border-input bg-card px-4 py-4 text-base text-foreground"
          />

          {/* Sign Up Button */}
          <Pressable
            onPress={handleSignUp}
            disabled={isLoading}
            className="mb-6 items-center justify-center rounded-xl bg-primary py-4 active:bg-primary/90"
            style={isLoading ? { opacity: 0.5 } : undefined}
          >
            {isLoading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-base font-semibold" style={{ color: "#fff" }}>
                Create Account
              </Text>
            )}
          </Pressable>

          {/* Sign In Link */}
          <View className="flex-row items-center justify-center gap-1">
            <Text className="text-muted-foreground">
              Already have an account?
            </Text>
            <Pressable onPress={() => router.back()}>
              <Text className="font-semibold text-primary">Sign In</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
