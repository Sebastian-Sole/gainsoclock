import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction } from "convex/react";

import { Text } from "@/components/ui/text";
import { api } from "@/convex/_generated/api";

// Shown when a Sign-in-with-Apple attempt collides with an existing
// email+password account (`siwa_email_collision`). The user proves they own
// that account by entering its password, then we attach the verified Apple
// identity to it. See plans/033-siwa-account-linking.md for the security model:
// linking requires proof of BOTH the existing account (this password re-auth)
// AND the Apple identity (the verified token captured at the collision).

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  /**
   * Best-effort pre-fill for the existing account's email. Often empty: Apple
   * only returns the email on the very first authorization, so on a returning
   * collision `credential.email` is null. The field is therefore editable and
   * the user can type the email of the account they're linking to.
   */
  email: string;
  /** The verified Apple identity token captured when the collision threw. */
  identityToken: string;
  /** Called after the Apple identity is linked and the session is signed in. */
  onLinked: () => void;
  /** Called when the user backs out without linking. */
  onCancel: () => void;
};

function getLinkErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("InvalidSecret") || message.includes("incorrect")) {
    return "Incorrect password. Please try again.";
  }
  if (message.includes("TooManyFailedAttempts")) {
    return "Too many failed attempts. Please try again later.";
  }
  if (message.includes("apple_already_linked_elsewhere")) {
    return "This Apple ID is already linked to a different account. Contact support@fitbull.app for help.";
  }
  return "Could not link Apple. Please check your password and try again.";
}

export function LinkAppleSheet({
  email: initialEmail,
  identityToken,
  onLinked,
  onCancel,
}: Props) {
  const { signIn } = useAuthActions();
  const linkApple = useAction(api.accountLinking.linkApple);

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const passwordRef = useRef<TextInput | null>(null);

  const handleLink = async () => {
    Keyboard.dismiss();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setError("Enter the email of your existing account");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      // 1. Prove ownership of the existing account.
      await signIn("password", {
        email: trimmedEmail,
        password,
        flow: "signIn",
      });
      // 2. Attach the verified Apple identity to it (server re-verifies the
      //    token and enforces the anti-hijack rule).
      await linkApple({ idToken: identityToken });
      onLinked();
    } catch (err) {
      setError(getLinkErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="rounded-2xl bg-card p-6">
      <View accessible accessibilityRole="header">
        <Text className="mb-2 text-xl font-bold">Link Apple to your account</Text>
      </View>
      <Text className="mb-4 text-sm text-muted-foreground">
        Sign in to the account you want to connect Apple to. Enter its email and
        password — this links Sign in with Apple to that account.
      </Text>

      {error !== "" && (
        <View className="mb-4 rounded-xl bg-destructive/10 px-4 py-3">
          <Text className="text-sm text-destructive">{error}</Text>
        </View>
      )}

      <Text
        nativeID="link-apple-email-label"
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
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        accessibilityLabel="Email of your existing account"
        accessibilityLabelledBy="link-apple-email-label"
        testID="link-apple-email"
        className="mb-4 min-h-[44px] rounded-xl border border-input bg-background px-4 py-4 text-[16px] text-foreground"
      />

      <Text
        nativeID="link-apple-password-label"
        className="mb-2 text-sm font-medium text-muted-foreground"
      >
        PASSWORD
      </Text>
      <TextInput
        ref={passwordRef}
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          if (error) setError("");
        }}
        placeholder="Your password"
        placeholderTextColor="#9ca3af"
        secureTextEntry
        textContentType="password"
        autoFocus={initialEmail !== ""}
        returnKeyType="go"
        onSubmitEditing={handleLink}
        accessibilityLabel="Password for your existing account"
        accessibilityLabelledBy="link-apple-password-label"
        testID="link-apple-password"
        className="mb-6 min-h-[44px] rounded-xl border border-input bg-background px-4 py-4 text-[16px] text-foreground"
      />

      <Pressable
        onPress={handleLink}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Link Apple to your account"
        accessibilityState={{ disabled: isLoading }}
        className="mb-3 min-h-[44px] items-center justify-center rounded-xl bg-primary py-4 active:bg-primary/90"
        style={isLoading ? { opacity: 0.5 } : undefined}
        testID="link-apple-submit"
      >
        {isLoading ? (
          <ActivityIndicator color="white" size="small" />
        ) : (
          <Text className="text-base font-semibold" style={{ color: "#fff" }}>
            Link Apple
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={onCancel}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Cancel linking"
        hitSlop={8}
        className="min-h-[44px] items-center justify-center"
      >
        <Text className="text-sm font-medium text-muted-foreground">Cancel</Text>
      </Pressable>
    </View>
  );
}
