import { useCallback, useEffect, useState } from "react";
import { Keyboard, Platform, View } from "react-native";
import { useFocusEffect } from "expo-router";
import mobileAds, {
  AdsConsent,
  BannerAd,
  BannerAdSize,
  TestIds,
  useInterstitialAd,
} from "react-native-google-mobile-ads";
import { Button, palette, Text, styles } from "../ui/primitives";

const production = process.env.EXPO_PUBLIC_APP_ENV === "production";
const bannerUnit = production
  ? "ca-app-pub-7927951223693447/8882912394"
  : TestIds.ADAPTIVE_BANNER;
const interstitialUnit = production
  ? "ca-app-pub-7927951223693447/4413631454"
  : TestIds.INTERSTITIAL;

type AdAvailability =
  | { status: "checking" }
  | { status: "unsupported" }
  | { status: "ready" }
  | { status: "consent-unavailable" }
  | { status: "consent-error"; code: string; detail: string }
  | { status: "sdk-error"; code: string };

let preparation: Promise<AdAvailability> | undefined;
const readinessListeners = new Set<(availability: AdAvailability) => void>();

function errorCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? error.code
    : undefined;
  return typeof code === "string" && /^[a-zA-Z0-9/_.-]{1,80}$/.test(code)
    ? code
    : "unknown";
}

function errorDetail(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.replace(/https?:\/\/\S+/g, "[url]").replace(/\s+/g, " ").slice(0, 180);
}

function publish(availability: AdAvailability) {
  readinessListeners.forEach((listener) => listener(availability));
}

function prepareAds() {
  preparation ??= (async () => {
    let canRequestAds: boolean;
    try {
      canRequestAds = (await AdsConsent.gatherConsent()).canRequestAds;
    } catch (error) {
      // UMP may retain a valid decision from a previous session after an update
      // failure. Never proceed unless UMP itself says requests are allowed.
      const cached = await AdsConsent.getConsentInfo().catch(() => null);
      if (cached?.canRequestAds) canRequestAds = true;
      else return {
        status: "consent-error",
        code: errorCode(error),
        detail: errorDetail(error),
      } as const;
    }
    if (!canRequestAds) return { status: "consent-unavailable" } as const;
    try {
      await mobileAds().initialize();
    } catch (error) {
      return { status: "sdk-error", code: errorCode(error) } as const;
    }
    return { status: "ready" } as const;
  })();
  return preparation;
}

function retryAdSetup() {
  preparation = undefined;
  publish({ status: "checking" });
  void prepareAds().then(publish);
}

function useAdAvailability() {
  const [availability, setAvailability] = useState<AdAvailability>(
    Platform.OS === "android" ? { status: "checking" } : { status: "unsupported" },
  );
  useEffect(() => {
    if (Platform.OS !== "android") return;
    let mounted = true;
    const update = (next: AdAvailability) => {
      if (mounted) setAvailability(next);
    };
    readinessListeners.add(update);
    void prepareAds().then(update);
    return () => { mounted = false; readinessListeners.delete(update); };
  }, []);
  return availability;
}

export function AdBanner() {
  const [focused, setFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  return <BannerContent visible={focused && !keyboardVisible} />;
}

export function OfflineAdBanner() {
  return <BannerContent visible />;
}

function BannerContent({ visible }: { visible: boolean }) {
  const availability = useAdAvailability();
  if (availability.status !== "ready" || !visible) return null;
  return (
    <View style={{ alignItems: "center", borderTopWidth: 1, borderColor: palette.line, paddingTop: 4 }}>
      <Text style={styles.caption}>Advertisement</Text>
      <BannerAd unitId={bannerUnit} size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER} />
    </View>
  );
}

export function VoluntaryAd() {
  const availability = useAdAvailability();
  const ready = availability.status === "ready";
  const ad = useInterstitialAd({
    adUnitId: Platform.OS === "android" ? interstitialUnit : null,
    autoLoad: ready,
  });
  const { status: adStatus, load: loadAd } = ad;
  useEffect(() => {
    if (ready && adStatus === "closed") loadAd();
  }, [ready, adStatus, loadAd]);
  const canRetrySetup = ["consent-unavailable", "consent-error", "sdk-error"].includes(availability.status);
  const canRetryAd = ready && ["no-fill", "error"].includes(ad.status);
  const label = canRetrySetup
    ? "Check ad availability again"
    : !ready
      ? "Checking ad availability…"
      : ad.status === "loaded"
        ? "View optional ad"
        : canRetryAd
          ? "Retry ad request"
          : ad.status === "loading" || ad.status === "closed"
            ? "Loading ad…"
            : "Ad unavailable right now";
  const detail = availability.status === "consent-unavailable"
    ? "Ad requests are unavailable with the current privacy choices."
    : availability.status === "unsupported"
      ? "Optional ads are currently available on Android only."
    : availability.status === "consent-error"
      ? `Ad privacy check failed (${availability.code}). ${availability.detail}`.trim()
      : availability.status === "sdk-error"
        ? `Ad setup failed (${availability.code}).`
        : ad.status === "no-fill"
          ? "No ad was available for this request. Try again later."
          : ad.status === "error"
            ? `Ad request failed (${ad.error?.phase ?? "load"}/${ad.error?.reason ?? "unknown"}).`
            : "Watching an ad is optional. Ads need an internet connection and may not always be available.";
  return (
    <View style={{ gap: 8 }}>
      <Button
        label={label}
        secondary
        disabled={ad.status !== "loaded" && !canRetryAd && !canRetrySetup}
        onPress={() => {
          if (canRetrySetup) retryAdSetup();
          else if (canRetryAd) ad.retry();
          else ad.show();
        }}
      />
      <Text style={styles.caption}>{detail}</Text>
    </View>
  );
}

export async function openAdPrivacyOptions() {
  await AdsConsent.showPrivacyOptionsForm();
  retryAdSetup();
}
