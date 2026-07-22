import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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

// Mirrors the sign-up screen's rule (app/(auth)/sign-up.tsx) and the server
// check in convex/user.ts (initiateEmailChange).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_CODE_LENGTH = 6;

const PROVIDER_LABELS: Record<string, string> = {
  password: "Email & password",
  google: "Google",
  "apple-native": "Apple",
};

type SaveState = "idle" | "saving" | "saved";

/**
 * Settings → Account: change display name and (for password accounts)
 * password and email.
 *
 * Email change is verify-before-activate: @convex-dev/auth keys the password
 * account by the email, so activating an unverified address would be an
 * account-takeover vector. The user re-authenticates with their password, a
 * 6-digit code goes to the NEW address, and only a correct code swaps the
 * account. Full rationale lives next to the backend functions in
 * `convex/user.ts` (issue #123). Apple relay addresses never see this UI.
 */
export default function AccountScreen() {
  const router = useRouter();
  const info = useQuery(api.user.getAccountInfo);
  const pendingEmailChange = useQuery(api.user.getEmailChangeStatus);
  const updateName = useMutation(api.user.updateName);
  const changePassword = useAction(api.user.changePassword);
  const initiateEmailChange = useAction(api.user.initiateEmailChange);
  const verifyEmailChange = useAction(api.user.verifyEmailChange);
  const resendEmailChangeCode = useAction(api.user.resendEmailChangeCode);
  const cancelEmailChange = useMutation(api.user.cancelEmailChange);

  // Name — draft is null until the user edits, so the query stays the source
  // of truth for the initial value without effect-based syncing.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameState, setNameState] = useState<SaveState>("idle");
  const [nameError, setNameError] = useState<string | null>(null);

  // Email change flow. Which of the two sub-forms renders is driven by the
  // server (`pendingEmailChange`), so the "enter code" state survives app
  // restarts; only drafts and feedback live here.
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailBusy, setEmailBusy] = useState<
    "none" | "send" | "verify" | "resend" | "cancel"
  >("none");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

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

  const emailFormValid =
    newEmail.trim().length > 0 && emailPassword.length > 0;
  const emailCodeValid = emailCode.trim().length === EMAIL_CODE_LENGTH;

  const clearEmailFeedback = () => {
    setEmailError(null);
    setEmailNotice(null);
  };

  const handleSendEmailCode = async () => {
    clearEmailFeedback();
    const email = newEmail.trim();
    if (!EMAIL_REGEX.test(email)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailBusy("send");
    try {
      const result = await initiateEmailChange({
        currentPassword: emailPassword,
        newEmail: email,
      });
      switch (result) {
        case "ok":
          // The pending query flips this section to the code form.
          setNewEmail("");
          setEmailPassword("");
          setEmailCode("");
          setEmailNotice("Verification code sent.");
          break;
        case "invalid_email":
          setEmailError("Enter a valid email address.");
          break;
        case "email_in_use":
          setEmailError("That email is already in use.");
          break;
        case "wrong_password":
          setEmailError("Current password is incorrect.");
          break;
        case "too_many_attempts":
          setEmailError("Too many attempts. Try again in a few minutes.");
          break;
        case "no_password_account":
          setEmailError("This account doesn't sign in with a password.");
          break;
        case "rate_limited":
          setEmailError("Too many codes requested. Try again in an hour.");
          break;
      }
    } catch {
      setEmailError("Couldn't start the email change. Try again in a moment.");
    }
    setEmailBusy("none");
  };

  const handleVerifyEmailCode = async () => {
    clearEmailFeedback();
    setEmailBusy("verify");
    try {
      const result = await verifyEmailChange({ code: emailCode.trim() });
      switch (result) {
        case "ok":
          setEmailCode("");
          setEmailNotice("Email updated.");
          break;
        case "invalid_code":
          setEmailError("That code isn't right. Check the email and try again.");
          break;
        case "expired":
          setEmailError("That code has expired. Start over to get a new one.");
          break;
        case "too_many_attempts":
          setEmailError("Too many wrong codes. Start over to get a new one.");
          break;
        case "no_pending":
          setEmailError("No email change in progress. Start over.");
          break;
        case "email_in_use":
          setEmailError("That email is already in use.");
          break;
        case "no_password_account":
          setEmailError("This account doesn't sign in with a password.");
          break;
      }
    } catch {
      setEmailError("Couldn't verify the code. Try again in a moment.");
    }
    setEmailBusy("none");
  };

  const handleResendEmailCode = async () => {
    clearEmailFeedback();
    setEmailBusy("resend");
    try {
      const result = await resendEmailChangeCode();
      switch (result) {
        case "ok":
          setEmailCode("");
          setEmailNotice("New code sent.");
          break;
        case "no_pending":
          setEmailError("No email change in progress. Start over.");
          break;
        case "rate_limited":
          setEmailError("Too many codes requested. Try again in an hour.");
          break;
      }
    } catch {
      setEmailError("Couldn't resend the code. Try again in a moment.");
    }
    setEmailBusy("none");
  };

  const handleCancelEmailChange = async () => {
    clearEmailFeedback();
    setEmailBusy("cancel");
    try {
      await cancelEmailChange();
      setEmailCode("");
    } catch {
      setEmailError("Couldn't cancel. Try again in a moment.");
    }
    setEmailBusy("none");
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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
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
              returnKeyType="done"
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
                  <Text className="mt-1 text-foreground" testID="account-email">
                    {info.email}
                  </Text>
                  {!info.hasPassword ? (
                    <Text className="mt-1 text-xs text-muted-foreground">
                      Your email comes from your sign-in provider and
                      can&apos;t be changed here. Contact support@fitbull.app
                      if you need to move your account.
                    </Text>
                  ) : null}
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

          {/* Email change — password accounts only; Apple relay addresses
              are excluded (the section would move an Apple-internal email). */}
          {info.hasPassword && !info.isAppleRelay ? (
            <>
              <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
                CHANGE EMAIL
              </Text>
              <View
                className="rounded-xl bg-card px-4 py-4"
                testID="account-email-change-section"
              >
                {pendingEmailChange === undefined ? (
                  <ActivityIndicator size="small" />
                ) : pendingEmailChange !== null ? (
                  <>
                    <Text className="text-sm text-muted-foreground">
                      We sent a {EMAIL_CODE_LENGTH}-digit code to{" "}
                      <Text className="text-sm font-medium text-foreground">
                        {pendingEmailChange.newEmail}
                      </Text>
                      . Your email changes only after you confirm it.
                    </Text>

                    <Text
                      nativeID="account-email-code-label"
                      className="mb-2 mt-4 text-sm font-medium text-muted-foreground"
                    >
                      Verification code
                    </Text>
                    <Input
                      value={emailCode}
                      onChangeText={(t) => {
                        setEmailCode(t);
                        clearEmailFeedback();
                      }}
                      placeholder={`${EMAIL_CODE_LENGTH}-digit code`}
                      keyboardType="number-pad"
                      maxLength={EMAIL_CODE_LENGTH}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="one-time-code"
                      textContentType="oneTimeCode"
                      returnKeyType="done"
                      accessibilityLabel="Verification code"
                      accessibilityLabelledBy="account-email-code-label"
                      testID="account-email-code-input"
                    />

                    {emailError ? (
                      <Text className="mt-3 text-sm text-destructive">
                        {emailError}
                      </Text>
                    ) : emailNotice ? (
                      <Text className="mt-3 text-sm text-muted-foreground">
                        {emailNotice}
                      </Text>
                    ) : null}

                    <Pressable
                      onPress={() => {
                        void handleVerifyEmailCode();
                      }}
                      disabled={!emailCodeValid || emailBusy !== "none"}
                      accessibilityRole="button"
                      accessibilityLabel="Verify code and change email"
                      accessibilityState={{
                        disabled: !emailCodeValid || emailBusy !== "none",
                        busy: emailBusy === "verify",
                      }}
                      testID="account-verify-email-code"
                      className={cn(
                        "mt-4 min-h-[44px] items-center justify-center rounded-xl py-3",
                        emailCodeValid && emailBusy === "none"
                          ? "bg-primary"
                          : "bg-primary/40"
                      )}
                    >
                      {emailBusy === "verify" ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text className="font-medium text-primary-foreground">
                          Verify code
                        </Text>
                      )}
                    </Pressable>

                    <View className="mt-2 flex-row gap-3">
                      <Pressable
                        onPress={() => {
                          void handleResendEmailCode();
                        }}
                        disabled={emailBusy !== "none"}
                        accessibilityRole="button"
                        accessibilityLabel="Resend verification code"
                        accessibilityState={{
                          disabled: emailBusy !== "none",
                          busy: emailBusy === "resend",
                        }}
                        testID="account-resend-email-code"
                        className="min-h-[44px] flex-1 items-center justify-center rounded-xl py-3"
                      >
                        {emailBusy === "resend" ? (
                          <ActivityIndicator size="small" />
                        ) : (
                          <Text className="font-medium text-primary">
                            Resend code
                          </Text>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          void handleCancelEmailChange();
                        }}
                        disabled={emailBusy !== "none"}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel email change"
                        accessibilityState={{
                          disabled: emailBusy !== "none",
                          busy: emailBusy === "cancel",
                        }}
                        testID="account-cancel-email-change"
                        className="min-h-[44px] flex-1 items-center justify-center rounded-xl py-3"
                      >
                        {emailBusy === "cancel" ? (
                          <ActivityIndicator size="small" />
                        ) : (
                          <Text className="font-medium text-muted-foreground">
                            Cancel
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Text
                      nativeID="account-new-email-label"
                      className="mb-2 text-sm font-medium text-muted-foreground"
                    >
                      New email
                    </Text>
                    <Input
                      value={newEmail}
                      onChangeText={(t) => {
                        setNewEmail(t);
                        clearEmailFeedback();
                      }}
                      placeholder="you@example.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      returnKeyType="done"
                      accessibilityLabel="New email"
                      accessibilityLabelledBy="account-new-email-label"
                      testID="account-new-email-input"
                    />

                    <Text
                      nativeID="account-email-password-label"
                      className="mb-2 mt-4 text-sm font-medium text-muted-foreground"
                    >
                      Current password
                    </Text>
                    <Input
                      value={emailPassword}
                      onChangeText={(t) => {
                        setEmailPassword(t);
                        clearEmailFeedback();
                      }}
                      placeholder="Your current password"
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="password"
                      returnKeyType="done"
                      accessibilityLabel="Current password for email change"
                      accessibilityLabelledBy="account-email-password-label"
                      testID="account-email-password-input"
                    />

                    <Text className="mt-2 text-xs text-muted-foreground">
                      We&apos;ll email a verification code to the new address.
                      Your email only changes after you confirm the code.
                    </Text>

                    {emailError ? (
                      <Text className="mt-3 text-sm text-destructive">
                        {emailError}
                      </Text>
                    ) : emailNotice ? (
                      <Text className="mt-3 text-sm text-muted-foreground">
                        {emailNotice}
                      </Text>
                    ) : null}

                    <Pressable
                      onPress={() => {
                        void handleSendEmailCode();
                      }}
                      disabled={!emailFormValid || emailBusy !== "none"}
                      accessibilityRole="button"
                      accessibilityLabel="Send verification code"
                      accessibilityState={{
                        disabled: !emailFormValid || emailBusy !== "none",
                        busy: emailBusy === "send",
                      }}
                      testID="account-send-email-code"
                      className={cn(
                        "mt-4 min-h-[44px] items-center justify-center rounded-xl py-3",
                        emailFormValid && emailBusy === "none"
                          ? "bg-primary"
                          : "bg-primary/40"
                      )}
                    >
                      {emailBusy === "send" ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text className="font-medium text-primary-foreground">
                          Send verification code
                        </Text>
                      )}
                    </Pressable>
                  </>
                )}
              </View>
            </>
          ) : null}

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
                  returnKeyType="done"
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
                  returnKeyType="done"
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
                  returnKeyType="done"
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
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
