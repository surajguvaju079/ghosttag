import type { ReactNode } from "react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { Screen, Text } from "./primitives";

export const brand = {
  background: "#0F0B1F",
  card: "#18122F",
  border: "#3D2D65",
  muted: "#B7ACD3",
  purple: "#8B5CF6",
  pink: "#EC4899",
  cyan: "#22D3EE",
  lavender: "#A78BFA",
};
const stars = [
  { x: 12, y: 10, size: 3 },
  { x: 87, y: 17, size: 3 },
  { x: 18, y: 36, size: 2 },
  { x: 77, y: 6, size: 2 },
  { x: 7, y: 63, size: 3 },
  { x: 92, y: 49, size: 2 },
  { x: 43, y: 3, size: 2 },
  { x: 81, y: 78, size: 3 },
];
export function BrandScreen({ children }: { children: ReactNode }) {
  return (
    <View style={brandStyles.root}>
      <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        style={StyleSheet.absoluteFill}
      >
        <LinearGradient
          colors={["#080511", "#100A25", "#120A2A"]}
          style={StyleSheet.absoluteFill}
        />
        {stars.map((star, index) => (
          <View
            key={index}
            style={{
              position: "absolute",
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              borderRadius: star.size,
              backgroundColor: index % 2 ? brand.cyan : brand.lavender,
              opacity: 0.4,
            }}
          />
        ))}
        <View style={brandStyles.waves}>
          <LinearGradient
            colors={["#42209B", "#23134B", "#120A29"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[brandStyles.wave, brandStyles.waveBack]}
          />
          <LinearGradient
            colors={["#6B21A8", "#35116B", "#110A24"]}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[brandStyles.wave, brandStyles.waveMiddle]}
          />
          <LinearGradient
            colors={["#28134E", "#0F0B1F"]}
            style={[brandStyles.wave, brandStyles.waveFront]}
          />
        </View>
      </View>
      <Screen style={{ backgroundColor: "transparent" }}>{children}</Screen>
    </View>
  );
}
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel="GhostTag. Real people. Temporary places."
      style={brandStyles.mark}
    >
      <Image
        source={require("../../assets/brand/mascot.png")}
        contentFit="contain"
        accessibilityElementsHidden
        accessible={false}
        style={{ width: compact ? 148 : 194, height: compact ? 132 : 170 }}
      />
      <Text
        style={[
          brandStyles.wordmark,
          compact && { fontSize: 38, lineHeight: 43 },
        ]}
      >
        Ghost
        <Text
          style={[
            brandStyles.wordmark,
            compact && { fontSize: 38, lineHeight: 43 },
            { color: brand.pink },
          ]}
        >
          Tag
        </Text>
      </Text>
      <Text style={brandStyles.tagline}>REAL PEOPLE{"\n"}TEMPORARY PLACES</Text>
    </View>
  );
}
const brandStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  waves: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 260,
    overflow: "hidden",
  },
  wave: { position: "absolute", width: "155%", height: 220, borderRadius: 160 },
  waveBack: {
    left: "-37%",
    bottom: -68,
    transform: [{ rotate: "24deg" }],
    opacity: 0.65,
  },
  waveMiddle: {
    right: "-48%",
    bottom: -90,
    transform: [{ rotate: "-22deg" }],
    opacity: 0.72,
  },
  waveFront: { left: "-20%", bottom: -163, transform: [{ rotate: "-6deg" }] },
  mark: { alignItems: "center", gap: 3 },
  wordmark: {
    color: "#FFFFFF",
    fontSize: 46,
    lineHeight: 52,
    fontWeight: "900",
    letterSpacing: -2,
  },
  tagline: {
    color: "#C5B6F1",
    fontSize: 10,
    lineHeight: 18,
    letterSpacing: 3.8,
    textAlign: "center",
    fontWeight: "500",
    marginTop: 6,
  },
});
