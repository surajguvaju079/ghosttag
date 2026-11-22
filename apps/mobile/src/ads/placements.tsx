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

let preparation: Promise<boolean> | undefined;
const readinessListeners = new Set<(ready: boolean) => void>();

function prepareAds() {
  preparation ??= (async () => {
    const consent = await AdsConsent.gatherConsent();
    if (!consent.canRequestAds) {
      preparation = undefined;
      return false;
    }
    await mobileAds().initialize();
    return true;
  })().catch(() => {
    preparation = undefined;
    return false;
  });
  return preparation;
}

function useAdsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    let mounted = true;
    const update = (allowed: boolean) => {
      if (mounted) setReady(allowed);
    };
    readinessListeners.add(update);
    void prepareAds().then((allowed) => {
      update(allowed);
    });
    return () => { mounted = false; readinessListeners.delete(update); };
  }, []);
  return ready;
}

export function AdBanner() {
  const ready = useAdsReady();
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
  if (!ready || !focused || keyboardVisible) return null;
  return (
    <View style={{ alignItems: "center", borderTopWidth: 1, borderColor: palette.line, paddingTop: 4 }}>
      <Text style={styles.caption}>Advertisement</Text>
      <BannerAd unitId={bannerUnit} size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER} />
    </View>
  );
}

export function VoluntaryAd() {
  const ready = useAdsReady();
  const ad = useInterstitialAd({
    adUnitId: Platform.OS === "android" ? interstitialUnit : null,
    autoLoad: ready,
  });
  const canRetry = ready && ["closed", "no-fill", "error"].includes(ad.status);
  return (
    <View style={{ gap: 8 }}>
      <Button
        label={ad.status === "loaded" ? "View optional ad" : canRetry ? "Try loading an ad" : "Ad unavailable right now"}
        secondary
        disabled={ad.status !== "loaded" && !canRetry}
        onPress={() => {
          if (canRetry) ad.retry();
          else ad.show();
        }}
      />
      <Text style={styles.caption}>
        Watching an ad is optional. Ads need an internet connection and may not always be available.
      </Text>
    </View>
  );
}

export async function openAdPrivacyOptions() {
  await AdsConsent.showPrivacyOptionsForm();
  preparation = undefined;
  const ready = await prepareAds();
  readinessListeners.forEach((listener) => listener(ready));
}
