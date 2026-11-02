import {
  InviteListener,
  PendingInviteNavigation,
} from "../linking/pending-invite";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../auth/provider";
import { palette } from "../ui/primitives";
export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return (
    <SafeAreaProvider>
      <ThemeProvider
        value={{
          ...DarkTheme,
          colors: { ...DarkTheme.colors, background: palette.bg },
        }}
      >
        <StatusBar style="light" />
        <InviteListener />
        <SessionProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.bg },
            }}
          />
          <PendingInviteNavigation />
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
