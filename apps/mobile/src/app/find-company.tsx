import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { AppState, View, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSession } from "../auth/provider";
import { friendlyError } from "../api/client";
import { MatchingQueue } from "../matching/queue";
import { Banner, Button, Screen, Text, styles } from "../ui/primitives";
export default function FindCompany() {
  const { api, token } = useSession();
  const router = useRouter();
  const queue = useMemo(
    () =>
      new MatchingQueue(api, token, (code) =>
        router.replace({ pathname: "/room/[code]", params: { code } }),
      ),
    [api, token, router],
  );
  const state = useSyncExternalStore(
    queue.subscribe,
    queue.snapshot,
    queue.snapshot,
  );
  const [now, setNow] = useState(Date.now),
    [confirmClear, setConfirmClear] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (AppState.currentState === "active" || AppState.currentState === null)
        void queue.resume();
      const listener = AppState.addEventListener("change", (next) => {
        if (next === "active") void queue.resume();
        else queue.pause();
      });
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => {
        clearInterval(timer);
        listener.remove();
        queue.pause();
      };
    }, [queue]),
  );
  const data = state.data;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>A little company</Text>
        <Text style={styles.muted}>
          A casual conversation in English. No profile to impress anyone with.
          Just show up and be kind.
        </Text>
        <View style={styles.card}>
          <Text>Private text chat · 15 minutes</Text>
          <Text style={styles.muted}>
            Both people can choose another 15 minutes. Either person can end the
            conversation at any time.
          </Text>
        </View>
        {state.error !== undefined && (
          <Banner>{friendlyError(state.error, now)}</Banner>
        )}
        {data?.status === "MATCHED" && data.session ? (
          <Button
            label="Resume conversation"
            onPress={() =>
              router.replace({
                pathname: "/room/[code]",
                params: { code: data.session!.code },
              })
            }
          />
        ) : data?.status === "WAITING" ? (
          <View style={styles.card}>
            <Text>Finding someone…</Text>
            <Text style={styles.muted}>
              {Math.max(
                0,
                Math.ceil((Date.parse(data.search!.expiresAt) - now) / 1000),
              )}{" "}
              seconds remaining. If no one is available, you can try again.
            </Text>
            <Button
              label="Cancel search"
              secondary
              busy={state.busy}
              onPress={() => void queue.cancel()}
            />
          </View>
        ) : (
          <Button
            label={
              data?.matchingEnabled ? "Find someone" : "Check availability"
            }
            busy={state.busy}
            disabled={now < state.retryAt}
            onPress={() => {
              if (data?.matchingEnabled) void queue.start();
              else void queue.resume();
            }}
          />
        )}
        {data && !data.matchingEnabled && (
          <Text style={styles.muted}>
            Finding company isn’t available yet. Existing conversations and
            safety controls remain accessible.
          </Text>
        )}
        {!!data?.blockedCount && (
          <View style={styles.card}>
            <Text>
              {data.blockedCount} blocked {data.blockedCount === 1 ? "person" : "people"}
            </Text>
            <Text style={styles.muted}>
              Blocks prevent future matches and group-room overlap for this anonymous session.
            </Text>
            {confirmClear ? (
              <>
                <Text>
                  Clear all blocks? These people may be matched or share group
                  rooms with you again. You won’t automatically rejoin rooms.
                </Text>
                <Button
                  label="Confirm clear all blocks"
                  danger
                  busy={state.busy}
                  onPress={() => {
                    setConfirmClear(false);
                    void queue.clearBlocks();
                  }}
                />
                <Button
                  label="Keep blocks"
                  secondary
                  onPress={() => setConfirmClear(false)}
                />
              </>
            ) : (
              <Button
                label="Clear all blocks"
                secondary
                onPress={() => setConfirmClear(true)}
              />
            )}
          </View>
        )}
        <Button
          label="Back to Home"
          secondary
          onPress={() => router.replace("/")}
        />
      </ScrollView>
    </Screen>
  );
}
