import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSession } from "../auth/provider";
import type { PlaygroundToday } from "../api/contracts";
import { Text, styles } from "../ui/primitives";

export function DailyTopic() {
  const { api, token } = useSession();
  const [today, setToday] = useState<PlaygroundToday>();
  const day = useRef<string | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    let active = true;
    async function refresh() {
      try {
        const result = await api.today(token);
        if (active) { day.current = result.date; setToday(result); }
      } catch { if (active) setToday(undefined); }
    }
    void refresh();
    const timer = setInterval(() => {
      if (new Date().toISOString().slice(0, 10) !== day.current) void refresh();
    }, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [api, token]));
  if (!today) return null;
  return <View style={styles.card}>
    <Text style={styles.label}>TODAY&apos;S QUESTION</Text>
    <Text style={{ fontSize: 18, fontWeight: "600" }}>{today.topic}</Text>
    <Text style={styles.label}>TODAY&apos;S STORY</Text>
    <Text numberOfLines={2}>{today.story}</Text>
    <Text style={styles.muted}>Continue it together from Playground in any room.</Text>
  </View>;
}
