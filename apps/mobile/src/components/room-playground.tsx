import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import type { PlaygroundToday, Pulse, RoomGame } from "../api/contracts";
import { friendlyError, type ApiError } from "../api/client";
import { Banner, Button, palette, Text, styles } from "../ui/primitives";

export function ActiveGameCard({
  game,
  now,
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
  const canEnd = owner || game.starter.participantId === myParticipantId;
  const rps = game.rps;
  const music = game.antakshari;
  const active = game.status === "ACTIVE";
  const remaining = Math.max(0, Math.ceil((Date.parse(game.deadlineAt) - now) / 1000));
  const idleRemaining = Math.max(0, Math.ceil((Date.parse(game.lastActionAt) + 300_000 - now) / 1000));
  const waitingForOther = music?.lastPlayerId === myParticipantId;
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 270, flexShrink: 1 }} contentContainerStyle={[styles.card, { gap: 8, padding: 12, borderColor: palette.purple, borderWidth: 1 }]}>
      <View style={[styles.row, { justifyContent: "space-between", alignItems: "center" }]}>
        <Text style={{ fontWeight: "700" }}>{game.kind === "RPS" ? "Rock · Paper · Scissors" : "Antakshari"}</Text>
        {canEnd && active && <Button label="End" secondary busy={working} onPress={onEnd} />}
      </View>
      {rps && (
        <>
          {active ? (
            <>
              <Text style={styles.caption}>{remaining}s to choose · {rps.submittedCount} {rps.submittedCount === 1 ? "ghost" : "ghosts"} ready</Text>
              {rps.myChoice ? (
                <Text>Your {rps.myChoice.toLowerCase()} is locked in. Choices reveal together.</Text>
              ) : (
                <View style={[styles.row, { flexWrap: "wrap" }]}>
                  {(["ROCK", "PAPER", "SCISSORS"] as const).map((choice) => (
                    <Button key={choice} label={choice.toLowerCase()} secondary busy={working} disabled={!ready} onPress={() => onChoice(choice)} />
                  ))}
                </View>
              )}
            </>
          ) : (
            <>
              <Text>{rps.outcome === "NO_ROUND" ? "Not enough players this round." : rps.outcome === "DRAW" ? "It's a draw!" : rps.outcome === "WIN" ? "Round complete!" : "This round ended."}</Text>
              {rps.choices?.map((item) => (
                <Text key={item.player.participantId} style={styles.caption}>
                  {item.player.ghostName} · {item.choice.toLowerCase()}{rps.winnerIds.includes(item.player.participantId) ? " · winner" : ""}
                </Text>
              ))}
              <Button label="Play again" secondary disabled={!ready} onPress={onAgain} />
            </>
          )}
        </>
      )}
      {music && (
        <>
          <Text style={styles.caption}>{active ? `Pass a song to another ghost · ${Math.ceil(idleRemaining / 60)}m until idle end` : "This music game has ended"}</Text>
          {music.turns.slice(-3).map((turn) => (
            <Text key={turn.messageId}>{turn.player.ghostName}: {turn.title} → {turn.nextCue}</Text>
          ))}
          {active && (
            <>
              <Text style={{ fontWeight: "700" }}>{music.nextCue ? `Start with “${music.nextCue}”` : "Start with any song"}</Text>
              {waitingForOther ? (
                <Text style={styles.caption}>Your turn is in chat. Let another ghost continue.</Text>
              ) : (
                <>
                  <TextInput accessibilityLabel="Song title" value={title} onChangeText={setTitle} placeholder="Song title" placeholderTextColor={palette.muted} maxLength={120} style={styles.input} />
                  <TextInput accessibilityLabel="Next sound" value={nextCue} onChangeText={setNextCue} placeholder="Sound for the next song" placeholderTextColor={palette.muted} maxLength={12} style={styles.input} />
                  <Button label="Play this song" busy={working} disabled={!ready || !title.trim() || !nextCue.trim()} onPress={() => {
                    void onTurn(title.trim(), nextCue.trim()).then((sent) => {
                      if (sent) { setTitle(""); setNextCue(""); }
                    });
                  }} />
                </>
              )}
            </>
          )}
          {!active && <Button label="Play another game" secondary disabled={!ready} onPress={onAgain} />}
        </>
      )}
      {error && <Banner>{friendlyError(error, now)}</Banner>}
    </ScrollView>
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
  onStarter,
  onPulseStart,
  onPulseVote,
}: {
  today?: PlaygroundToday;
  pulse?: Pulse;
  activeGame?: RoomGame;
  now: number;
  working: boolean;
  pulseWorking: boolean;
  pulseRetryAt: number;
  error?: ApiError;
  onStart(kind: RoomGame["kind"]): void;
  onStarter(text: string): void;
  onPulseStart(id: string): void;
  onPulseVote(pulseId: string, option: "A" | "B"): void;
}) {
  const [ideasOpen, setIdeasOpen] = useState(false);
  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.title, { fontSize: 24 }]}>Play together</Text>
      <Text style={styles.muted}>{activeGame?.status === "ACTIVE" ? "A game is live in this room. Join it below." : "Choose something to do right here in the room."}</Text>
      <View style={styles.card}>
        <Text style={{ fontWeight: "700" }}>✊ Rock · Paper · Scissors</Text>
        <Text style={styles.caption}>Pick privately. Reveal together in 30 seconds.</Text>
        <Button label="Start a round" busy={working} disabled={activeGame?.status === "ACTIVE"} onPress={() => onStart("RPS")} />
      </View>
      <View style={styles.card}>
        <Text style={{ fontWeight: "700" }}>♫ Antakshari</Text>
        <Text style={styles.caption}>Pass song titles and sounds between ghosts.</Text>
        <Button label="Start Antakshari" secondary busy={working} disabled={activeGame?.status === "ACTIVE"} onPress={() => onStart("ANTAKSHARI")} />
      </View>
      {error && <Banner>{friendlyError(error, now)}</Banner>}
      <Button label={ideasOpen ? "Hide conversation ideas" : "Conversation ideas and Pulses"} secondary onPress={() => setIdeasOpen(!ideasOpen)} />
      {ideasOpen && (
        <View style={{ gap: 10 }}>
          {today && <Button label={`Ask: ${today.topic}`} secondary onPress={() => onStarter(today.topic)} />}
          {today && <Button label="Start today's story" secondary onPress={() => onStarter(`Story relay: one sentence each. ${today.story}`)} />}
          {today?.prompts.map((prompt) => <Button key={prompt} label={prompt} secondary onPress={() => onStarter(prompt)} />)}
          {pulse && Date.parse(pulse.expiresAt) > now ? (
            <View style={styles.card}>
              <Text>{pulse.question}</Text>
              {pulse.results ? <Text style={styles.caption}>{pulse.optionA}: {pulse.results.A} · {pulse.optionB}: {pulse.results.B}</Text> : <Text style={styles.caption}>Vote to see results.</Text>}
              {!pulse.myVote && <View style={styles.row}>
                <Button label={pulse.optionA} secondary busy={pulseWorking} disabled={now < pulseRetryAt} onPress={() => onPulseVote(pulse.pulseId, "A")} />
                <Button label={pulse.optionB} secondary busy={pulseWorking} disabled={now < pulseRetryAt} onPress={() => onPulseVote(pulse.pulseId, "B")} />
              </View>}
            </View>
          ) : today?.pulses.map((choice) => <Button key={choice.id} label={`Pulse: ${choice.question}`} secondary busy={pulseWorking} disabled={now < pulseRetryAt} onPress={() => onPulseStart(choice.id)} />)}
        </View>
      )}
    </View>
  );
}
