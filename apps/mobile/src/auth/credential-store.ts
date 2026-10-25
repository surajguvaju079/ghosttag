import * as SecureStore from "expo-secure-store";
import type { CredentialStore } from "./session";
const KEY = "ghosttag.anonymous-credential.v1";
export const browserPreview = false;
export const credentialStore: CredentialStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token) =>
    SecureStore.setItemAsync(KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
