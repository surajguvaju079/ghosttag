import type { CredentialStore } from "./session";
// Browser preview only. Do not fall back to plaintext localStorage for credentials.
let credential: string | null = null;
export const browserPreview = true;
export const credentialStore: CredentialStore = {
  get: async () => credential,
  set: async (token) => {
    credential = token;
  },
  clear: async () => {
    credential = null;
  },
};
