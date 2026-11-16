import { useCallback, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSession } from "../auth/provider";
import type { JoinedRoom } from "../api/contracts";
import { visibleRooms } from "../rooms/joined-rooms";
import { vibeLabel } from "../rooms/vibes";
import { Button, palette, Text, styles } from "../ui/primitives";

export function ReturningRoomCue() {
  const { api, token } = useSession();
  const router = useRouter();
  const [room, setRoom] = useState<JoinedRoom>();
  const [dismissedCode, setDismissedCode] = useState<string>();
  const [now, setNow] = useState(Date.now);

  useFocusEffect(useCallback(() => {
    let active = true;
    let request = 0;
    async function refresh() {
      const current = ++request;
      try {
        const { rooms } = await api.rooms(token);
        if (!active || current !== request) return;
        const now = Date.now();
        setNow(now);
        setRoom(visibleRooms(rooms, now)
          .filter((item) => item.membershipStatus === "ACTIVE" && (!item.lockedUntil || Date.parse(item.lockedUntil) <= now))
          .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))[0]);
      } catch {
        if (active && current === request) setRoom(undefined);
      }
    }
    void refresh();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => { active = false; request++; listener.remove(); clearInterval(timer); };
  }, [api, token]));

  if (!room || room.code === dismissedCode || Date.parse(room.expiresAt) <= now) return null;
  return (
    <View style={[styles.card, { gap: 8, padding: 14, borderColor: palette.purple }]}>
      <View style={[styles.row, { alignItems: "center", justifyContent: "space-between" }]}>
        <Text style={{ fontWeight: "800" }}>✦ Your room is still open</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss room reminder"
          onPress={() => setDismissedCode(room.code)}
          style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={styles.caption}>×</Text>
        </Pressable>
      </View>
      <Text style={styles.caption}>
        {room.name || vibeLabel(room.vibe)} · Return while this moment lasts.
      </Text>
      <Button
        label="Return to room"
        secondary
        onPress={() => router.push({ pathname: "/room/[code]", params: { code: room.code } })}
      />
    </View>
  );
}
