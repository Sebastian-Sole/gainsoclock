import * as AppleAuthentication from "expo-apple-authentication";
import { Platform, useColorScheme } from "react-native";

// Presentational wrapper: renders Apple's native SIWA button. Does NOT call
// into Convex auth — the owning screen handles the sign-in action so it can
// keep analytics, navigation, and collision-handling in one place.

type Props = {
  onSuccess: (credential: AppleAuthentication.AppleAuthenticationCredential) => void;
  onError: (err: unknown) => void;
  onCollision: () => void;
  disabled?: boolean;
  testID?: string;
};

export function AppleSignInButton({
  onSuccess,
  onError,
  onCollision,
  disabled,
  testID,
}: Props) {
  const colorScheme = useColorScheme();

  if (Platform.OS !== "ios") return null;

  const handlePress = async () => {
    if (disabled) return;
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      onSuccess(credential);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err ?? "");
      if (
        message.includes("siwa_email_collision") ||
        message.includes("EmailCollision")
      ) {
        onCollision();
        return;
      }
      // User cancelled — silent.
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      if (code === "ERR_REQUEST_CANCELED") return;
      onError(err);
    }
  };

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={
        AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
      }
      buttonStyle={
        colorScheme === "dark"
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={12}
      style={{ width: "100%", height: 48 }}
      onPress={handlePress}
      testID={testID}
    />
  );
}
