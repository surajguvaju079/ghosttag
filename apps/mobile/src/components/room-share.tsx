import { inviteLink } from "../linking/invites";
import { useEffect, useRef, useState } from "react";
import { Platform, Share, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button, Text, styles } from "../ui/primitives";
import { inviteMessage } from "../rooms/joined-rooms";

export function RoomShare({
  code,
  inviteId,
}: {
  code: string;
  inviteId?: string | null;
}) {
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function feedback(value: string) {
    clearTimeout(timer.current);
    setNotice(value);
    timer.current = setTimeout(() => setNotice(""), 3500);
  }
  async function copy(link = false) {
    try {
      const copied = await Clipboard.setStringAsync(
        link && inviteId ? inviteLink(code, inviteId) : code,
      );
      feedback(
        copied
          ? link
            ? "Room link copied"
            : "Room code copied"
          : "Couldn’t copy. Try again.",
      );
    } catch {
      feedback("Couldn’t copy. Try again.");
    }
  }
  async function share() {
    try {
      if (Platform.OS === "web") {
        if (!navigator.share) {
          feedback("Use Copy code to share this room.");
          return;
        }
        await navigator.share({ text: inviteMessage(code, inviteId) });
      } else await Share.share({ message: inviteMessage(code, inviteId) });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        feedback("Couldn’t share. Try again or copy the code.");
    }
  }
  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.row, { flexWrap: "wrap" }]}>
        <Button label="Copy code" secondary onPress={() => void copy()} />
        {inviteId && (
          <Button label="Copy link" secondary onPress={() => void copy(true)} />
        )}
        <Button label="Share" secondary onPress={() => void share()} />
      </View>
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={styles.caption}>
          {notice}
        </Text>
      )}
    </View>
  );
}
