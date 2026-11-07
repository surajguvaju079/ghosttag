import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSession } from "../../auth/provider";
import { friendlyError } from "../../api/client";
import type { DiscoverRoom, Vibe } from "../../api/contracts";
import { vibeLabel, vibes } from "../../rooms/vibes";
import { DailyTopic } from "../../components/daily-topic";
import { Banner, Button, Screen, Text, styles } from "../../ui/primitives";
import { brand } from "../../ui/brand";

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
  const [selectedVibe, setSelectedVibe] = useState<Vibe | null>(null);
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
      await refresh();
      setError(failure);
    } finally {
      setJoining(null);
    }
  }
  const visible = rooms.filter((room) => Date.parse(room.expiresAt) > now);
  const filtered = selectedVibe
    ? visible.filter((room) => room.vibe === selectedVibe)
    : visible;
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
        <View style={discover.heading}>
          <Text style={styles.title}>Discover</Text>
          <Text style={discover.headingMark} accessibilityElementsHidden>
            ✦
          </Text>
        </View>
        <Text style={styles.muted}>
          Drop into a conversation that feels right. Rooms here are listed by
          their hosts.
        </Text>
        <DailyTopic />
        {loaded && visible.length > 0 && (
          <View style={{ gap: 12 }}>
            <Text style={styles.label}>FIND YOUR VIBE</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={discover.filters}
            >
              {([{ value: null, label: "All", emoji: "✦" }, ...vibes] as const).map(
                (item) => {
                  const selected = selectedVibe === item.value;
                  return (
                    <Pressable
                      key={item.value ?? "all"}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.label} rooms`}
                      accessibilityState={{ selected }}
                      onPress={() => setSelectedVibe(item.value)}
                      style={({ pressed }) => [
                        discover.filter,
                        selected && discover.filterSelected,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text
                        style={[
                          discover.filterText,
                          selected && discover.filterTextSelected,
                        ]}
                      >
                        {item.emoji} {item.label}
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </ScrollView>
            <Text style={styles.caption}>
              {filtered.length} {filtered.length === 1 ? "room" : "rooms"} shown
              {cursor ? " · More rooms available" : ""}
            </Text>
          </View>
        )}
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
        {loaded && visible.length > 0 && filtered.length === 0 && (
          <View style={styles.card}>
            <Text style={discover.emptyTitle}>
              No {vibeLabel(selectedVibe ?? undefined).toLowerCase()} rooms in
              the loaded results
            </Text>
            <Text style={styles.muted}>Try another vibe or load more rooms.</Text>
            <Button
              label="Show all vibes"
              secondary
              onPress={() => setSelectedVibe(null)}
            />
          </View>
        )}
        {filtered.map((room) => (
          <View key={room.inviteId} style={discover.roomCard}>
            <View style={discover.roomTop}>
              <View style={discover.roomIcon}>
                <Text style={discover.roomIconText}>
                  {vibes.find((item) => item.value === room.vibe)?.emoji ?? "✦"}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={discover.roomTitle}>{vibeLabel(room.vibe)}</Text>
                <Text style={styles.caption}>{room.code}</Text>
              </View>
              <View style={discover.liveBadge}>
                <Text style={discover.liveText}>● OPEN</Text>
              </View>
            </View>
            <View style={discover.roomDetails}>
              <Text style={discover.detail}>
                {room.activeMemberCount}{" "}
                {room.activeMemberCount === 1 ? "person" : "people"} here
              </Text>
              <Text style={discover.detail}>·</Text>
              <Text style={discover.detail}>
                {Math.max(
                  1,
                  Math.ceil((Date.parse(room.expiresAt) - now) / 60000),
                )}{" "}
                min left
              </Text>
            </View>
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

const discover = StyleSheet.create({
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headingMark: { color: brand.lavender, fontSize: 28 },
  filters: { gap: 8, paddingRight: 24 },
  filter: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#4A3B64",
    backgroundColor: "#211A33",
    alignItems: "center",
    justifyContent: "center",
  },
  filterSelected: { backgroundColor: "#493177", borderColor: "#AC8AEB" },
  filterText: { color: "#C7BBD8", fontSize: 13, fontWeight: "600" },
  filterTextSelected: { color: "#FFFFFF" },
  roomCard: {
    backgroundColor: "#1D172A",
    borderColor: "#48365F",
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 16,
  },
  roomTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  roomIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#39284F",
    alignItems: "center",
    justifyContent: "center",
  },
  roomIconText: { color: "#D8C2FF", fontSize: 26 },
  roomTitle: { fontSize: 19, fontWeight: "700" },
  liveBadge: {
    borderRadius: 20,
    backgroundColor: "#1E493B",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  liveText: {
    color: "#A4F1CB",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  roomDetails: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  detail: { color: "#C7BBD8", fontSize: 13 },
  emptyTitle: { fontSize: 17, fontWeight: "700" },
});
