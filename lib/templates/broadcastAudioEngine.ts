/**
 * Procedural Web Audio Broadcast Sound Engine
 * Generates authentic, real-time broadcast news themes, emergency alert stingers,
 * radar sweeps, financial tickers, and podcast grooves with zero network dependencies.
 */

import type { MotionEngineKind } from "./motionEngine";

const AUDIO_THEMES: Record<MotionEngineKind, string> = {
  newsroomMatrix: "/templates/audio/theme-newsroom.mp3",
  breakingPulse: "/templates/audio/theme-breaking.mp3",
  globe3d: "/templates/audio/theme-globe.mp3",
  radarSweep: "/templates/audio/theme-weather.mp3",
  marketTicker: "/templates/audio/theme-finance.mp3",
  podcastWave: "/templates/audio/theme-podcast.mp3",
  sportsArena: "/templates/audio/theme-sports.mp3",
  techGrid: "/templates/audio/theme-finance.mp3",
  sunriseBriefing: "/templates/audio/theme-newsroom.mp3",
  vipGlamour: "/templates/audio/theme-podcast.mp3",
  electionDesk: "/templates/audio/theme-breaking.mp3",
  socialSquare: "/templates/audio/theme-globe.mp3",
  verticalReels: "/templates/audio/theme-breaking.mp3",
  explainerDoc: "/templates/audio/theme-newsroom.mp3",
};

