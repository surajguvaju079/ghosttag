import { useCallback, useRef, useState } from "react";
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
import type { DiscoverRoom } from "../../api/contracts";
import { vibeLabel } from "../../rooms/vibes";
import { Banner, Button, Screen, Text, styles } from "../../ui/primitives";

export default function Discover() {
  const { api, token } = useSession();
  const router = useRouter();
  const [rooms, setRooms] = useState<DiscoverRoom[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<unknown>();
  const [now, setNow] = useState(Date.now);
  const epoch = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++epoch.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await api.discoverRooms(token);
      if (request !== epoch.current) return;
      setRooms(result.rooms);
      setCursor(result.nextCursor);
      setLoaded(true);
    } catch (failure) {
      if (request === epoch.current) setError(failure);
    } finally {
      if (request === epoch.current) setLoading(false);
    }
  }, [api, token]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") void refresh();
      });
      const timer = setInterval(() => setNow(Date.now()), 10000);
      return () => {
        epoch.current++;
        listener.remove();
        clearInterval(timer);
      };
    }, [refresh]),
  );

  async function loadMore() {
    if (!cursor || loading) return;
    const request = ++epoch.current;
    setLoading(true);
    try {
      const result = await api.discoverRooms(token, cursor);
      if (request !== epoch.current) return;
      setRooms((current) => [
        ...current,
        ...result.rooms.filter(
          (room) => !current.some((item) => item.inviteId === room.inviteId),
        ),
      ]);
      setCursor(result.nextCursor);
    } catch (failure) {
      if (request === epoch.current) setError(failure);
    } finally {
      if (request === epoch.current) setLoading(false);
    }
  }
  async function join(room: DiscoverRoom) {
    if (!room.inviteId || joining) return;
    setJoining(room.inviteId);
    setError(undefined);
    try {
      const code = await api.joinInvite(token, room.code, room.inviteId);
      router.push({ pathname: "/room/[code]", params: { code } });
    } catch (failure) {
      setError(failure);
    } finally {
      setJoining(null);
    }
  }
  const visible = rooms.filter((room) => Date.parse(room.expiresAt) > now);
  return (
    <Screen bottomInset={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor="#B99AFF"
          />
        }
      >
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.muted}>
          Drop into a conversation that feels right. Rooms here are listed by
          their hosts.
        </Text>
        {loading && !loaded && <ActivityIndicator color="#B99AFF" />}
        {error !== undefined && <Banner>{friendlyError(error, now)}</Banner>}
        {loaded && visible.length === 0 && (
          <View style={styles.card}>
            <Text>No rooms are listed right now.</Text>
            <Text style={styles.muted}>
              Check back later, or create a room and invite someone.
            </Text>
            <Button
              label="Create a room"
              onPress={() => router.navigate("/")}
            />
          </View>
        )}
        {visible.map((room) => (
          <View key={room.inviteId} style={styles.card}>
            <Text style={{ fontSize: 20, fontWeight: "700" }}>
              {vibeLabel(room.vibe)}
            </Text>
            <Text style={styles.muted}>
              {room.activeMemberCount} of 50 people ·{" "}
              {Math.max(
                1,
                Math.ceil((Date.parse(room.expiresAt) - now) / 60000),
              )}{" "}
              min left
            </Text>
            <Button
              label="Join room"
              busy={joining === room.inviteId}
              disabled={!!joining}
              onPress={() => void join(room)}
            />
          </View>
        ))}
        {!!cursor && (
          <Button
            label="Show more rooms"
            secondary
            busy={loading}
            onPress={() => void loadMore()}
          />
        )}
      </ScrollView>
    </Screen>
  );
}
