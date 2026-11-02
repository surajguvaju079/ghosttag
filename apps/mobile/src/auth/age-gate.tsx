import { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, View } from "react-native";
import { BrandMark, BrandScreen } from "../ui/brand";
import { Banner, Button, Text, styles, palette } from "../ui/primitives";
import Safety from "../components/safety-content";
import { ApiError, friendlyError } from "../api/client";
import type { Session, SessionState } from "./session";

const months = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];

function maxBirthDay(year: number, month: number, today: Date) {
  const calendarDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return year === today.getUTCFullYear() && month === today.getUTCMonth() + 1
    ? Math.min(calendarDays, today.getUTCDate())
    : calendarDays;
}

export function AgeGate({
  state,
  session,
}: {
  state: SessionState;
  session: Session;
}) {
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [choosing, setChoosing] = useState<"year" | "month" | "day" | null>(null);
  const [safety, setSafety] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (safety) return <Safety bottomInset onClose={() => setSafety(false)} />;
  const retryAt = state.error instanceof ApiError ? state.error.retryAt : 0;
  const today = new Date(now);
  const daysInMonth = year && month ? maxBirthDay(year, month, today) : 0;
  const choices =
    choosing === "year"
      ? Array.from(
          { length: today.getUTCFullYear() - 1899 },
          (_, index) => today.getUTCFullYear() - index,
        )
      : choosing === "month"
        ? months
            .map((_, index) => index + 1)
            .filter(
              (value) =>
                year !== today.getUTCFullYear() ||
                value <= today.getUTCMonth() + 1,
            )
        : Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const birthday =
    year && month && day
      ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      : null;
  function clearBirthday() {
    setYear(null);
    setMonth(null);
    setDay(null);
    setChoosing(null);
  }
  function choose(value: number) {
    if (choosing === "year") {
      setYear(value);
      if (
        month &&
        value === today.getUTCFullYear() &&
        month > today.getUTCMonth() + 1
      ) {
        setMonth(null);
        setDay(null);
      } else if (month && day && day > maxBirthDay(value, month, today)) {
        setDay(null);
      }
    } else if (choosing === "month") {
      setMonth(value);
      if (year && day && day > maxBirthDay(year, value, today)) setDay(null);
    } else if (choosing === "day") {
      setDay(value);
    }
    setChoosing(null);
  }
  return (
    <BrandScreen>
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { flexGrow: 1, justifyContent: "center" },
          ]}
        >
          <BrandMark compact />
          <Text style={styles.title}>
            {state.status === "screening"
              ? "Your date of birth"
              : state.status === "ineligible"
                ? "GhostTag isn’t available"
                : "A little more time"}
          </Text>
          {state.status === "screening" ? (
            <>
              <Text style={styles.muted}>
                Select your birth date to check eligibility. We keep the
                eligibility result, not your birthday. Your birthday is never
                shown to other people.
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["year", "month", "day"] as const).map((part) => (
                  <Pressable
                    key={part}
                    accessibilityRole="button"
                    accessibilityLabel={`Select birth ${part}`}
                    accessibilityState={{
                      disabled:
                        state.assessing || (part === "day" && (!year || !month)),
                    }}
                    disabled={
                      state.assessing || (part === "day" && (!year || !month))
                    }
                    onPress={() => setChoosing(part)}
                    style={{
                      flex: part === "month" ? 1.3 : 1,
                      minWidth: 0,
                      minHeight: 56,
                      paddingHorizontal: 10,
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: palette.line,
                      borderRadius: 14,
                      backgroundColor: palette.card,
                      opacity: part === "day" && (!year || !month) ? 0.5 : 1,
                    }}
                  >
                    <Text style={styles.caption}>
                      {part[0].toUpperCase() + part.slice(1)}
                    </Text>
                    <Text numberOfLines={1} style={{ fontWeight: "700" }}>
                      {part === "year"
                        ? year ?? "Select"
                        : part === "month"
                          ? month
                            ? months[month - 1].slice(0, 3)
                            : "Select"
                          : day ?? "Select"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {state.error !== undefined && (
                <Banner>{friendlyError(state.error, now)}</Banner>
              )}
              <Button
                label="Continue"
                busy={state.assessing}
                disabled={!birthday || now < retryAt}
                onPress={() => {
                  if (!birthday) return;
                  void session.assessAge(birthday).finally(clearBirthday);
                }}
              />
            </>
          ) : (
            <>
              <Text style={styles.muted}>
                {state.status === "ineligible"
                  ? "Based on the information provided, you aren’t eligible to use GhostTag. Rooms and messages are unavailable."
                  : "GhostTag’s social features aren’t available yet. Your anonymous session and room memberships are preserved."}
              </Text>
              {state.status === "unavailable" && (
                <Button
                  label="Check availability"
                  secondary
                  onPress={() => void session.revalidate()}
                />
              )}
            </>
          )}
          <View>
            <Button
              label="Safety & privacy"
              secondary
              onPress={() => {
                clearBirthday();
                setSafety(true);
              }}
            />
          </View>
        </ScrollView>
        <Modal
          visible={choosing !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setChoosing(null)}
        >
          <View style={styles.modal}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close date selector"
              onPress={() => setChoosing(null)}
              style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
            />
            <View
              style={[
                styles.modalCard,
                { maxWidth: 360, height: "70%", padding: 16, gap: 8 },
              ]}
            >
              <Text style={{ fontSize: 19, fontWeight: "800" }}>
                Select birth {choosing}
              </Text>
              <FlatList
                data={choices}
                keyExtractor={(item) => String(item)}
                initialNumToRender={40}
                getItemLayout={(_, index) => ({
                  length: 48,
                  offset: 48 * index,
                  index,
                })}
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      choosing === "month" ? months[item - 1] : String(item)
                    }
                    onPress={() => choose(item)}
                    style={{
                      height: 48,
                      justifyContent: "center",
                      paddingHorizontal: 12,
                      borderBottomWidth: 1,
                      borderColor: palette.line,
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>
                      {choosing === "month" ? months[item - 1] : item}
                    </Text>
                  </Pressable>
                )}
              />
              <Button label="Cancel" secondary onPress={() => setChoosing(null)} />
            </View>
          </View>
        </Modal>
      </View>
    </BrandScreen>
  );
}
