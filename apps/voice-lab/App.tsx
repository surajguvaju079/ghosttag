import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { AudioContext, AudioManager, AudioRecorder, OfflineAudioContext } from 'react-native-audio-api';
import { monoWav } from './wav';

AudioManager.setAudioSessionOptions({ iosCategory: 'playAndRecord', iosMode: 'default', iosOptions: [] });

export default function App() {
  const recorder = useRef<AudioRecorder | null>(null);
  const player = useRef<AudioContext | null>(null);
  const output = useRef<File | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const recording = useRef(false);
  const starting = useRef(false);
  const playing = useRef(false);
  const busy = useRef(false);
  const [status, setStatus] = useState('Ready. Audio stays on this phone.');
  const [phase, setPhase] = useState<'ready' | 'recording' | 'processing' | 'preview'>('ready');

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function deleteFile(file: File | null) {
    try { file?.delete(); } catch { /* A native interruption may already have removed it. */ }
  }
  function deletePaths(paths: string[]) {
    for (const path of paths) deleteFile(new File(path));
  }
  function deleteStoppedRecording() {
    const result = AudioRecorder.consumeLastRecordingResult();
    if (result) deletePaths(result.paths);
  }
  async function discard() {
    generation.current++;
    const wasProcessing = busy.current;
    clearTimer();
    const activePlayer = player.current;
    player.current = null;
    if (activePlayer) await activePlayer.close().catch(() => {});
    if (recording.current && recorder.current) {
      recording.current = false;
      const result = await recorder.current.stop().catch(() => null);
      if (result?.status === 'success') deletePaths(result.paths);
    }
    deleteStoppedRecording();
    await AudioManager.setAudioSessionActivity(false).catch(() => {});
    deleteFile(output.current);
    output.current = null;
    busy.current = wasProcessing;
    setPhase(wasProcessing ? 'processing' : 'ready');
    setStatus(wasProcessing ? 'Discarding local audio…' : 'Discarded. Ready to record again.');
  }
  async function stopAndTransform() {
    if (!recording.current || !recorder.current || busy.current) return;
    const run = generation.current;
    recording.current = false;
    busy.current = true;
    clearTimer();
    setPhase('processing');
    setStatus('Changing the local recording…');
    let recordedPaths: string[] = [];
    let context: AudioContext | null = null;
    let producedFile: File | null = null;
    try {
      const recorded = await recorder.current.stop();
      if (run === generation.current) await AudioManager.setAudioSessionActivity(false);
      if (recorded.status !== 'success' || !recorded.paths[0]) throw new Error('Recording unavailable');
      recordedPaths = recorded.paths;
      if (run !== generation.current) return;
      context = new AudioContext();
      const decoded = await context.decodeAudioData(new File(recorded.paths[0]).uri);
      deletePaths(recordedPaths); recordedPaths = [];
      await context.close();
      context = null;
      if (run !== generation.current) return;
      const rate = 1.18;
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length: Math.max(1, Math.ceil(decoded.length / rate)),
        sampleRate: decoded.sampleRate,
      });
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.playbackRate.value = rate;
      const filter = offline.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 3400;
      source.connect(filter); filter.connect(offline.destination); source.start();
      const altered = await offline.startRendering();
      if (run !== generation.current) return;
      producedFile = new File(Paths.cache, `ghosttag_altered_${Date.now()}_${run}.wav`);
      producedFile.create();
      await producedFile.write(monoWav(altered.getChannelData(0), altered.sampleRate));
      if (run !== generation.current) return;
      output.current = producedFile;
      setPhase('preview');
      setStatus('Altered preview ready. A listener may still recognize you.');
    } catch {
      if (run === generation.current) {
        setPhase('ready');
        setStatus('Could not make the altered preview. Please try again.');
      }
    } finally {
      deletePaths(recordedPaths);
      deleteStoppedRecording();
      if (context) await context.close().catch(() => {});
      if (producedFile && output.current !== producedFile) deleteFile(producedFile);
      if (run === generation.current) {
        await AudioManager.setAudioSessionActivity(false).catch(() => {});
      } else {
        setPhase('ready');
        setStatus('Discarded. Ready to record again.');
      }
      busy.current = false;
    }
  }
  async function start() {
    if (recording.current || busy.current || starting.current) return;
    starting.current = true;
    await discard();
    const run = generation.current;
    try {
      if (AppState.currentState !== 'active') return;
      const permission = await AudioManager.requestRecordingPermissions();
      if (run !== generation.current || AppState.currentState !== 'active') return;
      if (permission !== 'Granted') { setStatus('Microphone permission was denied.'); return; }
      await AudioManager.setAudioSessionActivity(true);
      if (run !== generation.current || AppState.currentState !== 'active') {
        await AudioManager.setAudioSessionActivity(false); return;
      }
      const current = recorder.current ?? new AudioRecorder();
      recorder.current = current;
      if (current.enableFileOutput().status !== 'success') throw new Error('File output unavailable');
      const result = await current.start();
      if (result.status !== 'success') throw new Error('Recording failed');
      recording.current = true;
      if (run !== generation.current) { await discard(); return; }
      setPhase('recording');
      setStatus('Recording locally. Maximum ten seconds.');
      timer.current = setTimeout(() => { void stopAndTransform(); }, 10_000);
    } catch {
      await AudioManager.setAudioSessionActivity(false).catch(() => {});
      deleteStoppedRecording();
      if (run === generation.current) setStatus('Microphone or recording unavailable.');
    } finally {
      starting.current = false;
    }
  }
  async function play() {
    if (!output.current || busy.current || playing.current) return;
    playing.current = true;
    const run = generation.current;
    try {
      await player.current?.close();
      if (run !== generation.current) return;
      const context = new AudioContext();
      player.current = context;
      const buffer = await context.decodeAudioData(output.current.uri);
      if (run !== generation.current || player.current !== context) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      if (context.state === 'suspended') await context.resume();
      source.start();
    } catch {
      if (run === generation.current) setStatus('Preview could not play on this device.');
      const failedPlayer = player.current;
      player.current = null;
      await failedPlayer?.close().catch(() => {});
    } finally {
      playing.current = false;
    }
  }
  useEffect(() => {
    const listener = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void discard();
    });
    return () => { listener.remove(); void discard(); };
  }, []);
  return <ScrollView contentContainerStyle={styles.screen}>
    <Text style={styles.title}>GhostTag Voice Lab</Text>
    <Text style={styles.copy}>Internal test only. Record a short sample, hear the altered version, and discard it. This is not verified anonymity.</Text>
    <View style={styles.card}>
      <Text accessibilityRole="alert" style={styles.copy}>{status}</Text>
      {phase === 'ready' && <Pressable accessibilityRole="button" style={styles.button} onPress={() => void start()}><Text style={styles.buttonText}>Record</Text></Pressable>}
      {phase === 'recording' && <Pressable accessibilityRole="button" style={styles.button} onPress={() => void stopAndTransform()}><Text style={styles.buttonText}>Stop and alter</Text></Pressable>}
      {phase === 'processing' && <Text style={styles.copy}>Processing…</Text>}
      {phase === 'preview' && <Pressable accessibilityRole="button" style={styles.button} onPress={() => void play()}><Text style={styles.buttonText}>Play altered preview</Text></Pressable>}
      {phase !== 'ready' && <Pressable accessibilityRole="button" style={styles.button} onPress={() => void discard()}><Text style={styles.buttonText}>Discard</Text></Pressable>}
    </View>
    <Text style={styles.copy}>No upload is available in this lab. Words and accent can still reveal identity.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 24, paddingTop: 80, gap: 24, backgroundColor: '#0f0b1f' },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  copy: { color: '#ddd4f4', fontSize: 16, lineHeight: 23 },
  card: { gap: 18, borderColor: '#5c487e', borderWidth: 1, borderRadius: 18, padding: 20 },
  button: { backgroundColor: '#b99aff', borderRadius: 12, padding: 14, minHeight: 48 },
  buttonText: { color: '#1c1233', fontWeight: '700', textAlign: 'center' },
});
