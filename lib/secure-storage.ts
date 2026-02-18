import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Convex Auth needs a storage adapter for session tokens.
// On native, use SecureStore. On web, fall back to localStorage.
const secureStorage = {
  getItem(key: string) {
    if (Platform.OS === "web") {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  setItem(key: string, value: string) {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem(key: string) {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

export default secureStorage;
