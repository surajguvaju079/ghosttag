import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  AppState,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSession } from "../../auth/provider";
import { friendlyError } from "../../api/client";
import type { JoinedRoom } from "../../api/contracts";
import { JoinedRoomsController, visibleRooms } from "../../rooms/joined-rooms";
import { vibeLabel } from "../../rooms/vibes";
import { RoomShare } from "../../components/room-share";
import { Banner, Button, Screen, Text, styles } from "../../ui/primitives";

export default function MyRooms() {
  const { api, token } = useSession();
  const router = useRouter();
  const controller = useMemo(
    () => new JoinedRoomsController(api, token),
    [api, token],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  const [now, setNow] = useState(Date.now);
  useFocusEffect(
    useCallback(() => {
      void controller.refresh();
      const listener = AppState.addEventListener("change", (next) => {
        if (next === "active") {
          setNow(Date.now());
          void controller.refresh();
        }
      });
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => {
        clearInterval(timer);
        listener.remove();
        controller.cancel();
      };
    }, [controller]),
  );
  const rooms = visibleRooms(state.rooms, now);
  async function enter(room: JoinedRoom) {
    if (room.membershipStatus === "LEFT" && !(await controller.rejoin(room)))
      return;
    router.push({ pathname: "/room/[code]", params: { code: room.code } });
  }
  return (
    <Screen bottomInset={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.loading}
            onRefresh={() => void controller.refresh()}
            tintColor="#B99AFF"
          />
        }
      >
        <Text style={styles.title}>My Rooms</Text>
        <Text style={styles.muted}>
          Your moments are still here. Return before they disappear.
        </Text>
        {state.loading && !state.loaded && (
          <ActivityIndicator color="#B99AFF" />
        )}
        {state.error !== undefined && (
          <View style={{ gap: 12 }}>
            <Banner>{friendlyError(state.error, now)}</Banner>
            <Button
              label="Try again"
              disabled={now < state.retryAt || state.loading}
              onPress={() => void controller.refresh()}
            />
          </View>
        )}
        {state.loaded && rooms.length === 0 && (
          <View style={styles.card}>
            <Text>No open rooms yet.</Text>
            <Text style={styles.muted}>
              Create a room or enter a friend’s code to get started.
            </Text>
            <Button
              label="Create or join a room"
              onPress={() => router.navigate("/")}
            />
          </View>
        )}
        {(["ACTIVE", "LEFT"] as const).map((status) => {
          const group = rooms.filter(
            (room) => room.membershipStatus === status,
          );
          if (!group.length) return null;
          return (
            <View key={status} style={{ gap: 16 }}>
              <Text style={styles.label}>
                {status === "ACTIVE" ? "CURRENT ROOMS" : "PREVIOUSLY LEFT"}
              </Text>
              {group.map((room) => {
                const locked =
                  !!room.lockedUntil && Date.parse(room.lockedUntil) > now;
                const minutes = Math.max(
                  1,
                  Math.ceil((Date.parse(room.expiresAt) - now) / 60000),
                );
                return (
                  <View key={room.code} style={styles.card}>
                    <Text style={{ fontSize: 22, fontWeight: "700" }}>
                      {room.name || room.code}
                    </Text>
                    <Text style={styles.muted}>
                      {room.code} · {vibeLabel(room.vibe)}
                    </Text>
                    <Text style={styles.caption}>
                      {Math.floor(minutes / 60)}h {minutes % 60}m remaining
                      {locked ? " · Temporarily locked" : ""}
                    </Text>
                    <Button
                      label={
                        locked
                          ? "Temporarily locked"
                          : status === "ACTIVE"
                            ? room.kind === "MATCHED"
                              ? "Resume"
                              : "Open"
                            : "Rejoin"
                      }
                      busy={state.workingCode === room.code}
                      disabled={
                        locked || !!state.workingCode || now < state.retryAt
                      }
                      onPress={() => void enter(room)}
                    />
                    {room.kind !== "MATCHED" && (
                      <RoomShare code={room.code} inviteId={room.inviteId} />
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
