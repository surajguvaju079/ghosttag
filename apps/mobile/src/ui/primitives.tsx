import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as NativeText,
  View,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
export const palette = {
  bg: "#0F0F0F",
  card: "#1A1A1A",
  raised: "#242226",
  line: "#333037",
  text: "#F8F6FA",
  muted: "#AAA4B2",
  purple: "#8B5CF6",
  pink: "#F43F5E",
  green: "#83E6BC",
};
export function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[styles.text, style]} />;
}
export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={[styles.screen, style]}
    >
      {children}
    </SafeAreaView>
  );
}
export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  secondary = false,
  danger = false,
}: {
  label: string;
  onPress(): void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || disabled, busy }}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        danger && { borderColor: palette.pink },
        (busy || disabled) && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text style={[styles.buttonText, danger && { color: palette.pink }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
export function Banner({
  children,
  good = false,
}: {
  children: ReactNode;
  good?: boolean;
}) {
  return (
    <View style={[styles.banner, good && { borderColor: "#315245" }]}>
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: good ? palette.green : "#FFC5CF", lineHeight: 21 }}
      >
        {children}
      </Text>
    </View>
  );
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  text: { color: palette.text, fontSize: 16 },
  content: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    padding: 24,
    gap: 24,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
    gap: 24,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  logo: { fontSize: 29, fontWeight: "900", letterSpacing: -1.3 },
  title: { fontSize: 32, fontWeight: "800", letterSpacing: -1 },
  muted: { color: palette.muted, lineHeight: 24 },
  caption: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
    color: palette.muted,
  },
  card: {
    backgroundColor: palette.card,
    padding: 20,
    borderRadius: 24,
    gap: 18,
    borderWidth: 1,
    borderColor: "#29262D",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  input: {
    color: palette.text,
    backgroundColor: "#121114",
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16,
    minHeight: 52,
    borderRadius: 14,
    fontSize: 16,
  },
  button: {
    minHeight: 52,
    backgroundColor: palette.purple,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  secondary: { backgroundColor: palette.card, borderColor: palette.line },
  buttonText: { fontWeight: "700", fontSize: 15 },
  banner: {
    backgroundColor: "#231B21",
    borderColor: "#603341",
    borderWidth: 1,
    padding: 14,
    borderRadius: 14,
  },
  pill: {
    backgroundColor: "#251D38",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 30,
    alignSelf: "flex-start",
  },
  modal: {
    flex: 1,
    backgroundColor: "#000000B0",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: palette.card,
    borderRadius: 24,
    padding: 24,
    gap: 16,
    maxHeight: "85%",
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
});
