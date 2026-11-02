import { useCallback, useState, useRef } from "react";
import { AppState, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSession } from "../auth/provider";
import { asApiError, friendlyError } from "../api/client";
import type { MatchSession } from "../api/contracts";
import type { RoomSession } from "../rooms/room-session";
import { Banner, Button, Text, styles } from "../ui/primitives";
export function ConversationControls({
  id,
  controller,
  now,
}: {
  id: string;
  controller: RoomSession;
  now: number;
}) {
  const { api, token } = useSession();
  const active = useRef(false);
  const router = useRouter();
  const [match, setMatch] = useState<MatchSession | null>(null);
  const [working, setWorking] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState<unknown>();
  const [retryAt, setRetryAt] = useState(0);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      let live = true,
        foreground =
          AppState.currentState === "active" || AppState.currentState === null,
        loading = false,
        nextRetry = 0;
      async function refresh() {
        if (!live || !foreground || loading || Date.now() < nextRetry) return;
        loading = true;
        try {
          const state = await api.matchingState(token);
          if (!live || !foreground) return;
          const current = state.session?.id === id ? state.session : null;
          setMatch(current);
          if (!current) controller.expire();
          else if (
            controller.state.details?.room.expiresAt !== current.expiresAt ||
            controller.state.status === "expired"
          )
            await controller.refreshMatchedRoom();
        } catch (error) {
          nextRetry = asApiError(error).retryAt;
          if (live && foreground) setError(error);
        } finally {
          loading = false;
        }
      }
      void refresh();
      const listener = AppState.addEventListener("change", (state) => {
        foreground = state === "active";
        if (foreground) void refresh();
      });
      const timer = setInterval(() => void refresh(), 5000);
      return () => {
        live = false;
        active.current = false;
        clearInterval(timer);
        listener.remove();
      };
    }, [api, token, id, controller]),
  );
  async function action(type: "extend" | "block") {
    if (working || Date.now() < retryAt) return;
    setWorking(true);
    setError(undefined);
    try {
      const result = await api.matchAction(token, id, type);
      if (!active.current) return;
      if (type === "block") {
        controller.expire();
        router.dismissTo("/my-rooms");
      } else {
        setMatch(result.session);
        await controller.refreshMatchedRoom();
      }
    } catch (error) {
      setError(error);
      setRetryAt(asApiError(error).retryAt);
    } finally {
      setWorking(false);
      setConfirm(false);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.caption}>
        {match?.extended
          ? "Both chose to stay · 30-minute maximum"
          : match?.partnerRequested
            ? "Your partner would like another 15 minutes."
            : match?.extensionRequested
              ? "Waiting for your partner to agree to another 15 minutes."
              : "A private conversation for two. Either person can end it."}
      </Text>
      <View style={[styles.row, { flexWrap: "wrap" }]}>
        {!!match && !match.extended && (
          <Button
            label="Stay another 15 minutes"
            secondary
            disabled={working || match.extensionRequested || now < retryAt}
            onPress={() => void action("extend")}
          />
        )}
        <Button
          label="Block and end"
          secondary
          disabled={working || now < retryAt}
          onPress={() => setConfirm(true)}
        />
      </View>
      {confirm && (
        <>
          <Text style={styles.muted}>
            End this chat and prevent future matches with this person? This
            won’t submit a message report or filter group rooms.
          </Text>
          <Button
            label="Confirm block and end"
            danger
            busy={working}
            onPress={() => void action("block")}
          />
          <Button
            label="Cancel block"
            secondary
            onPress={() => setConfirm(false)}
          />
        </>
      )}
      {error !== undefined && <Banner>{friendlyError(error)}</Banner>}
    </View>
  );
}
