import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useSession } from "../../auth/provider";
import { friendlyError, normalizeCode } from "../../api/client";
import {
  REPORT_REASONS,
  type Message,
  type ReportReason,
} from "../../api/contracts";
import { RoomSession } from "../../rooms/room-session";
import { socketTransport } from "../../messaging/transport";
import { validText } from "../../messaging/history";
import { avatar, vibeLabel } from "../../rooms/vibes";
import {
  Banner,
  Button,
  palette,
  Screen,
  styles,
  Text,
} from "../../ui/primitives";

export default function RoomRoute() {
  const params = useLocalSearchParams<{ code: string }>();
  let code: string;
  try {
    code = normalizeCode(typeof params.code === "string" ? params.code : "");
  } catch {
    return <InvalidRoom />;
  }
  return <RoomScreen key={code} code={code} />;
}
function InvalidRoom() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.title}>That code looks off.</Text>
        <Button label="Back to home" onPress={() => router.replace("/")} />
      </View>
    </Screen>
  );
}
function RoomScreen({ code }: { code: string }) {
  const { api, token, session, socketUrl } = useSession();
  const router = useRouter();
  const controller = useMemo(
    () =>
      new RoomSession(
        api,
        token,
        code,
        () => socketTransport(socketUrl, token),
        randomUUID,
        session.invalidate,
      ),
    [api, token, code, socketUrl, session],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState("");
  const [modal, setModal] = useState<"members" | "leave" | "report" | null>(
    null,
  );
  const [selected, setSelected] = useState<Message | null>(null);
  const [reason, setReason] = useState<ReportReason>("SPAM");
  const [working, setWorking] = useState(false);
  const list = useRef<FlatList<Message>>(null);
  const [nearLatest, setNearLatest] = useState(true);
  useEffect(() => () => controller.dispose(), [controller]);
  useFocusEffect(
    useCallback(() => {
      const subscription = AppState.addEventListener("change", (next) => {
        if (next === "active") void controller.start();
        else controller.pause();
      });
      const unsubscribe = controller.subscribe(() => {
        if (["blocked", "expired"].includes(controller.state.status)) {
          setDraft("");
          setSelected(null);
          setModal(null);
        }
      });
      const timer = setInterval(() => {
        const time = Date.now();
        setNow(time);
        const expiration = controller.state.details?.room.expiresAt;
        if (
          expiration &&
          time >= Date.parse(expiration) &&
          controller.state.status !== "expired"
        )
          controller.expire();
      }, 1000);
      // Register invalidation listeners before start(), which can expire synchronously.
      if (AppState.currentState === "active" || AppState.currentState === null)
        void controller.start();
      return () => {
        clearInterval(timer);
        unsubscribe();
        subscription.remove();
        controller.pause();
      };
    }, [controller]),
  );
  const expires = state.details
    ? Date.parse(state.details.room.expiresAt)
    : undefined;
  const remaining = expires ? Math.max(0, expires - now) : 0;
  const countdown = `${Math.floor(remaining / 3600000)
    .toString()
    .padStart(2, "0")}:${Math.floor((remaining / 60000) % 60)
    .toString()
    .padStart(2, "0")}:${Math.floor((remaining / 1000) % 60)
    .toString()
    .padStart(2, "0")}`;
  const ready =
    state.status === "ready" && (expires === undefined || now < expires);
  const rateLimited = now < state.retryAt;
  const sendRateLimited = rateLimited || now < state.sendRetryAt;
  const reportRateLimited = rateLimited || now < state.reportRetryAt;
  const statusLabel = {
    loading: "Opening your room…",
    recovering: "Catching up…",
    ready: "Connected",
    offline: "Offline · reconnecting",
    blocked: "Room unavailable",
    expired: "This moment has ended",
  }[state.status];
  async function send() {
    const text = draft;
    if (!ready || !validText(text) || sendRateLimited) return;
    // Clear synchronously so a slow ack cannot erase text typed for the next message.
    setDraft("");
    const accepted = await controller.send(text);
    if (accepted) {
      setNearLatest(true);
      list.current?.scrollToOffset({ offset: 0, animated: true });
    } else if (!["blocked", "expired"].includes(controller.state.status))
      setDraft((current) => current || text);
  }
  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1, width: "100%", maxWidth: 800, alignSelf: "center" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            padding: 20,
            gap: 16,
            borderBottomWidth: 1,
            borderColor: palette.line,
          }}
        >
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to home, keep room membership"
              onPress={() => router.replace("/")}
              style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ fontSize: 25 }}>←</Text>
            </Pressable>
            <View style={[styles.pill, { flexDirection: "row", gap: 8 }]}>
              <Text
                style={{
                  color: "#CBB7FF",
                  fontWeight: "800",
                  letterSpacing: 2,
                }}
              >
                {code}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Leave Room"
              onPress={() => setModal("leave")}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ color: palette.pink, fontWeight: "700" }}>
                Leave
              </Text>
            </Pressable>
          </View>
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                numberOfLines={2}
                style={{ fontSize: 24, fontWeight: "800", letterSpacing: -0.7 }}
              >
                {state.details?.room.name ||
                  vibeLabel(state.details?.room.vibe)}
              </Text>
              <Text style={styles.caption}>
                {vibeLabel(state.details?.room.vibe)} ·{" "}
                {state.status === "expired"
                  ? "Ended"
                  : expires
                    ? `${countdown} left`
                    : "Temporary by design"}
              </Text>
            </View>
            <Button
              label={`👻 ${state.members?.total ?? "—"}/${state.details?.room.maxCapacity ?? 50}`}
              secondary
              disabled={!ready}
              onPress={() => {
                setModal("members");
                void controller.refreshMembers();
              }}
            />
          </View>
          <View style={styles.row}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: ready ? palette.green : palette.pink,
              }}
            />
            <Text accessibilityLiveRegion="polite" style={styles.caption}>
              {statusLabel}
            </Text>
            {state.membership && (
              <Text
                style={[styles.caption, { flex: 1, textAlign: "right" }]}
                numberOfLines={1}
              >
                {avatar(state.membership.ghostAvatar)}{" "}
                {state.membership.ghostName} ·{" "}
                {state.membership.role.toLowerCase()}
              </Text>
            )}
          </View>
        </View>
        {state.error && (
          <View style={{ padding: 12, gap: 8 }}>
            <Banner>{friendlyError(state.error, now)}</Banner>
            {(state.status === "offline" || state.status === "blocked") && (
              <Button
                secondary
                label={
                  state.error.failure.code === "ROOM_MEMBERSHIP_INACTIVE" ||
                  state.error.failure.code === "ROOM_MEMBERSHIP_REQUIRED"
                    ? "Rejoin room"
                    : "Retry connection"
                }
                disabled={rateLimited}
                onPress={() => {
                  if (state.error?.failure.statusCode === 403)
                    void controller.rejoin();
                  else void controller.start();
                }}
              />
            )}
          </View>
        )}
        {state.notice && (
          <View style={{ padding: 12 }}>
            <Banner good>{state.notice}</Banner>
          </View>
        )}
        <FlatList
          ref={list}
          data={state.messages}
          inverted
          keyExtractor={(item) => item.messageId}
          contentContainerStyle={{ padding: 20, gap: 16, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          onScroll={(event) =>
            setNearLatest(event.nativeEvent.contentOffset.y < 100)
          }
          scrollEventThrottle={100}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 100,
          }}
          ListEmptyComponent={
            <View
              style={{
                transform: [{ scaleY: -1 }],
                paddingVertical: 40,
                alignItems: "center",
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 48 }}>👻</Text>
              <Text style={{ fontWeight: "700", fontSize: 20 }}>
                {state.status === "expired"
                  ? "Gone, as promised."
                  : state.status === "loading" || state.status === "recovering"
                    ? "Finding the conversation…"
                    : "Someone has to say it first."}
              </Text>
              <Text style={[styles.muted, { textAlign: "center" }]}>
                {state.status === "expired"
                  ? "Head home to start another moment."
                  : "Keep it kind. Keep it in the room."}
              </Text>
              {state.status === "expired" && (
                <Button
                  label="Back to home"
                  onPress={() => router.replace("/")}
                />
              )}
            </View>
          }
          ListFooterComponent={
            state.nextCursor ? (
              <Button
                label="Load older messages"
                secondary
                busy={state.loadingOlder}
                disabled={!ready || rateLimited}
                onPress={() => void controller.older()}
              />
            ) : null
          }
          renderItem={({ item }) => {
            const own =
              item.author.participantId === state.participant?.participantId;
            return (
              <View
                style={{
                  alignSelf: own ? "flex-end" : "flex-start",
                  maxWidth: "92%",
                  minWidth: 150,
                  gap: 7,
                }}
              >
                <View style={[styles.row, { gap: 6 }]}>
                  <Text style={{ fontSize: 18 }}>
                    {avatar(item.author.ghostAvatar)}
                  </Text>
                  <Text
                    style={[
                      styles.caption,
                      { color: own ? "#B99AFF" : palette.muted, flexShrink: 1 },
                    ]}
                  >
                    {item.author.ghostName}
                    {own ? " · you" : ""}
                  </Text>
                  <Text
                    accessibilityLabel="Room participant label"
                    style={{ fontSize: 10, color: palette.muted }}
                  >
                    · {item.author.participantId.slice(-6)}
                  </Text>
                </View>
                <View
                  style={{
                    padding: 14,
                    backgroundColor: own ? "#352453" : palette.card,
                    borderRadius: 18,
                    borderTopLeftRadius: own ? 18 : 4,
                    borderTopRightRadius: own ? 4 : 18,
                  }}
                >
                  <Text selectable style={{ lineHeight: 23 }}>
                    {item.text}
                  </Text>
                </View>
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  <Text style={{ color: palette.muted, fontSize: 10 }}>
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Report message by ${item.author.ghostName}`}
                    disabled={!ready}
                    onPress={() => {
                      setSelected(item);
                      setReason("SPAM");
                      setModal("report");
                    }}
                    style={{
                      minHeight: 44,
                      minWidth: 48,
                      alignItems: "flex-end",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: palette.muted, fontSize: 11 }}>
                      Report
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
        {!nearLatest && (
          <View
            style={{ position: "absolute", bottom: 180, alignSelf: "center" }}
          >
            <Button
              label="↓ Latest messages"
              onPress={() => {
                list.current?.scrollToOffset({ offset: 0, animated: true });
                setNearLatest(true);
              }}
            />
          </View>
        )}
        {state.pending.length > 0 && (
          <ScrollView
            style={{ maxHeight: 140 }}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          >
            {state.pending.map((item) => (
              <View
                key={item.key}
                style={[
                  styles.row,
                  {
                    alignItems: "center",
                    backgroundColor: "#241F2E",
                    padding: 12,
                    borderRadius: 12,
                  },
                ]}
              >
                <Text
                  numberOfLines={2}
                  style={{ flex: 1, color: palette.muted }}
                >
                  {item.text}
                </Text>
                {item.sending ? (
                  <Text style={styles.caption}>Sending…</Text>
                ) : (
                  <Button
                    label="Retry send"
                    secondary
                    disabled={!ready || sendRateLimited}
                    onPress={() => void controller.send(item.text, item.key)}
                  />
                )}
              </View>
            ))}
          </ScrollView>
        )}
        <View
          style={{
            padding: 16,
            gap: 8,
            borderTopWidth: 1,
            borderColor: palette.line,
          }}
        >
          <View style={[styles.row, { alignItems: "flex-end" }]}>
            <TextInput
              accessibilityLabel="Message"
              value={draft}
              onChangeText={setDraft}
              placeholder={
                ready ? "Say something real…" : "Waiting for your room…"
              }
              placeholderTextColor={palette.muted}
              editable={ready}
              multiline
              maxLength={2000}
              style={[
                styles.input,
                { flex: 1, maxHeight: 130, minHeight: 52, paddingTop: 15 },
              ]}
            />
            <Button
              label="Send ↑"
              disabled={!ready || !validText(draft) || sendRateLimited}
              onPress={() => void send()}
            />
          </View>
          <Text style={[styles.caption, { textAlign: "right" }]}>
            {sendRateLimited
              ? `Pause for ${Math.ceil((Math.max(state.retryAt, state.sendRetryAt) - now) / 1000)}s · `
              : ""}
            {draft.length}/2000 · Text stays in this temporary room
          </Text>
        </View>
        <Modal
          visible={modal !== null}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!working) setModal(null);
          }}
        >
          <View style={styles.modal}>
            <View style={styles.modalCard}>
              {modal === "members" && (
                <>
                  <Text style={styles.title}>In the room</Text>
                  <Text style={styles.muted}>
                    {state.members?.total ?? 0} ghosts · names can repeat
                  </Text>
                  <ScrollView contentContainerStyle={{ gap: 16 }}>
                    {state.members?.members.map((member, index) => (
                      <View
                        key={`${member.joinedAt}-${index}`}
                        style={styles.row}
                      >
                        <Text style={{ fontSize: 28 }}>
                          {avatar(member.ghostAvatar)}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: "700" }}>
                            {member.ghostName}
                          </Text>
                          <Text style={styles.caption}>
                            {member.role.toLowerCase()} · joined{" "}
                            {new Date(member.joinedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </>
              )}
              {modal === "leave" && (
                <>
                  <Text style={styles.title}>Slip away?</Text>
                  <Text style={styles.muted}>
                    You can rejoin with {code} while the room is still open.
                    Your ghost name and role will be waiting.
                  </Text>
                  <Button
                    label="Leave Room"
                    danger
                    busy={working}
                    onPress={() => {
                      setWorking(true);
                      void controller
                        .leave()
                        .then((left) => {
                          if (left) router.replace("/");
                          else setModal(null);
                        })
                        .finally(() => setWorking(false));
                    }}
                  />
                </>
              )}
              {modal === "report" && (
                <>
                  <Text style={styles.title}>Look out for the room.</Text>
                  <Text style={styles.muted}>
                    Choose a reason, then confirm. Your identity is not shared
                    with other participants.
                  </Text>
                  <ScrollView>
                    {REPORT_REASONS.map((value) => (
                      <Pressable
                        key={value}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: reason === value }}
                        onPress={() => setReason(value)}
                        style={{
                          minHeight: 48,
                          justifyContent: "center",
                          paddingHorizontal: 12,
                          borderRadius: 12,
                          backgroundColor:
                            reason === value ? "#352453" : "transparent",
                        }}
                      >
                        <Text>
                          {value.toLowerCase().replaceAll("_", " ")}
                          {reason === value ? "  ✓" : ""}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {reportRateLimited && (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.caption}
                    >
                      Reports available in{" "}
                      {Math.ceil(
                        (Math.max(state.retryAt, state.reportRetryAt) - now) /
                          1000,
                      )}
                      s. You can still send messages.
                    </Text>
                  )}
                  <Button
                    label="Confirm report"
                    busy={working}
                    disabled={!ready || reportRateLimited}
                    onPress={() => {
                      if (!selected) return;
                      setWorking(true);
                      void controller
                        .report(selected.messageId, reason)
                        .then(() => {
                          setModal(null);
                          setSelected(null);
                        })
                        .finally(() => setWorking(false));
                    }}
                  />
                </>
              )}
              <Button
                label={modal === "members" ? "Back to conversation" : "Cancel"}
                secondary
                disabled={working}
                onPress={() => {
                  setModal(null);
                  setSelected(null);
                }}
              />
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Screen>
  );
}
