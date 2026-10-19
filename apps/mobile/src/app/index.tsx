import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { brand, BrandMark, BrandScreen } from "../ui/brand";
import { useRouter } from "expo-router";
import { useSession } from "../auth/provider";
import { browserPreview } from "../auth/credential-store";
import { ApiError, asApiError, friendlyError } from "../api/client";
import type { Vibe } from "../api/contracts";
import { vibes } from "../rooms/vibes";
import { Banner, Text } from "../ui/primitives";
export default function Home() {
  const { api, token } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [vibe, setVibe] = useState<Vibe>("DEEP_TALK");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [retryAt, setRetryAt] = useState({ create: 0, join: 0 });
  async function enter() {
    if (busy) return;
    if (Date.now() < retryAt[mode]) {
      setError(
        new ApiError({
          statusCode: 429,
          code: "RATE_LIMITED",
          message: "Wait before retrying",
          retryAfterMs: retryAt[mode] - Date.now(),
        }),
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const publicCode =
        mode === "create"
          ? await api.createRoom(token, vibe, name)
          : await api.joinRoom(token, code);
      router.push({ pathname: "./room/[code]", params: { code: publicCode } });
    } catch (failure) {
      setError(failure);
      setRetryAt((current) => ({
        ...current,
        [mode]: asApiError(failure).retryAt,
      }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <BrandScreen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={home.content}
        >
          <View style={home.hero}>
            <BrandMark />
          </View>
          <View style={home.card}>
            <LinearGradient
              pointerEvents="none"
              colors={["#20163F", "#151026"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={{ gap: 6 }}>
              <Text style={home.heading}>
                {mode === "create" ? "Create a room" : "Join a room"}
              </Text>
              <Text style={home.subtitle}>
                {mode === "create"
                  ? "Pick a vibe and get ready to share."
                  : "Your people are one room code away."}
              </Text>
            </View>
            {mode === "create" ? (
              <>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Room vibe"
                  style={home.vibes}
                >
                  {vibes.map((item) => (
                    <Pressable
                      key={item.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: vibe === item.value }}
                      accessibilityLabel={item.label}
                      accessibilityHint={item.hint}
                      onPress={() => setVibe(item.value)}
                      style={({ pressed }) => [
                        home.vibe,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <View
                        style={[
                          home.vibeOrb,
                          {
                            backgroundColor: `${item.color}20`,
                            borderColor:
                              vibe === item.value
                                ? item.color
                                : `${item.color}30`,
                          },
                          vibe === item.value && { borderWidth: 2 },
                        ]}
                      >
                        <Text style={{ fontSize: 26, color: item.color }}>
                          {item.emoji}
                        </Text>
                        {vibe === item.value && (
                          <View style={home.selected}>
                            <Text style={{ fontSize: 9, fontWeight: "800" }}>
                              ✓
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          home.vibeName,
                          vibe === item.value && { color: "#FFFFFF" },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  accessibilityLabel="Room name"
                  placeholder="Room name (optional)"
                  placeholderTextColor={brand.muted}
                  style={home.input}
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                />
              </>
            ) : (
              <>
                <TextInput
                  accessibilityLabel="Room code"
                  placeholder="GH-4829"
                  placeholderTextColor={brand.muted}
                  style={[home.input, home.code]}
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                  onSubmitEditing={() => void enter()}
                />
                <Text style={home.note}>
                  Enter the code your friend shared. You can rejoin a room you
                  left while it’s still open.
                </Text>
              </>
            )}
            {error !== undefined && <Banner>{friendlyError(error)}</Banner>}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                mode === "create" ? "Create Room" : "Enter the room"
              }
              accessibilityState={{ busy, disabled: busy }}
              disabled={busy}
              onPress={() => void enter()}
              style={({ pressed }) => [
                home.primary,
                (busy || pressed) && { opacity: 0.7 },
              ]}
            >
              <LinearGradient
                colors={["#7C3AED", "#A32DE0"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={home.primaryFill}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={home.action}>
                    {mode === "create" ? "Create Room" : "Enter the room"}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
          <View style={home.divider}>
            <View style={home.line} />
            <Text style={home.or}>or</Text>
            <View style={home.line} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              mode === "create" ? "Join a room" : "Create a room instead"
            }
            disabled={busy}
            onPress={() => {
              setMode(mode === "create" ? "join" : "create");
              setError(undefined);
            }}
            style={({ pressed }) => [
              home.alternative,
              pressed && { backgroundColor: "#291A4C" },
              busy && { opacity: 0.45 },
            ]}
          >
            <Text style={home.action}>
              {mode === "create" ? "Join a room" : "Create a room instead"}
            </Text>
            <Text
              style={{ color: brand.lavender, fontSize: 20 }}
              accessibilityElementsHidden
            >
              ↗
            </Text>
          </Pressable>
          <Text style={home.footer}>
            No profiles. No followers. Just now.{"\n"}Rooms disappear after 24
            hours.
          </Text>
          {browserPreview && (
            <Text style={[home.note, { textAlign: "center" }]}>
              Browser preview · session resets on page reload.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </BrandScreen>
  );
}
const home = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    padding: 24,
    paddingTop: 12,
    gap: 16,
    flexGrow: 1,
  },
  hero: { alignItems: "center", marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 24,
    padding: 18,
    gap: 18,
    overflow: "hidden",
    backgroundColor: brand.card,
  },
  heading: {
    color: "#F9F5FF",
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: { color: brand.muted, fontSize: 12, lineHeight: 18 },
  vibes: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  vibe: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    minHeight: 84,
    paddingVertical: 2,
  },
  vibeOrb: {
    width: 49,
    height: 49,
    borderRadius: 25,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  selected: {
    position: "absolute",
    right: -3,
    top: -3,
    height: 17,
    width: 17,
    borderRadius: 9,
    backgroundColor: "#7141BA",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BDA2EB",
  },
  vibeName: {
    fontSize: 10,
    lineHeight: 15,
    color: brand.muted,
    textAlign: "center",
  },
  input: {
    position: "relative",
    zIndex: 1,
    color: "#F9F5FF",
    backgroundColor: "#FFFFFF08",
    borderColor: "#4B386C",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 14,
    minHeight: 50,
    fontSize: 14,
  },
  code: { fontSize: 26, letterSpacing: 4, textAlign: "center", minHeight: 64 },
  note: { fontSize: 11, lineHeight: 18, color: brand.muted },
  primary: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#B578F3",
  },
  primaryFill: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },
  action: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 8,
  },
  line: { flex: 1, height: 1, backgroundColor: "#49365F" },
  or: { color: brand.muted, fontSize: 12 },
  alternative: {
    borderWidth: 1,
    borderColor: "#463264",
    backgroundColor: "#201637C0",
    borderRadius: 20,
    minHeight: 54,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footer: {
    color: "#A79ABB",
    fontSize: 11,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
  },
});
