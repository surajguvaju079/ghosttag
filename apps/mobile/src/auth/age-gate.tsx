import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { BrandMark, BrandScreen } from "../ui/brand";
import { Banner, Button, Text, styles, palette } from "../ui/primitives";
import Safety from "../components/safety-content";
import { ApiError, friendlyError } from "../api/client";
import type { Session, SessionState } from "./session";

export function AgeGate({
  state,
  session,
}: {
  state: SessionState;
  session: Session;
}) {
  const [birthday, setBirthday] = useState("");
  const [safety, setSafety] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (safety) return <Safety bottomInset onClose={() => setSafety(false)} />;
  const retryAt = state.error instanceof ApiError ? state.error.retryAt : 0;
  return (
    <BrandScreen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
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
                Enter your birth date to check eligibility. We keep the
                eligibility result, not your birthday. Your birthday is never
                shown to other people.
              </Text>
              <TextInput
                accessibilityLabel="Date of birth"
                placeholder="YYYY-MM-DD"
                placeholderTextColor={palette.muted}
                value={birthday}
                onChangeText={setBirthday}
                style={styles.input}
                maxLength={10}
                autoCorrect={false}
                autoCapitalize="none"
                editable={!state.assessing}
                keyboardType="numbers-and-punctuation"
              />
              {state.error !== undefined && (
                <Banner>{friendlyError(state.error, now)}</Banner>
              )}
              <Button
                label="Continue"
                busy={state.assessing}
                disabled={
                  !/^\d{4}-\d{2}-\d{2}$/.test(birthday) || now < retryAt
                }
                onPress={() => {
                  void session
                    .assessAge(birthday)
                    .finally(() => setBirthday(""));
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
                setBirthday("");
                setSafety(true);
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BrandScreen>
  );
}
