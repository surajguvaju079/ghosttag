import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSession } from "../auth/provider";
import { browserPreview } from "../auth/credential-store";
import { ApiError, asApiError, friendlyError } from "../api/client";
import type { Vibe } from "../api/contracts";
import { vibes } from "../rooms/vibes";
import {
  Banner,
  Button,
  palette,
  Screen,
  styles,
  Text,
} from "../ui/primitives";
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
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View
            style={[
              styles.row,
              { justifyContent: "space-between", marginTop: 12 },
            ]}
          >
            <Text style={styles.logo}>
              GhostTag<Text style={{ color: palette.purple }}>✦</Text>
            </Text>
            <View style={styles.pill}>
              <Text
                style={{
                  color: "#CBB7FF",
                  fontSize: 10,
                  fontWeight: "800",
                  letterSpacing: 1,
                }}
              >
                HERE FOR A MOMENT
              </Text>
            </View>
          </View>
          <View style={{ marginVertical: 14, gap: 18 }}>
            <Text
              style={{
                fontSize: 54,
                lineHeight: 58,
                fontWeight: "900",
                letterSpacing: -2.7,
              }}
            >
              Say it.{"\n"}Vote it.{"\n"}
              <Text
                style={{
                  fontSize: 54,
                  lineHeight: 58,
                  color: palette.purple,
                  fontWeight: "900",
                }}
              >
                Forget it.
              </Text>
            </Text>
            <Text style={[styles.muted, { maxWidth: 350 }]}>
              Find your people for right now. Pick a vibe, become a ghost, and
              see where it goes.
            </Text>
          </View>
          <View
            style={[
              styles.row,
              { backgroundColor: palette.card, padding: 5, borderRadius: 18 },
            ]}
          >
            {(["create", "join"] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === value }}
                onPress={() => {
                  setMode(value);
                  setError(undefined);
                }}
                style={{
                  flex: 1,
                  minHeight: 48,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 13,
                  backgroundColor:
                    mode === value ? palette.raised : "transparent",
                }}
              >
                <Text
                  style={{
                    fontWeight: "700",
                    color: mode === value ? palette.text : palette.muted,
                  }}
                >
                  {value === "create" ? "✦  Create Room" : "↗  Join Room"}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.card}>
            {mode === "create" ? (
              <>
                <Text style={styles.label}>WHAT’S THE VIBE?</Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
                >
                  {vibes.map((item) => (
                    <Pressable
                      key={item.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: vibe === item.value }}
                      accessibilityLabel={item.label}
                      onPress={() => setVibe(item.value)}
                      style={{
                        width: "48%",
                        flexGrow: 1,
                        padding: 15,
                        gap: 8,
                        minHeight: 122,
                        borderRadius: 17,
                        borderWidth: 1,
                        borderColor:
                          vibe === item.value ? item.color : palette.line,
                        backgroundColor:
                          vibe === item.value ? "#282035" : "#151416",
                      }}
                    >
                      <Text style={{ color: item.color, fontSize: 30 }}>
                        {item.emoji}
                      </Text>
                      <Text style={{ fontWeight: "700", fontSize: 15 }}>
                        {item.label}
                      </Text>
                      <Text style={{ color: palette.muted, fontSize: 11 }}>
                        {item.hint}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.label}>ROOM NAME · OPTIONAL</Text>
                <TextInput
                  accessibilityLabel="Room name"
                  placeholder="Give this moment a name"
                  placeholderTextColor={palette.muted}
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                />
              </>
            ) : (
              <>
                <Text style={styles.title}>Got a code?</Text>
                <Text style={styles.muted}>
                  Your next conversation is one room code away.
                </Text>
                <TextInput
                  accessibilityLabel="Room code"
                  placeholder="GH-4829"
                  placeholderTextColor={palette.muted}
                  style={[
                    styles.input,
                    { fontSize: 27, letterSpacing: 4, textAlign: "center" },
                  ]}
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                  onSubmitEditing={() => void enter()}
                />
              </>
            )}
            {error !== undefined && <Banner>{friendlyError(error)}</Banner>}
            <Button
              label={
                mode === "create" ? "Create a moment  →" : "Enter the room  →"
              }
              busy={busy}
              onPress={() => void enter()}
            />
          </View>
          <Text style={[styles.caption, { textAlign: "center" }]}>
            A fresh identity in every room. No profiles. No followers.{"\n"}
            Rooms disappear after 24 hours.
          </Text>
          {browserPreview && (
            <Text style={[styles.caption, { textAlign: "center" }]}>
              Browser preview · session resets on page reload.{"\n"}Voting is
              coming later. This MVP is for conversation.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
