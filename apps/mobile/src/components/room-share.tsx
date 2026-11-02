import { inviteLink } from "../linking/invites";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Share, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { SymbolView } from "expo-symbols";
import { palette, Text, styles } from "../ui/primitives";
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
          feedback("Copy the link or code to share this room.");
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
    <View style={{ gap: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          padding: 6,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: palette.line,
          backgroundColor: palette.card,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy code"
          onPress={() => void copy()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
            minHeight: 44,
            paddingHorizontal: 8,
            borderRadius: 10,
            backgroundColor: palette.raised,
          }}
        >
          <Text numberOfLines={1} style={{ fontWeight: "800", color: "#CBB7FF", fontSize: 13 }}>
            {code}
          </Text>
          <SymbolView name={{ ios: "doc.on.doc", android: "content_copy", web: "content_copy" }} size={17} tintColor={palette.text} />
        </Pressable>
        {inviteId && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy link"
            onPress={() => void copy(true)}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              borderRadius: 10,
              backgroundColor: palette.raised,
            }}
          >
            <Text numberOfLines={1} ellipsizeMode="middle" style={[styles.caption, { flex: 1 }]}>
              {inviteLink(code, inviteId)}
            </Text>
            <SymbolView name={{ ios: "doc.on.doc", android: "content_copy", web: "content_copy" }} size={17} tintColor={palette.text} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share room"
          onPress={() => void share()}
          style={{
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            backgroundColor: palette.purple,
          }}
        >
          <SymbolView name={{ ios: "square.and.arrow.up", android: "share", web: "share" }} size={19} tintColor={palette.text} />
        </Pressable>
      </View>
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={styles.caption}>
          {notice}
        </Text>
      )}
    </View>
  );
}
