import { ConversationControls } from "../../matching/conversation-controls";
import { conversationStarters } from "../../matching/starters";
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
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { SymbolView } from "expo-symbols";
import { useSession } from "../../auth/provider";
import { ApiError, friendlyError, normalizeCode } from "../../api/client";
import {
  REPORT_REASONS,
  REACTIONS,
  type Message,
  type ReportReason,
} from "../../api/contracts";
import { RoomShare } from "../../components/room-share";
import { RoomSession } from "../../rooms/room-session";
import { socketTransport } from "../../messaging/transport";
import { firstMessagePart, validText } from "../../messaging/history";
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
        (failure) => session.rejectAccess(token, new ApiError(failure)),
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
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const input = useRef<TextInput>(null);
  const [showStarters, setShowStarters] = useState(false);
  const [inputHeight, setInputHeight] = useState(52);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
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
          setReplyTo(null);
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
    const text = firstMessagePart(draft);
    if (!ready || !validText(text) || sendRateLimited) return;
    // Clear synchronously so a slow ack cannot erase text typed for the next message.
    setDraft(draft.slice(text.length));
    const target = replyTo?.messageId;
    setReplyTo(null);
    const accepted = await controller.send(text, undefined, target);
    if (accepted) {
      setNearLatest(true);
      list.current?.scrollToOffset({ offset: 0, animated: true });
    } else if (!["blocked", "expired"].includes(controller.state.status)) {
      setDraft((current) => text + current);
      if (replyTo) setReplyTo(replyTo);
    }
  }
  function backToRooms() {
    if (router.canGoBack()) router.back();
    else router.replace("/my-rooms");
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Screen
        bottomInset={!keyboardVisible}
        style={{
          minHeight: 0,
          width: "100%",
          maxWidth: 800,
          alignSelf: "center",
        }}
      >
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: keyboardVisible ? 4 : 8,
            gap: keyboardVisible ? 0 : 6,
            borderBottomWidth: 1,
            borderColor: palette.line,
          }}
        >
          <View style={[styles.row, { gap: 6 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back, keep room membership"
              onPress={backToRooms}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 14,
                borderWidth: 1,
                borderColor: palette.line,
                backgroundColor: palette.raised,
              }}
            >
              <SymbolView name={{ ios: "chevron.left", android: "arrow_back", web: "arrow_back" }} size={20} tintColor={palette.text} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "800" }}>
                {state.details?.room.name || vibeLabel(state.details?.room.vibe)}
              </Text>
              {!keyboardVisible && (
                <Text numberOfLines={1} accessibilityLiveRegion="polite" style={styles.caption}>
                  {statusLabel} · {state.status === "expired"
                    ? "Ended"
                    : expires
                      ? `${countdown} left`
                      : "Temporary by design"}
                  {state.membership
                    ? ` · ${avatar(state.membership.ghostAvatar)} ${state.membership.ghostName}`
                    : ""}
                </Text>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View room members"
              disabled={!ready}
              onPress={() => {
                setModal("members");
                void controller.refreshMembers();
              }}
              style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Text numberOfLines={1} style={styles.caption}>
                👻 {state.members?.total ?? "—"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                state.details?.room.kind === "MATCHED"
                  ? "End conversation"
                  : "Leave Room"
              }
              onPress={() => setModal("leave")}
              style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: palette.pink, fontWeight: "700" }}>
                {state.details?.room.kind === "MATCHED" ? "End" : "Leave"}
              </Text>
            </Pressable>
          </View>
          {!keyboardVisible && state.details?.room.kind === "GROUP" && (
            <RoomShare code={code} inviteId={state.details.room.inviteId} />
          )}
          {!keyboardVisible && state.details?.room.matchId && (
            <ConversationControls
              id={state.details.room.matchId}
              controller={controller}
              now={now}
            />
          )}
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
          style={{ flex: 1, minHeight: 0 }}
          onLayout={() => {
            if (nearLatest)
              list.current?.scrollToOffset({ offset: 0, animated: false });
          }}
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
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
                      {
                        color: own ? "#B99AFF" : palette.muted,
                        flexShrink: 1,
                      },
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
                  {item.replyTo && (
                    <View
                      style={{
                        borderLeftWidth: 2,
                        borderColor: palette.purple,
                        paddingLeft: 8,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={styles.caption}>
                        Reply to {item.replyTo.author.ghostName}
                      </Text>
                      <Text numberOfLines={2} style={styles.caption}>
                        {item.replyTo.text}
                      </Text>
                    </View>
                  )}
                  <Text selectable style={{ lineHeight: 23 }}>
                    {item.text}
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  style={{ flexGrow: 0, height: 40 }}
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={[styles.row, { gap: 4, alignItems: "center" }]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Reply to ${item.author.ghostName}`}
                    disabled={!ready}
                    onPress={() => {
                      setReplyTo(item);
                      input.current?.focus();
                    }}
                    style={{
                      minHeight: 36,
                      justifyContent: "center",
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text style={styles.caption}>Reply</Text>
                  </Pressable>
                  {REACTIONS.map((type) => {
                    const reaction = item.reactions?.find(
                      (entry) => entry.type === type,
                    );
                    const emoji = {
                      FIRE: "🔥",
                      LAUGH: "😂",
                      SHOCK: "😱",
                      MIND_BLOWN: "🤯",
                      LIKE: "👍",
                      LOVE: "❤️",
                      SAD: "😢",
                      ANGRY: "😡",
                    }[type];
                    return (
                      <Pressable
                        key={type}
                        accessibilityRole="button"
                        accessibilityLabel={`${reaction?.mine ? "Remove" : "Add"} ${type} reaction`}
                        disabled={!ready}
                        onPress={() =>
                          void controller.react(item.messageId, type)
                        }
                        style={{
                          minHeight: 36,
                          justifyContent: "center",
                          paddingHorizontal: 5,
                          opacity: reaction?.mine ? 1 : 0.65,
                        }}
                      >
                        <Text style={styles.caption}>
                          {emoji}
                          {reaction?.count ? ` ${reaction.count}` : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
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
            style={{ maxHeight: keyboardVisible ? 80 : 140, flexShrink: 1 }}
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
            paddingHorizontal: 16,
            paddingTop: keyboardVisible ? 8 : 16,
            paddingBottom: keyboardVisible ? 4 : 16,
            gap: keyboardVisible ? 0 : 8,
            borderTopWidth: 1,
            borderColor: palette.line,
          }}
        >
          {replyTo && (
            <View
              style={[
                styles.row,
                { justifyContent: "space-between", alignItems: "center" },
              ]}
            >
              <Text numberOfLines={1} style={[styles.caption, { flex: 1 }]}>
                Reply to {replyTo.author.ghostName}: {replyTo.text}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
                onPress={() => setReplyTo(null)}
                style={{
                  minWidth: 44,
                  minHeight: 36,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text>×</Text>
              </Pressable>
            </View>
          )}
          {!keyboardVisible &&
            state.details?.room.kind === "MATCHED" &&
            ready && (
              <View style={{ gap: 6 }}>
                <Button
                  label={
                    showStarters
                      ? "Hide conversation starters"
                      : "Need a conversation starter?"
                  }
                  secondary
                  onPress={() => setShowStarters((value) => !value)}
                />
                {showStarters && (
                  <ScrollView
                    horizontal
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {conversationStarters.map((starter) => (
                      <Button
                        key={starter}
                        label={`Try: ${starter}`}
                        secondary
                        onPress={() => {
                          setDraft(starter);
                          setShowStarters(false);
                        }}
                      />
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
          <View style={[styles.row, { alignItems: "flex-end" }]}>
            <TextInput
              ref={input}
              accessibilityLabel="Message"
              value={draft}
              onChangeText={setDraft}
              onContentSizeChange={(event) =>
                setInputHeight(
                  Math.min(
                    130,
                    Math.max(52, event.nativeEvent.contentSize.height),
                  ),
                )
              }
              scrollEnabled
              textAlignVertical="top"
              placeholder={
                ready ? "Say something real…" : "Waiting for your room…"
              }
              placeholderTextColor={palette.muted}
              editable={ready}
              multiline
              style={[
                styles.input,
                {
                  flex: 1,
                  height: draft ? inputHeight : 52,
                  maxHeight: 130,
                  minHeight: 52,
                  paddingTop: 15,
                },
              ]}
            />
            <Button
              label={draft.length > 2000 ? "Send first part ↑" : "Send ↑"}
              disabled={
                !ready || !validText(firstMessagePart(draft)) || sendRateLimited
              }
              onPress={() => void send()}
            />
          </View>
          {draft.length > 2000 && (
            <Text style={styles.caption}>
              Long paste: send the first part, then send what remains.
            </Text>
          )}
          {!keyboardVisible && (
            <Text style={[styles.caption, { textAlign: "right" }]}>
              {sendRateLimited
                ? `Pause for ${Math.ceil((Math.max(state.retryAt, state.sendRetryAt) - now) / 1000)}s · `
                : ""}
              {draft.length} characters · 2,000 per message
            </Text>
          )}
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
                    {state.details?.room.kind === "MATCHED"
                      ? "Ending closes this private conversation for both people. It cannot be rejoined."
                      : `You can rejoin with ${code} while the room is still open. Your ghost name and role will be waiting.`}
                  </Text>
                  <Button
                    label={
                      state.details?.room.kind === "MATCHED"
                        ? "End conversation"
                        : "Leave Room"
                    }
                    danger
                    busy={working}
                    onPress={() => {
                      setWorking(true);
                      void controller
                        .leave()
                        .then((left) => {
                          if (left) router.dismissTo("/my-rooms");
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
      </Screen>
    </KeyboardAvoidingView>
  );
}
