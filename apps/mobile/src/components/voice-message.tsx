import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Platform, Pressable, View } from "react-native";
import { SymbolView } from "expo-symbols";
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
const MAX_VOICE_BYTES = 5_242_880;
const RECORDING_STOP_BYTES = 4_980_736;

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = String(whole % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`;
}

function VoiceTimeline({
  current,
  duration,
  seekable,
  onSeek,
}: {
  current: number;
  duration: number;
  seekable: boolean;
  onSeek(seconds: number): void;
}) {
  const [dragged, setDragged] = useState<number | null>(null);
  const width = useRef(1);
  const position = Math.min(duration, Math.max(0, dragged ?? current));
  function positionFromTouch(x: number) {
    return duration * Math.min(1, Math.max(0, x / width.current));
  }
  return (
    <View style={{ flex: 1, minWidth: 70, gap: 4 }}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Voice playback position"
        accessibilityValue={{
          min: 0,
          max: Math.ceil(duration),
          now: Math.floor(position),
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (!seekable) return;
          const step = event.nativeEvent.actionName === "increment" ? 5 : -5;
          onSeek(Math.min(duration, Math.max(0, position + step)));
        }}
        onLayout={(event) => {
          width.current = Math.max(1, event.nativeEvent.layout.width);
        }}
        onStartShouldSetResponder={() => seekable}
        onMoveShouldSetResponder={() => seekable}
        onResponderGrant={(event) =>
          setDragged(positionFromTouch(event.nativeEvent.locationX))
        }
        onResponderMove={(event) =>
          setDragged(positionFromTouch(event.nativeEvent.locationX))
        }
        onResponderRelease={(event) => {
          const next = positionFromTouch(event.nativeEvent.locationX);
          setDragged(null);
          onSeek(next);
        }}
        onResponderTerminate={() => setDragged(null)}
        style={{ height: 24, justifyContent: "center" }}
      >
        <View
          style={{ height: 4, borderRadius: 2, backgroundColor: palette.line }}
        >
          <View
            style={{
              height: 4,
              width: `${duration ? (position / duration) * 100 : 0}%`,
              borderRadius: 2,
              backgroundColor: palette.purple,
            }}
          />
        </View>
      </View>
      <Text style={[styles.caption, { fontVariant: ["tabular-nums"] }]}>
        {formatTime(position)} / {formatTime(duration)}
      </Text>
    </View>
  );
}

function waitForForeground(): Promise<void> {
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") finish();
    });
    const timeout = setTimeout(() => {
      subscription.remove();
      reject(new Error("App did not return to the foreground"));
    }, 3_000);
    function finish() {
      clearTimeout(timeout);
      subscription.remove();
      resolve();
    }
    if (AppState.currentState === "active") finish();
  });
}

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
  expanded,
  onExpandedChange,
  onNotice,
  disabledLabel,
  onSent,
}: {
  api: ApiClient;
  token: string;
  code: string;
  ready: boolean;
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
  onNotice(message: string): void;
  disabledLabel: string;
  onSent(message: Message): void;
}) {
  if (Platform.OS === "web") return null;
  return (
    <NativeVoiceComposer
      api={api}
      token={token}
      code={code}
      ready={ready}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      onNotice={onNotice}
      disabledLabel={disabledLabel}
      onSent={onSent}
    />
  );
}

function NativeVoiceComposer({
  api,
  token,
  code,
  ready,
  expanded,
  onExpandedChange,
  onNotice,
  disabledLabel,
  onSent,
}: {
  api: ApiClient;
  token: string;
  code: string;
  ready: boolean;
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
  onNotice(message: string): void;
  disabledLabel: string;
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
  const recordingUriRef = useRef<string | null>(null);
  const startedAt = useRef(0);
  const pressed = useRef(false);
  const configured = useRef(false);
  const phase = useRef<"idle" | "starting" | "recording" | "stopping">("idle");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const alive = useRef(true);

  function clearClip() {
    pressed.current = false;
    if (clipRef.current) preview.pause();
    deleteClip(clipRef.current?.uri);
    clipRef.current = null;
    setClip(null);
    onExpandedChange(false);
  }
  async function finish(discard = false) {
    if (!alive.current || phase.current !== "recording") return;
    phase.current = "stopping";
    pressed.current = false;
    try {
      const status = recorder.getStatus();
      if (status.isRecording) await recorder.stop();
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
      if (!alive.current) {
        deleteClip(recordingUriRef.current ?? undefined);
        return;
      }
      const uri = recorder.uri;
      recordingUriRef.current = uri;
      const durationMs = Date.now() - startedAt.current;
      if (discard || !alive.current) {
        deleteClip(uri ?? undefined);
        onExpandedChange(false);
      } else if (
        uri &&
        durationMs >= 500 &&
        new File(uri).size > 0 &&
        new File(uri).size <= MAX_VOICE_BYTES
      ) {
        const next = { uri, durationMs, key: randomUUID() };
        clipRef.current = next;
        setClip(next);
        preview.replace(uri);
      } else {
        deleteClip(uri ?? undefined);
        onExpandedChange(false);
        onNotice(
          durationMs < 500
            ? "Hold the microphone a little longer."
            : "This clip exceeds 5 MiB. Record a shorter one.",
        );
      }
    } catch {
      deleteClip(recordingUriRef.current ?? undefined);
      if (alive.current) {
        onExpandedChange(false);
        onNotice("Recording could not finish. Try again.");
      }
    } finally {
      phase.current = "idle";
      if (alive.current) setRecording(false);
    }
  }
  async function start() {
    if (!ready || busy || phase.current !== "idle") return;
    phase.current = "starting";
    setStarting(true);
    onExpandedChange(true);
    onNotice("");
    recordingUriRef.current = null;
    try {
      await waitForForeground();
      if (!alive.current || !pressed.current)
        throw new Error("Released before recording started");
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      if (!alive.current) {
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        }).catch(() => {});
        return;
      }
      await recorder.prepareToRecordAsync();
      if (
        !alive.current ||
        !pressed.current ||
        (AppState.currentState && AppState.currentState !== "active")
      )
        throw new Error("Released before recording started");
      recordingUriRef.current = recorder.uri;
      startedAt.current = Date.now();
      recorder.record();
      if (!recorder.getStatus().isRecording)
        throw new Error("Recorder did not start");
      phase.current = "recording";
      setRecording(true);
    } catch {
      if (alive.current) {
        try {
          const status = recorder.getStatus();
          if (status.isRecording || status.canRecord) await recorder.stop();
        } catch {
          // The recorder may already have stopped or been released.
        }
      }
      deleteClip(recordingUriRef.current ?? undefined);
      if (alive.current) {
        onExpandedChange(false);
        onNotice(
          pressed.current
            ? "Could not start recording. Try again."
            : "Hold the microphone a little longer.",
        );
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      }).catch(() => {});
    } finally {
      if (phase.current === "starting") phase.current = "idle";
      if (alive.current) setStarting(false);
    }
  }
  async function send() {
    if (!ready || !clip || busy) return;
    setBusy(true);
    onNotice("");
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
      if (alive.current) onNotice(friendlyError(failure));
    } finally {
      if (alive.current) setBusy(false);
      if (alive.current && AppState.currentState !== "active") clearClip();
    }
  }
  function configureMicrophone() {
    setStarting(true);
    onNotice(
      "Confirm the voice warning and microphone permission, then hold again.",
    );
    Alert.alert(
      "Your voice may identify you",
      "Room members will hear your original voice. Record only if you are comfortable sharing it.",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            if (alive.current) {
              setStarting(false);
              onNotice("");
            }
          },
        },
        {
          text: "Continue",
          onPress: () => {
            void AudioModule.requestRecordingPermissionsAsync()
              .then((permission) => {
                if (!alive.current) return;
                configured.current = permission.granted;
                onNotice(
                  permission.granted
                    ? "Microphone ready. Press and hold to record."
                    : "Microphone permission is needed to record voice.",
                );
              })
              .catch(() => {
                if (alive.current)
                  onNotice("Could not request microphone permission.");
              })
              .finally(() => {
                if (alive.current) setStarting(false);
              });
          },
        },
      ],
    );
  }
  function pressIn() {
    if (!ready || busy || starting || clip) return;
    pressed.current = true;
    if (configured.current) void start();
    else configureMicrophone();
  }
  function pressOut() {
    pressed.current = false;
    if (phase.current === "recording") void finish();
  }
  useEffect(() => {
    if (phase.current === "recording" && recorderState.url)
      recordingUriRef.current = recorderState.url;
  }, [recorderState.url]);
  useEffect(() => {
    if (phase.current !== "recording" || !recordingUriRef.current) return;
    try {
      if (new File(recordingUriRef.current).size >= RECORDING_STOP_BYTES)
        void finish();
    } catch {
      // The final size is validated when recording stops.
    }
  });
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
      pressed.current = false;
      // The hook releases its native recorder during unmount. Do not call it
      // here: a pending bridge call can target an already released object.
      deleteClip(clipRef.current?.uri);
      const recordingUri = recordingUriRef.current;
      setTimeout(() => deleteClip(recordingUri ?? undefined), 100);
      void setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      }).catch(() => {});
    };
  }, [recorder]);

  return (
    <View style={{ flex: expanded ? 1 : undefined, minHeight: 52 }}>
      {clip ? (
        <View style={[styles.row, { alignItems: "center", flex: 1, gap: 6 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              previewState.playing ? "Pause preview" : "Play preview"
            }
            onPress={() => {
              if (previewState.playing) preview.pause();
              else {
                void (async () => {
                  try {
                    if (
                      previewState.currentTime >=
                      clip.durationMs / 1000 - 0.1
                    )
                      await preview.seekTo(0);
                    if (alive.current) preview.play();
                  } catch {
                    if (alive.current) onNotice("Could not play this preview.");
                  }
                })();
              }
            }}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text>{previewState.playing ? "Ⅱ" : "▶"}</Text>
          </Pressable>
          <VoiceTimeline
            current={previewState.currentTime}
            duration={previewState.duration || clip.durationMs / 1000}
            seekable={previewState.isLoaded}
            onSeek={(seconds) => {
              void preview
                .seekTo(seconds)
                .catch(() => onNotice("Could not seek this preview."));
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Discard voice preview"
            disabled={busy}
            onPress={() => {
              clearClip();
              onNotice("");
            }}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text>×</Text>
          </Pressable>
          <Button
            label="Send voice"
            busy={busy}
            disabled={!ready}
            onPress={() => void send()}
          />
        </View>
      ) : (
        <View
          style={[
            styles.row,
            { alignItems: "center", flex: expanded ? 1 : undefined },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              ready ? "Press and hold to record voice" : disabledLabel
            }
            accessibilityState={{ disabled: !ready || busy }}
            disabled={!ready || busy}
            onPressIn={pressIn}
            onPressOut={pressOut}
            style={({ pressed: down }) => ({
              minWidth: 52,
              minHeight: 52,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: recording || down ? palette.pink : palette.line,
              backgroundColor: palette.raised,
              opacity: !ready || busy ? 0.45 : 1,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <SymbolView
              name={{ ios: "mic.fill", android: "mic", web: "mic" }}
              size={22}
              tintColor={recording ? palette.pink : palette.text}
            />
          </Pressable>
          {expanded && (
            <Text
              style={{
                color: recording ? palette.pink : palette.muted,
                fontVariant: ["tabular-nums"],
                flex: 1,
              }}
            >
              {recording
                ? `● Recording ${formatTime(recorderState.durationMillis / 1000)} · release to stop`
                : "Preparing microphone…"}
            </Text>
          )}
        </View>
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
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const sourceMessageId = useRef<string | null>(null);
  const [playbackError, setPlaybackError] = useState("");
  useEffect(() => {
    if (!ready) player.pause();
  }, [ready, player]);
  const duration = status.duration || (message.voice?.durationMs ?? 0) / 1000;
  async function togglePlayback() {
    if (status.playing) {
      player.pause();
      return;
    }
    setPlaybackError("");
    try {
      if (sourceMessageId.current !== message.messageId) {
        player.replace({
          uri: api.voiceUrl(code, message.messageId),
          headers: { Authorization: `Bearer ${token}` },
        });
        sourceMessageId.current = message.messageId;
      } else if (duration > 0 && status.currentTime >= duration - 0.1) {
        await player.seekTo(0);
      }
      player.play();
    } catch {
      setPlaybackError("Could not play this voice message.");
    }
  }
  return (
    <View style={{ minWidth: 220, gap: 3 }}>
      <View
        style={{
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${status.playing ? "Pause" : "Play"} voice message`}
          disabled={!ready}
          onPress={() => void togglePlayback()}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 21 }}>{status.playing ? "Ⅱ" : "▶"}</Text>
        </Pressable>
        <VoiceTimeline
          current={status.currentTime}
          duration={duration}
          seekable={ready && status.isLoaded}
          onSeek={(seconds) => {
            void player
              .seekTo(seconds)
              .catch(() =>
                setPlaybackError("Could not seek this voice message."),
              );
          }}
        />
      </View>
      {!!playbackError && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.caption, { color: "#FFC5CF" }]}
        >
          {playbackError}
        </Text>
      )}
    </View>
  );
}