export class BroadcastAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private isPlaying = false;
  private isMuted = true;
  private volume = 0.7;
  private currentEngine: MotionEngineKind | null = null;
  private loopTimer: any = null;
  private scheduledNodes: (AudioNode | AudioScheduledSourceNode)[] = [];

  constructor() {
    // Lazily created on user interaction
  }

  private initContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  public play(engine: MotionEngineKind, muted = false) {
    this.isMuted = muted;
    this.isPlaying = true;
    this.currentEngine = engine;

    // 1. Play authentic studio MP3 audio theme
    const themeSrc = AUDIO_THEMES[engine] || "/templates/audio/theme-newsroom.mp3";
    if (typeof window !== "undefined") {
      try {
        if (!this.audioEl) {
          this.audioEl = new Audio();
          this.audioEl.loop = true;
        }
        if (!this.audioEl.src.endsWith(themeSrc)) {
          this.audioEl.src = themeSrc;
        }
        this.audioEl.muted = muted;
        this.audioEl.volume = this.volume;
        if (!muted) {
          this.audioEl.play().catch(() => {});
        }
      } catch {
        // Fallback to Web Audio if audio element fails
      }
    }

    // 2. Also keep Web Audio primed as audio context
    this.initContext();
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public playTrack(trackUrl: string, muted = false) {
    this.isMuted = muted;
    this.isPlaying = true;

    if (typeof window !== "undefined") {
      try {
        if (!this.audioEl) {
          this.audioEl = new Audio();
          this.audioEl.loop = true;
        }
        if (!this.audioEl.src.endsWith(trackUrl)) {
          this.audioEl.src = trackUrl;
        }
        this.audioEl.muted = muted;
        this.audioEl.volume = this.volume;
        if (!muted) {
          this.audioEl.play().catch(() => {});
        }
      } catch {
        // Fallback to Web Audio if audio element fails
      }
    }

    this.initContext();
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public stop() {
    this.isPlaying = false;
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    for (const node of this.scheduledNodes) {
      try {
        if ("stop" in node && typeof (node as any).stop === "function") {
          (node as any).stop();
        }
        node.disconnect();
      } catch {
        // ignore already stopped
      }
    }
    this.scheduledNodes = [];
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.audioEl) {
      this.audioEl.muted = muted;
      if (!muted && this.isPlaying) {
        this.audioEl.play().catch(() => {});
      }
    }
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, now, 0.05);
    }
  }

  public setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audioEl) {
      this.audioEl.volume = this.volume;
    }
    if (this.ctx && this.masterGain && !this.isMuted) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.volume, now, 0.05);
    }
  }



  private scheduleNextLoop() {
    if (!this.isPlaying || !this.ctx || !this.masterGain || !this.currentEngine) return;

    const startTime = this.ctx.currentTime + 0.05;
    let loopDuration = 4.0; // seconds

    switch (this.currentEngine) {
      case "breakingPulse":
        loopDuration = this.generateBreakingNewsTheme(startTime);
        break;
      case "newsroomMatrix":
        loopDuration = this.generateNewsroomTheme(startTime);
        break;
      case "globe3d":
        loopDuration = this.generateGlobeTheme(startTime);
        break;
      case "radarSweep":
        loopDuration = this.generateWeatherTheme(startTime);
        break;
      case "marketTicker":
        loopDuration = this.generateMarketTheme(startTime);
        break;
      case "podcastWave":
        loopDuration = this.generatePodcastTheme(startTime);
        break;
      default:
        loopDuration = this.generateNewsroomTheme(startTime);
    }

    // Schedule next iteration before this one finishes
    this.loopTimer = setTimeout(() => {
      if (this.isPlaying) {
        this.scheduleNextLoop();
      }
    }, (loopDuration - 0.2) * 1000);
  }

  // 1. Breaking News: Dramatic brass hits, urgent teletype ticker, sub-bass rumble, emergency pulse
  private generateBreakingNewsTheme(t: number): number {
    const ctx = this.ctx!;
    const dest = this.masterGain!;
    const dur = 3.6;

    // Sub-bass impact
    this.playSubDrop(t, 90, 35, 1.2, 0.6);

    // Urgent Brass Chord Fanfare (F minor: F3, Ab3, C4, Eb4)
    const freqs = [174.61, 207.65, 261.63, 311.13];
    freqs.forEach((f) => {
      this.playSynthNote(t, f, 0.9, "sawtooth", 0.18, 0.04, 0.4);
      this.playSynthNote(t + 1.0, f * 1.189, 0.8, "sawtooth", 0.16, 0.04, 0.35); // Key shift
      this.playSynthNote(t + 2.0, f, 1.4, "sawtooth", 0.22, 0.05, 0.6);
    });

    // Sonar Warning Pulses (every 0.6s)
    for (let i = 0; i < 6; i++) {
      this.playPulseTone(t + i * 0.6, 1320, 0.12, 0.1);
    }

    // Rapid Teletype Ticker Clicks
    for (let i = 0; i < 18; i++) {
      this.playNoiseClick(t + 0.3 + i * 0.14, 0.03, 0.07);
    }

    return dur;
  }

  // 2. Modern Newsroom: Signature electronic bells, 120 BPM news beat, driving synth bass
  private generateNewsroomTheme(t: number): number {
    const dur = 4.0;

    // 4-on-the-floor News Kick + Hi-hats
    for (let i = 0; i < 8; i++) {
      const beat = t + i * 0.5;
      this.playSubDrop(beat, 140, 45, 0.25, 0.45);
      this.playNoiseClick(beat + 0.25, 0.04, 0.09); // offbeat hi-hat
    }

    // Melodic Marimba / News Bell Chime (C5 -> G4 -> Bb4 -> C5)
    const melody = [
      { f: 523.25, at: 0.0, len: 0.3 }, // C5
      { f: 392.0, at: 0.5, len: 0.3 },  // G4
      { f: 466.16, at: 1.0, len: 0.3 }, // Bb4
      { f: 523.25, at: 1.5, len: 0.7 }, // C5
      { f: 587.33, at: 2.25, len: 0.35 },// D5
      { f: 523.25, at: 2.75, len: 0.35 },// C5
      { f: 698.46, at: 3.25, len: 0.65 },// F5
    ];

    melody.forEach((m) => {
      this.playSynthNote(t + m.at, m.f, m.len, "triangle", 0.25, 0.02, 0.15);
      this.playSynthNote(t + m.at, m.f * 2, m.len * 0.8, "sine", 0.12, 0.01, 0.1);
    });

    // Bassline groove
    const bass = [130.81, 130.81, 116.54, 130.81, 146.83, 130.81, 174.61];
    bass.forEach((bf, i) => {
      this.playSynthNote(t + i * 0.5, bf, 0.4, "sawtooth", 0.16, 0.05, 0.15, true);
    });

    return dur;
  }

  // 3. World News Globe: Majestic orchestral lead, satellite telemetry pings, deep timpani
  private generateGlobeTheme(t: number): number {
    const dur = 4.0;

    // Deep Timpani impact
    this.playSubDrop(t, 120, 40, 0.8, 0.55);
    this.playSubDrop(t + 2.0, 110, 38, 0.8, 0.5);

    // Regal Orchestral Horn Fanfare (Eb major triad)
    const hornNotes = [
      { f: 311.13, at: 0.0, len: 0.8 }, // Eb4
      { f: 392.0, at: 0.75, len: 0.6 }, // G4
      { f: 466.16, at: 1.5, len: 1.2 }, // Bb4
      { f: 622.25, at: 2.5, len: 1.3 }, // Eb5
    ];
    hornNotes.forEach((h) => {
      this.playSynthNote(t + h.at, h.f, h.len, "sawtooth", 0.16, 0.08, 0.3);
      this.playSynthNote(t + h.at, h.f * 0.5, h.len, "triangle", 0.2, 0.08, 0.3);
    });

    // Satellite Telemetry Pings
    for (let i = 0; i < 7; i++) {
      this.playPulseTone(t + 0.4 + i * 0.48, 1760 + (i % 3) * 220, 0.08, 0.08);
    }

    return dur;
  }

  // 4. Weather Center: Doppler radar sweep blips & atmospheric ambient synth chords
  private generateWeatherTheme(t: number): number {
    const dur = 3.6;

    // Atmospheric warm pad chord (D major 9: D3, F#3, A3, C#4, E4)
    [146.83, 185.0, 220.0, 277.18, 329.63].forEach((f) => {
      this.playSynthNote(t, f, 3.4, "sine", 0.1, 0.4, 0.8);
    });

    // Doppler Radar Sweep Chirps (Synchronized at t=0 and t=1.8s)
    [0.0, 1.8].forEach((offset) => {
      this.playChirp(t + offset, 440, 1200, 0.35, 0.18);
      this.playPulseTone(t + offset + 0.35, 880, 0.15, 0.12);
    });

    // Gentle rain/marimba droplets
    const rainPitches = [880, 1108, 1320, 987, 1174];
    for (let i = 0; i < 10; i++) {
      this.playPulseTone(t + 0.2 + i * 0.32, rainPitches[i % rainPitches.length], 0.06, 0.06);
    }

    return dur;
  }

  // 5. Financial Markets: Stock exchange bell chime, brisk electronic tech arpeggios
  private generateMarketTheme(t: number): number {
    const dur = 3.2;

    // Opening Bell Chime on beat 1
    this.playBellChime(t, 1046.5, 1.4, 0.35); // High C
    this.playBellChime(t + 0.05, 2093.0, 1.2, 0.2);

    // Fast 16th-note Stock Ticker Pulse (128 BPM)
    const arpeggio = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 440.0, 523.25];
    for (let i = 0; i < 16; i++) {
      const f = arpeggio[i % arpeggio.length];
      this.playSynthNote(t + i * 0.2, f, 0.12, "triangle", 0.14, 0.01, 0.05);
    }

    // Steady heartbeat kick
    for (let i = 0; i < 4; i++) {
      this.playSubDrop(t + i * 0.8, 130, 50, 0.2, 0.35);
    }

    return dur;
  }

  // 6. Podcast Lounge: Chill acoustic warmth, electric piano chords, lo-fi drum groove
  private generatePodcastTheme(t: number): number {
    const dur = 4.0;

    // Warm Lo-Fi Kick & Snare Beat (85 BPM vibe)
    this.playSubDrop(t, 110, 40, 0.3, 0.45);
    this.playNoiseClick(t + 1.0, 0.12, 0.2); // Snare
    this.playSubDrop(t + 1.8, 110, 40, 0.25, 0.4);
    this.playSubDrop(t + 2.2, 100, 38, 0.2, 0.35);
    this.playNoiseClick(t + 3.0, 0.12, 0.2); // Snare

    // Soft Rhodes-style E-Piano Chords (Bb major 7 -> G minor 7)
    const chord1 = [233.08, 293.66, 349.23, 440.0]; // Bb, D, F, A
    const chord2 = [196.0, 246.94, 293.66, 392.0];  // G, B, D, G
    chord1.forEach((f) => this.playSynthNote(t, f, 1.8, "sine", 0.15, 0.08, 0.4));
    chord2.forEach((f) => this.playSynthNote(t + 2.0, f, 1.8, "sine", 0.15, 0.08, 0.4));

    return dur;
  }

  // --- Sound Generation Primitives ---

  private playSubDrop(at: number, fromF: number, toF: number, len: number, vol: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(fromF, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, toF), at + len);

    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(at);
    osc.stop(at + len);
    this.scheduledNodes.push(osc, gain);
  }

  private playSynthNote(
    at: number,
    freq: number,
    len: number,
    type: OscillatorType,
    vol: number,
    attack: number,
    decay: number,
    lowpass = false
  ) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(vol, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);

    let finalNode: AudioNode = osc;

    if (lowpass) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(800, at);
      filter.frequency.linearRampToValueAtTime(300, at + len);
      osc.connect(filter);
      finalNode = filter;
      this.scheduledNodes.push(filter);
    }

    finalNode.connect(gain);
    gain.connect(this.masterGain);

    osc.start(at);
    osc.stop(at + len);
    this.scheduledNodes.push(osc, gain);
  }

  private playPulseTone(at: number, freq: number, len: number, vol: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, at);

    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(at);
    osc.stop(at + len);
    this.scheduledNodes.push(osc, gain);
  }

  private playChirp(at: number, fStart: number, fEnd: number, len: number, vol: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(fStart, at);
    osc.frequency.exponentialRampToValueAtTime(fEnd, at + len);

    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(at);
    osc.stop(at + len);
    this.scheduledNodes.push(osc, gain);
  }

  private playBellChime(at: number, freq: number, len: number, vol: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, at);

    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(at);
    osc.stop(at + len);
    this.scheduledNodes.push(osc, gain);
  }

  private playNoiseClick(at: number, len: number, vol: number) {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = Math.max(256, Math.floor(this.ctx.sampleRate * len));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp((-i / bufferSize) * 6);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);

    noise.connect(gain);
    gain.connect(this.masterGain);

    noise.start(at);
    noise.stop(at + len);
    this.scheduledNodes.push(noise, gain);
  }
}
