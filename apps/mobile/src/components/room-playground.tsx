import { useState } from "react";
import { Keyboard, Pressable, ScrollView, TextInput, View } from "react-native";
import type { PlaygroundToday, Pulse, RoomGame } from "../api/contracts";
import { friendlyError, type ApiError } from "../api/client";
import { Banner, Button, palette, Text, styles } from "../ui/primitives";

export function ActiveGameCard({
  game,
  now,
  keyboardVisible,
  myParticipantId,
  owner,
  ready,
  working,
  error,
  onChoice,
  onTurn,
  onEnd,
  onAgain,
}: {
  game: RoomGame;
  now: number;
  keyboardVisible: boolean;
  myParticipantId?: string;
  owner: boolean;
  ready: boolean;
  working: boolean;
  error?: ApiError;
  onChoice(choice: "ROCK" | "PAPER" | "SCISSORS"): void;
  onTurn(title: string, nextCue: string): Promise<boolean>;
  onEnd(): void;
  onAgain(): void;
}) {
  const [title, setTitle] = useState("");
  const [nextCue, setNextCue] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const canEnd = owner || game.starter.participantId === myParticipantId;
  const rps = game.rps;
  const music = game.antakshari;
  const active = game.status === "ACTIVE";
  const remaining = Math.max(
    0,
    Math.ceil((Date.parse(game.deadlineAt) - now) / 1000),
  );
  const idleRemaining = Math.max(
    0,
    Math.ceil((Date.parse(game.lastActionAt) + 300_000 - now) / 1000),
  );
  const waitingForOther = music?.lastPlayerId === myParticipantId;
  const lastTurn = music?.turns.at(-1);
  const winners = rps?.choices?.filter((item) => rps.winnerIds.includes(item.player.participantId)) ?? [];
  const rpsResult = rps?.outcome === "NO_ROUND"
    ? "Not enough picks this round"
    : rps?.outcome === "DRAW"
      ? "It’s a draw"
      : rps?.winnerIds.includes(myParticipantId ?? "")
        ? "You won this round!"
        : winners.length === 1
          ? `${winners[0].player.ghostName} won this round`
          : winners.length > 1
            ? `${winners.length} ghosts won this round`
            : "Round ended";
  return (
    <View
      style={[
        styles.card,
        { gap: 8, padding: 14, borderColor: palette.purple },
      ]}
    >
      <View
        style={[
          styles.row,
          { justifyContent: "space-between", alignItems: "flex-start" },
        ]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontWeight: "800" }}>
            {game.kind === "RPS"
              ? "✊ Rock · Paper · Scissors"
              : "♫ Antakshari"}
          </Text>
          <Text style={styles.caption}>
            {rps && active
              ? `${remaining}s left · ${rps.submittedCount} ${rps.submittedCount === 1 ? "ghost" : "ghosts"} picked`
              : null}
            {rps && !active ? rpsResult : null}
            {music && active
              ? waitingForOther
                ? "Your song is in chat · another ghost is up"
                : music.nextCue
                  ? `Your turn · start with “${music.nextCue}”`
                  : "Your turn · start with any song"
              : null}
            {music && !active ? "Music game ended" : null}
          </Text>
        </View>
        {keyboardVisible && !composerOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show game controls"
            onPress={Keyboard.dismiss}
            style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}
          >
            <Text style={{ color: palette.green, fontWeight: "700" }}>Show</Text>
          </Pressable>
        ) : canEnd && active ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="End game"
            accessibilityState={{ disabled: working || !ready }}
            disabled={working || !ready}
            onPress={onEnd}
            style={{
              minHeight: 44,
              minWidth: 44,
              justifyContent: "center",
              paddingHorizontal: 8,
            }}
          >
            <Text style={styles.caption}>End</Text>
          </Pressable>
        ) : null}
      </View>
      {(!keyboardVisible || composerOpen) && (
        <>
      {rps && (
        <>
          {active ? (
            <>
              {rps.myChoice ? (
                <Text style={styles.caption}>
                  You chose {rps.myChoice.toLowerCase()}. All picks reveal
                  together.
                </Text>
              ) : (
                <View style={[styles.row, { flexWrap: "wrap", gap: 6 }]}>
                  {(["ROCK", "PAPER", "SCISSORS"] as const).map(
                    (choice, index) => (
                      <Pressable
                        key={choice}
                        accessibilityRole="button"
                        accessibilityLabel={`Choose ${choice.toLowerCase()}`}
                        accessibilityState={{
                          disabled: !ready || working,
                          busy: working,
                        }}
                        disabled={!ready || working}
                        onPress={() => onChoice(choice)}
                        style={({ pressed }) => ({
                          flexGrow: 1,
                          minWidth: 88,
                          minHeight: 46,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 14,
                          backgroundColor: palette.raised,
                          borderWidth: 1,
                          borderColor: palette.line,
                          opacity: !ready || working ? 0.5 : pressed ? 0.75 : 1,
                        })}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "700" }}>
                          {["✊ Rock", "✋ Paper", "✌️ Scissors"][index]}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
              )}
            </>
          ) : (
            <>
              {!!rps.choices?.length && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="See everyone's picks"
                  accessibilityState={{ expanded: detailsOpen }}
                  onPress={() => setDetailsOpen(!detailsOpen)}
                  style={{
                    minHeight: 44,
                    justifyContent: "center",
                    alignSelf: "flex-start",
                  }}
                >
                  <Text style={{ color: palette.green, fontWeight: "700" }}>
                    See everyone’s picks {detailsOpen ? "⌃" : "⌄"}
                  </Text>
                </Pressable>
              )}
              {detailsOpen &&
                rps.choices?.map((item) => (
                  <Text key={item.player.participantId} style={styles.caption}>
                    {item.player.participantId === myParticipantId
                      ? "You"
                      : item.player.ghostName}{" "}
                    · {item.choice.toLowerCase()}
                    {rps.winnerIds.includes(item.player.participantId)
                      ? " · winner"
                      : ""}
                  </Text>
                ))}
              <Button
                label="Play another round"
                disabled={!ready || working}
                onPress={onAgain}
              />
            </>
          )}
        </>
      )}
      {music && (
        <>
          {lastTurn && (
            <Text numberOfLines={1} style={styles.caption}>
              Last: {lastTurn.player.ghostName} played {lastTurn.title}
            </Text>
          )}
          {active && (
            <>
              {!waitingForOther && !composerOpen && (
                <Button
                  label="Add a song"
                  disabled={!ready || working}
                  onPress={() => setComposerOpen(true)}
                />
              )}
              {!waitingForOther && composerOpen && (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 240, flexShrink: 1 }}
                  contentContainerStyle={{ gap: 8 }}
                >
                  <Text style={styles.caption}>
                    Enter a song title, then pass a sound to the next ghost. No
                    lyrics needed.
                  </Text>
                  <TextInput
                    accessibilityLabel="Song title"
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Song title"
                    placeholderTextColor={palette.muted}
                    autoCapitalize="words"
                    maxLength={120}
                    style={styles.input}
                  />
                  <TextInput
                    accessibilityLabel="Next sound"
                    value={nextCue}
                    onChangeText={setNextCue}
                    placeholder="Next sound, e.g. M"
                    placeholderTextColor={palette.muted}
                    maxLength={12}
                    style={styles.input}
                  />
                  <Button
                    label="Send song to room"
                    busy={working}
                    disabled={!ready || !title.trim() || !nextCue.trim()}
                    onPress={() => {
                      void onTurn(title.trim(), nextCue.trim()).then((sent) => {
                        if (sent) {
                          setTitle("");
                          setNextCue("");
                          setComposerOpen(false);
                        }
                      });
                    }}
                  />
                  <Button
                    label="Cancel"
                    secondary
                    onPress={() => setComposerOpen(false)}
                  />
                </ScrollView>
              )}
              <Text style={styles.caption}>
                Ends after {Math.ceil(idleRemaining / 60)}m without a song
              </Text>
            </>
          )}
          {music.turns.length > 1 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Recent songs"
              accessibilityState={{ expanded: detailsOpen }}
              onPress={() => setDetailsOpen(!detailsOpen)}
              style={{
                minHeight: 44,
                justifyContent: "center",
                alignSelf: "flex-start",
              }}
            >
              <Text style={{ color: palette.green, fontWeight: "700" }}>
                Recent songs {detailsOpen ? "⌃" : "⌄"}
              </Text>
            </Pressable>
          )}
          {detailsOpen && (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 120 }}
              contentContainerStyle={{ gap: 6 }}
            >
              {music.turns.slice(-5).map((turn) => (
                <Text key={turn.messageId} style={styles.caption}>
                  {turn.player.ghostName}: {turn.title} → {turn.nextCue}
                </Text>
              ))}
            </ScrollView>
          )}
          {!active && (
            <Button
              label="Play another game"
              disabled={!ready || working}
              onPress={onAgain}
            />
          )}
        </>
      )}
        </>
      )}
      {error && <Banner>{friendlyError(error, now)}</Banner>}
    </View>
  );
}

