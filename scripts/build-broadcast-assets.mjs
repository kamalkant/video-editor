import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MEDIA_DIR = join(process.cwd(), "public/templates/media");
const AUDIO_DIR = join(process.cwd(), "public/templates/audio");

mkdirSync(MEDIA_DIR, { recursive: true });
mkdirSync(AUDIO_DIR, { recursive: true });

console.log("🎬 Generating real broadcast video loops with FFmpeg...");

const videoDefinitions = [
  {
    name: "newsroom-modern.mp4",
    filter: "color=c=0x06163a:s=1920x1080:d=10:r=30,drawgrid=w=160:h=90:t=2:c=0x1e3a8a@0.45,drawbox=x=0:y=650:w=1920:h=430:c=0x040c22@0.85:t=fill,vignette=angle=0.45",
  },
  {
    name: "breaking-red.mp4",
    filter: "color=c=0x2b0606:s=1920x1080:d=10:r=30,drawgrid=w=120:h=120:t=2:c=0xdc2626@0.4,drawbox=x=0:y=800:w=1920:h=280:c=0x150303@0.9:t=fill,vignette=angle=0.6",
  },
  {
    name: "globe-3d.mp4",
    filter: "color=c=0x030d22:s=1920x1080:d=10:r=30,drawgrid=w=140:h=140:t=1:c=0x0284c7@0.35,vignette=angle=0.55",
  },
  {
    name: "radar-weather.mp4",
    filter: "color=c=0x041f1e:s=1920x1080:d=10:r=30,drawgrid=w=100:h=100:t=2:c=0x0d9488@0.4,vignette=angle=0.45",
  },
  {
    name: "finance-ticker.mp4",
    filter: "color=c=0x061912:s=1920x1080:d=10:r=30,drawgrid=w=80:h=80:t=2:c=0x16a34a@0.35,drawbox=x=0:y=750:w=1920:h=330:c=0x020f09@0.9:t=fill,vignette=angle=0.5",
  },
  {
    name: "podcast-studio.mp4",
    filter: "color=c=0x1c092b:s=1920x1080:d=10:r=30,drawgrid=w=160:h=160:t=2:c=0xa855f7@0.3,drawbox=x=0:y=700:w=1920:h=380:c=0x0c0314@0.85:t=fill,vignette=angle=0.5",
  },
  {
    name: "sports-arena.mp4",
    filter: "color=c=0x261003:s=1920x1080:d=10:r=30,drawgrid=w=120:h=120:t=2:c=0xea580c@0.4,vignette=angle=0.5",
  },
  {
    name: "crime-cctv.mp4",
    filter: "color=c=0x0c1411:s=1920x1080:d=10:r=30,drawgrid=w=90:h=90:t=1:c=0x34d399@0.25,vignette=angle=0.6",
  },
  {
    name: "tech-grid.mp4",
    filter: "color=c=0x020d1c:s=1920x1080:d=10:r=30,drawgrid=w=80:h=80:t=1:c=0x22d3ee@0.4,vignette=angle=0.5",
  },
  {
    name: "vertical-reels.mp4",
    filter: "color=c=0x081329:s=1080x1920:d=10:r=30,drawgrid=w=100:h=100:t=2:c=0x2563eb@0.35,vignette=angle=0.55",
  },
  {
    name: "vertical-breaking.mp4",
    filter: "color=c=0x290404:s=1080x1920:d=10:r=30,drawgrid=w=90:h=90:t=2:c=0xdc2626@0.4,vignette=angle=0.55",
  },
  {
    name: "square-social.mp4",
    filter: "color=c=0x05142e:s=1080x1080:d=10:r=30,drawgrid=w=90:h=90:t=2:c=0x0284c7@0.4,vignette=angle=0.5",
  },
];

for (const v of videoDefinitions) {
  const out = join(MEDIA_DIR, v.name);
  if (!existsSync(out)) {
    console.log(`  Generating ${v.name}...`);
    execSync(
      `ffmpeg -y -f lavfi -i "${v.filter}" -c:v libx264 -pix_fmt yuv420p -preset ultrafast -movflags +faststart "${out}"`,
      { stdio: "ignore" }
    );
  }
}

console.log("🎵 Generating authentic studio news audio themes...");

