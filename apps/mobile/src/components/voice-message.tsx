import { useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, View } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { ApiClient, friendlyError } from "../api/client";
import type { Message } from "../api/contracts";
import { Button, palette, Text, styles } from "../ui/primitives";

type Clip = { uri: string; durationMs: number; key: string };

function deleteClip(uri?: string) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The OS may have already removed a cache file.
  }
}

export function VoiceComposer({
  api,
  token,
  code,
  ready,
  onSent,
}: {
  api: ApiClient;
  token: string;
  code: string;
  ready: boolean;
  onSent(message: Message): void;
}) {
  if (Platform.OS === "web") return null;
  return (
    <NativeVoiceComposer
      api={api}
      token={token}
      code={code}
      ready={ready}
      onSent={onSent}
    />
  );
}

function NativeVoiceComposer({
  api,
  token,
  code,
  ready,
  onSent,
}: {
  api: ApiClient;
  token: string;
  code: string;
  ready: boolean;
  onSent(message: Message): void;
}) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    numberOfChannels: 1,
    bitRate: 64000,
  });
  const recorderState = useAudioRecorderState(recorder, 200);
  const preview = useAudioPlayer(null);
  const previewState = useAudioPlayerStatus(preview);
  const [clip, setClip] = useState<Clip | null>(null);
  const clipRef = useRef<Clip | null>(null);
  const startedAt = useRef(0);
  const phase = useRef<"idle" | "recording" | "stopping">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const alive = useRef(true);

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function clearClip() {
    preview.pause();
    preview.replace(null);
    deleteClip(clipRef.current?.uri);
    clipRef.current = null;
    setClip(null);
  }
  async function finish(discard = false) {
    if (phase.current !== "recording") return;
    phase.current = "stopping";
    clearTimer();
    try {
      if ((await recorder.getStatus()).isRecording) await recorder.stop();
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
      const uri = recorder.uri;
      const durationMs = Math.min(10_000, Date.now() - startedAt.current);
      if (discard || !alive.current) {
        deleteClip(uri ?? undefined);
      } else if (
        uri &&
        durationMs > 0 &&
        new File(uri).size > 0 &&
        new File(uri).size <= 262_144
      ) {
        const next = { uri, durationMs, key: randomUUID() };
        clipRef.current = next;
        setClip(next);
        preview.replace(uri);
      } else {
        deleteClip(uri ?? undefined);
        setError("This clip is too large or empty. Record a shorter one.");
      }
    } catch {
      deleteClip(recorder.uri ?? undefined);
      if (alive.current) setError("Recording could not finish. Try again.");
    } finally {
      phase.current = "idle";
      if (alive.current) setRecording(false);
    }
  }
  async function start() {
    if (!ready || busy || phase.current !== "idle") return;
    setError("");
    clearClip();
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        if (alive.current)
          setError("Microphone permission is needed to record a voice message.");
        return;
      }
      if (!alive.current || (AppState.currentState && AppState.currentState !== "active")) return;
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await recorder.prepareToRecordAsync();
      if (!alive.current || (AppState.currentState && AppState.currentState !== "active"))
        throw new Error("Room no longer active");
      startedAt.current = Date.now();
      phase.current = "recording";
      recorder.record({ forDuration: 10 });
      setRecording(true);
      timer.current = setTimeout(() => void finish(), 9_900);
    } catch {
      phase.current = "idle";
      if (alive.current) {
        setRecording(false);
        setError(
          "Could not start recording. Check microphone permission and try again.",
        );
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      }).catch(() => {});
    }
  }
  async function send() {
    if (!ready || !clip || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.sendVoice(
        token,
        code,
        clip.key,
        clip.durationMs,
        new File(clip.uri),
      );
      if (alive.current) {
        onSent(result.message);
        clearClip();
      } else deleteClip(clip.uri);
    } catch (failure) {
      if (alive.current) setError(friendlyError(failure));
    } finally {
      if (alive.current) setBusy(false);
      if (alive.current && AppState.currentState !== "active") clearClip();
    }
  }
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        if (phase.current === "recording") void finish(true);
        else if (!busy) clearClip();
      }
    });
    return () => subscription.remove();
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      void (async () => {
        if (phase.current === "recording")
          await recorder.stop().catch(() => {});
        deleteClip(clipRef.current?.uri);
        deleteClip(recorder.uri ?? undefined);
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        }).catch(() => {});
      })();
    };
  }, [recorder]);

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.caption}>
        Your original voice may identify you. Record only if you are comfortable
        sharing it with this room.
      </Text>
      {recording ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: palette.pink }}>
            ● Recording ·{" "}
            {Math.min(10, Math.ceil(recorderState.durationMillis / 1000))}/10s
          </Text>
          <View style={styles.row}>
            <Button label="Stop" onPress={() => void finish()} />
            <Button label="Discard" secondary onPress={() => void finish(true)} />
          </View>
        </View>
      ) : clip ? (
        <View style={{ gap: 8 }}>
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <Text>Voice preview · {Math.ceil(clip.durationMs / 1000)}s</Text>
            <Button
              label={previewState.playing ? "Pause" : "Play"}
              secondary
              onPress={() => {
                if (previewState.playing) preview.pause();
                else {
                  void preview.seekTo(0);
                  preview.play();
                }
              }}
            />
          </View>
          <View style={styles.row}>
            <Button
              label="Discard"
              secondary
              disabled={busy}
              onPress={clearClip}
            />
            <Button
              label="Send voice"
              busy={busy}
              disabled={!ready}
              onPress={() => void send()}
            />
          </View>
        </View>
      ) : (
        <Button
          label="Record voice · 10s max"
          secondary
          disabled={!ready}
          onPress={() => void start()}
        />
      )}
      {!!error && (
        <Text accessibilityLiveRegion="polite" style={{ color: "#FFC5CF" }}>
          {error}
        </Text>
      )}
    </View>
  );
}

export function VoiceBubble({
  api,
  token,
  code,
  message,
  ready,
}: {
  api: ApiClient;
  token: string;
  code: string;
  message: Message;
  ready: boolean;
}) {
  if (Platform.OS === "web")
    return (
      <Text style={styles.caption}>
        Voice message · open the mobile app to listen
      </Text>
    );
  return (
    <NativeVoiceBubble
      api={api}
      token={token}
      code={code}
      message={message}
      ready={ready}
    />
  );
}

function NativeVoiceBubble({
  api,
  token,
  code,
  message,
  ready,
}: {
  api: ApiClient;
  token: string;
  code: string;
  message: Message;
  ready: boolean;
}) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  useEffect(() => () => player.pause(), [player]);
  useEffect(() => {
    if (!ready) player.pause();
  }, [ready, player]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${status.playing ? "Pause" : "Play"} voice message, ${Math.ceil((message.voice?.durationMs ?? 0) / 1000)} seconds`}
      disabled={!ready}
      onPress={() => {
        if (status.playing) player.pause();
        else {
          player.replace({
            uri: api.voiceUrl(code, message.messageId),
            headers: { Authorization: `Bearer ${token}` },
          });
          player.play();
        }
      }}
      style={{
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 21 }}>{status.playing ? "Ⅱ" : "▶"}</Text>
      <Text>Voice · {Math.ceil((message.voice?.durationMs ?? 0) / 1000)}s</Text>
    </Pressable>
  );
}
