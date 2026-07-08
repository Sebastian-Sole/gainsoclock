import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Convex Auth needs a storage adapter for session tokens.
// On native, use SecureStore. On web, fall back to localStorage.

// Keychain items default to WHEN_UNLOCKED accessibility, which makes them
// unreadable while the device is locked. Background contexts (notifications,
// offline sync, HealthKit delivery) then hit errSecInteractionNotAllowed
// ("User interaction is not allowed") when Convex Auth reads the session
// token. AFTER_FIRST_UNLOCK keeps the token readable in the background once
// the user has unlocked the device at least once since boot.
//
// Accessibility is persisted with the item at write time, so this must be
// passed on setItemAsync; existing tokens upgrade on the next write
// (sign-in / token refresh). Passing it on read is harmless.
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      return localStorage.getItem(key);
    }
    try {
      return await SecureStore.getItemAsync(key, secureStoreOptions);
    } catch {
      // A locked device (or a corrupt Keychain entry) throws instead of
      // returning null. Degrade gracefully: treat it as "no token" rather
      // than crashing the caller.
      return null;
    }
  },
  setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value, secureStoreOptions);
  },
  removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

export default secureStorage;