function generateWavPcm(durationSec, generateSample) {
  const sampleRate = 44100;
  const numChannels = 2;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * numChannels * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // subchunk1size (PCM = 16)
  buffer.writeUInt16LE(1, 20);  // audio format (PCM = 1)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * 2, 28); // byte rate
  buffer.writeUInt16LE(numChannels * 2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const [left, right] = generateSample(t);

    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const s16L = Math.floor(clamp(left) * 32767);
    const s16R = Math.floor(clamp(right) * 32767);

    buffer.writeInt16LE(s16L, offset);
    buffer.writeInt16LE(s16R, offset + 2);
    offset += 4;
  }

  return buffer;
}

const audioThemes = [
  {
    name: "theme-newsroom.mp3",
    duration: 8.0,
    gen: (t) => {
      // 120 BPM news beat
      const beat = (t * 2) % 1;
      const kick = Math.sin(t * 120 * Math.PI * 2 * Math.exp(-beat * 15)) * Math.exp(-beat * 8) * 0.45;
      const hihat = (Math.random() * 2 - 1) * Math.exp(-((t * 4) % 1) * 20) * 0.12;

      // Broadcast Marimba / Bell Melodic Motif (C5 - G4 - Bb4 - C5)
      const notes = [523.25, 392.0, 466.16, 523.25, 587.33, 523.25, 698.46];
      const noteIdx = Math.floor(t * 1.5) % notes.length;
      const notePhase = (t * 1.5) % 1;
      const freq = notes[noteIdx];
      const bell = Math.sin(t * freq * Math.PI * 2) * Math.exp(-notePhase * 4) * 0.35;

      // Sub Bassline
      const bassFreq = 130.81;
      const bass = Math.sin(t * bassFreq * Math.PI * 2) * 0.25;

      const mono = kick + hihat + bell + bass;
      return [mono, mono * 0.95];
    },
  },
  {
    name: "theme-breaking.mp3",
    duration: 8.0,
    gen: (t) => {
      // Emergency Sonar Pulse (880Hz / 1760Hz)
      const pulseT = t % 0.6;
      const sonar = Math.sin(t * 880 * Math.PI * 2) * Math.exp(-pulseT * 12) * 0.3;

      // Heavy Sub Drop Impact
      const dropT = t % 4.0;
      const sub = Math.sin(t * (90 * Math.exp(-dropT * 3) + 35) * Math.PI * 2) * Math.exp(-dropT * 2.5) * 0.55;

      // Urgent Brass Stabs (F minor chord: 174.61, 207.65, 261.63)
      const chordT = t % 2.0;
      const brass =
        (Math.sin(t * 174.61 * Math.PI * 2) + Math.sin(t * 207.65 * Math.PI * 2) + Math.sin(t * 261.63 * Math.PI * 2)) *
        Math.exp(-chordT * 3) *
        0.2;

      // Teletype chatter
      const click = (Math.random() * 2 - 1) * Math.exp(-((t * 10) % 1) * 30) * 0.15;

      const mono = sonar + sub + brass + click;
      return [mono, mono];
    },
  },
  {
    name: "theme-globe.mp3",
    duration: 8.0,
    gen: (t) => {
      // Orchestral Horn Fanfare
      const hornNotes = [311.13, 392.0, 466.16, 622.25];
      const noteIdx = Math.floor(t * 1.0) % hornNotes.length;
      const noteT = (t * 1.0) % 1;
      const horn = Math.sin(t * hornNotes[noteIdx] * Math.PI * 2) * Math.exp(-noteT * 1.5) * 0.35;

      // Timpani roll
      const timpani = Math.sin(t * 80 * Math.PI * 2) * Math.exp(-(t % 2.0) * 2) * 0.4;

      // Satellite blips
      const blip = Math.sin(t * 1760 * Math.PI * 2) * Math.exp(-((t * 3) % 1) * 20) * 0.12;

      const mono = horn + timpani + blip;
      return [mono * 0.9, mono * 1.1];
    },
  },
  {
    name: "theme-weather.mp3",
    duration: 8.0,
    gen: (t) => {
      // Atmospheric Synth Pad
      const pad = (Math.sin(t * 220 * Math.PI * 2) + Math.sin(t * 277.18 * Math.PI * 2) + Math.sin(t * 329.63 * Math.PI * 2)) * 0.15;

      // Radar Sweep Chirp (every 2.0s)
      const sweepT = t % 2.0;
      const chirpFreq = 440 + sweepT * 600;
      const chirp = Math.sin(t * chirpFreq * Math.PI * 2) * Math.exp(-sweepT * 6) * 0.25;

      // Rain droplets
      const rain = (Math.random() * 2 - 1) * Math.exp(-((t * 8) % 1) * 25) * 0.08;

      const mono = pad + chirp + rain;
      return [mono, mono];
    },
  },
  {
    name: "theme-finance.mp3",
    duration: 8.0,
    gen: (t) => {
      // 128 BPM electronic trading pulse
      const beat = (t * 2.13) % 1;
      const kick = Math.sin(t * 130 * Math.PI * 2 * Math.exp(-beat * 15)) * Math.exp(-beat * 8) * 0.4;

      // High-speed stock arpeggios
      const arp = [261.63, 329.63, 392.0, 523.25];
      const arpIdx = Math.floor(t * 8.5) % arp.length;
      const tickerNote = Math.sin(t * arp[arpIdx] * Math.PI * 2) * Math.exp(-((t * 8.5) % 1) * 8) * 0.25;

      // Opening bell chime
      const bell = Math.sin(t * 1046.5 * Math.PI * 2) * Math.exp(-(t % 4) * 2) * 0.3;

      const mono = kick + tickerNote + bell;
      return [mono, mono];
    },
  },
  {
    name: "theme-podcast.mp3",
    duration: 8.0,
    gen: (t) => {
      // 85 BPM lo-fi hip-hop groove
      const beat = (t * 1.41) % 1;
      const kick = Math.sin(t * 95 * Math.PI * 2 * Math.exp(-beat * 12)) * Math.exp(-beat * 6) * 0.45;
      const snare = (Math.random() * 2 - 1) * Math.exp(-(((t * 1.41) + 0.5) % 1) * 12) * 0.25;

      // Warm Rhodes chords
      const chords = [233.08, 293.66, 349.23, 440.0];
      const chordIdx = Math.floor(t * 0.5) % chords.length;
      const rhodes = Math.sin(t * chords[chordIdx] * Math.PI * 2) * 0.2;

      const mono = kick + snare + rhodes;
      return [mono, mono * 0.95];
    },
  },
  {
    name: "theme-sports.mp3",
    duration: 8.0,
    gen: (t) => {
      // Driving Stadium Drum Roll
      const beat = (t * 2.4) % 1;
      const kick = Math.sin(t * 110 * Math.PI * 2 * Math.exp(-beat * 14)) * Math.exp(-beat * 7) * 0.5;

      // Stadium Brass Fanfare
      const brass = Math.sin(t * 293.66 * Math.PI * 2) * 0.3 + Math.sin(t * 369.99 * Math.PI * 2) * 0.25;

      const mono = kick + brass;
      return [mono, mono];
    },
  },
  {
    name: "theme-crime.mp3",
    duration: 8.0,
    gen: (t) => {
      // Dark Suspense Drone (45Hz)
      const drone = Math.sin(t * 45 * Math.PI * 2) * 0.4;
      // Heartbeat pulse
      const pulseT = t % 1.2;
      const heartbeat = Math.sin(t * 55 * Math.PI * 2) * Math.exp(-pulseT * 8) * 0.5;

      const mono = drone + heartbeat;
      return [mono, mono];
    },
  },
];

for (const theme of audioThemes) {
  const outMp3 = join(AUDIO_DIR, theme.name);
  if (!existsSync(outMp3)) {
    console.log(`  Synthesizing ${theme.name}...`);
    const tempWav = join(AUDIO_DIR, `temp-${theme.name}.wav`);
    const wavBuffer = generateWavPcm(theme.duration, theme.gen);
    writeFileSync(tempWav, wavBuffer);

    execSync(
      `ffmpeg -y -i "${tempWav}" -c:a libmp3lame -b:a 320k "${outMp3}"`,
      { stdio: "ignore" }
    );

    execSync(`rm -f "${tempWav}"`);
  }
}

console.log("✅ All broadcast media and audio assets generated successfully!");
