import { ApiError } from "../api/client";

// Only transport failures and missing bootstrap routes can offer the ad-only
// offline screen. Credential and local storage errors remain on the recovery UI.
export function canOfferOfflineAds(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const { code, statusCode } = error.failure;
  return (
    code === "NETWORK_ERROR" ||
    statusCode >= 500 ||
    statusCode === 404 ||
    statusCode === 405
  );
}