export function PlayMenu({
  today,
  pulse,
  activeGame,
  now,
  working,
  pulseWorking,
  pulseRetryAt,
  error,
  onStart,
  onJoin,
  onStarter,
  onQuickIdea,
  onPulseStart,
  onPulseVote,
  momentStep,
  onMomentStep,
}: {
  today?: PlaygroundToday;
  pulse?: Pulse;
  activeGame?: RoomGame;
  now: number;
  working: boolean;
  pulseWorking: boolean;
  pulseRetryAt: number;
  error?: ApiError;
  onStart(kind: RoomGame["kind"]): Promise<boolean>;
  onJoin(): void;
  onStarter(text: string): void;
  onQuickIdea(ideas: string[]): string;
  onPulseStart(id: string): Promise<boolean>;
  onPulseVote(pulseId: string, option: "A" | "B"): void;
  momentStep: 0 | 1 | 2 | 3 | 4;
  onMomentStep(step: 0 | 1 | 2 | 3 | 4): void;
}) {
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [suggestedIdea, setSuggestedIdea] = useState<string | null>(null);
  const livePulse = pulse && Date.parse(pulse.expiresAt) > now ? pulse : null;
  const ideas = today
    ? [
        today.topic,
        `Story relay: one sentence each. ${today.story}`,
        ...today.prompts,
      ]
    : [];
  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.title, { fontSize: 26 }]}>Play together</Text>
      <Text style={styles.muted}>
        A small moment with the ghosts here right now.
      </Text>
      <View style={[styles.card, { gap: 10, padding: 16, borderColor: palette.purple }]}>
        <Text style={{ fontWeight: "800" }}>
          {momentStep === 0
            ? "✦ Try a room moment"
            : momentStep === 4
              ? "✦ Room moment complete"
              : `✦ Room moment · ${momentStep} of 3`}
        </Text>
        {momentStep === 0 ? (
          <>
            <Text style={styles.caption}>
              Break the ice with today’s question, play a quick round, then open a Pulse. Your guide is only on this screen; the actions you choose are shared with the room.
            </Text>
            <Button label="Start the guide" onPress={() => onMomentStep(1)} />
          </>
        ) : momentStep === 1 ? (
          <>
            <Text style={styles.caption}>Start with a question. You can edit it before sending.</Text>
            <Text>{today?.topic ?? "Loading today’s question…"}</Text>
            <Button
              label="Add question to message"
              disabled={!today}
              onPress={() => {
                if (!today) return;
                onMomentStep(2);
                onStarter(today.topic);
              }}
            />
          </>
        ) : momentStep === 2 ? (
          <>
            <Text style={styles.caption}>Play Rock · Paper · Scissors together.</Text>
            {activeGame?.status === "ACTIVE" ? (
              <Button label="Go to live game" onPress={() => { onMomentStep(3); onJoin(); }} />
            ) : (
              <Button
                label="Start a quick round"
                busy={working}
                onPress={() => {
                  void onStart("RPS").then((started) => { if (started) onMomentStep(3); });
                }}
              />
            )}
          </>
        ) : momentStep === 3 ? (
          <>
            <Text style={styles.caption}>Finish with a choice everyone in the room can answer.</Text>
            <Text>{livePulse?.question ?? today?.pulses[0]?.question ?? "Loading today’s Pulse…"}</Text>
            {livePulse ? (
              <Button label="Pulse is ready · finish guide" onPress={() => onMomentStep(4)} />
            ) : (
              <Button
                label="Start this Pulse"
                busy={pulseWorking}
                disabled={!today?.pulses.length || now < pulseRetryAt}
                onPress={() => {
                  const id = today?.pulses[0]?.id;
                  if (id) void onPulseStart(id).then((started) => { if (started) onMomentStep(4); });
                }}
              />
            )}
          </>
        ) : (
          <>
            <Text style={styles.caption}>
              You added a question to your draft, and opened a game and Pulse in this
              room. Keep talking while this moment lasts.
            </Text>
            <Button label="Start another guide" secondary onPress={() => onMomentStep(1)} />
          </>
        )}
        {momentStep > 0 && momentStep < 4 && (
          <Button label="Leave guide" secondary onPress={() => onMomentStep(0)} />
        )}
      </View>
      {momentStep === 0 && (activeGame?.status === "ACTIVE" ? (
        <View
          style={[
            styles.card,
            { gap: 8, padding: 16, borderColor: palette.purple },
          ]}
        >
          <Text style={{ fontWeight: "800" }}>
            {activeGame.kind === "RPS"
              ? "✊ Round in progress"
              : "♫ Music game in progress"}
          </Text>
          <Text style={styles.caption}>Join the game in this room.</Text>
          <Button label="Go to live game" onPress={onJoin} />
        </View>
      ) : (
        <>
          <View style={[styles.card, { gap: 8, padding: 16 }]}>
            <Text style={{ fontWeight: "800" }}>
              ✊ Rock · Paper · Scissors
            </Text>
            <Text style={styles.caption}>
              Everyone picks privately. Reveal together in 30 seconds.
            </Text>
            <Button
              label="Start a round"
              busy={working}
              onPress={() => { void onStart("RPS"); }}
            />
          </View>
          <View style={[styles.card, { gap: 8, padding: 16 }]}>
            <Text style={{ fontWeight: "800" }}>♫ Antakshari</Text>
            <Text style={styles.caption}>
              Share song titles. Pass the next sound to another ghost.
            </Text>
            <Button
              label="Start a music game"
              secondary
              busy={working}
              onPress={() => { void onStart("ANTAKSHARI"); }}
            />
          </View>
        </>
      ))}
      {error && <Banner>{friendlyError(error, now)}</Banner>}
      {livePulse && (
        <View style={[styles.card, { gap: 8, padding: 16 }]}>
          <Text style={{ fontWeight: "800" }}>⚡ Pulse live</Text>
          <Text>{livePulse.question}</Text>
          {livePulse.results ? (
            <Text style={styles.caption}>
              {livePulse.optionA}: {livePulse.results.A} · {livePulse.optionB}:{" "}
              {livePulse.results.B}
            </Text>
          ) : livePulse.myVote ? (
            <Text style={styles.caption}>
              Your vote is in. Results appear when the Pulse ends.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              <Button
                label={livePulse.optionA}
                secondary
                busy={pulseWorking}
                disabled={now < pulseRetryAt}
                onPress={() => onPulseVote(livePulse.pulseId, "A")}
              />
              <Button
                label={livePulse.optionB}
                secondary
                busy={pulseWorking}
                disabled={now < pulseRetryAt}
                onPress={() => onPulseVote(livePulse.pulseId, "B")}
              />
            </View>
          )}
        </View>
      )}
      {ideas.length > 0 && (
        <Button
          label={suggestedIdea ? "Another conversation idea" : "Give me a conversation idea"}
          secondary
          onPress={() => setSuggestedIdea(onQuickIdea(ideas))}
        />
      )}
      {suggestedIdea && (
        <View style={[styles.card, { gap: 10, padding: 16 }]}>
          <Text style={styles.caption}>TRY THIS IN CHAT</Text>
          <Text>{suggestedIdea}</Text>
          <Button
            label="Add to message"
            onPress={() => onStarter(suggestedIdea)}
          />
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More ideas and Pulses"
        accessibilityState={{ expanded: ideasOpen }}
        onPress={() => setIdeasOpen(!ideasOpen)}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: palette.green, fontWeight: "700" }}>
          More ideas and Pulses {ideasOpen ? "⌃" : "⌄"}
        </Text>
      </Pressable>
      {ideasOpen && (
        <View style={{ gap: 10 }}>
          {!today && (
            <Text style={styles.caption}>
              Loading today’s conversation ideas…
            </Text>
          )}
          {today && (
            <Button
              label={`Ask: ${today.topic}`}
              secondary
              onPress={() => onStarter(today.topic)}
            />
          )}
          {today && (
            <Button
              label="Start today's story"
              secondary
              onPress={() =>
                onStarter(`Story relay: one sentence each. ${today.story}`)
              }
            />
          )}
          {today?.prompts.map((prompt) => (
            <Button
              key={prompt}
              label={prompt}
              secondary
              onPress={() => onStarter(prompt)}
            />
          ))}
          {pulse && !livePulse && pulse.results && (
            <View style={[styles.card, { gap: 6, padding: 16 }]}>
              <Text style={{ fontWeight: "700" }}>Last Pulse · {pulse.question}</Text>
              <Text style={styles.caption}>
                {pulse.optionA}: {pulse.results.A} · {pulse.optionB}: {pulse.results.B}
              </Text>
            </View>
          )}
          {!livePulse &&
            today?.pulses.map((choice) => (
              <Button
                key={choice.id}
                label={`Pulse: ${choice.question}`}
                secondary
                busy={pulseWorking}
                disabled={now < pulseRetryAt}
                onPress={() => onPulseStart(choice.id)}
              />
            ))}
        </View>
      )}
    </View>
  );
}
