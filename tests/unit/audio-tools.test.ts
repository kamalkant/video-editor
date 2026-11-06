import { describe, expect, it } from "vitest";
import { decodeWav, duration, encodeWav, gain, integratedLoudness, peakDb, planNormalize, resample, toMono, trim, type Pcm } from "@/lib/audio/tools/pcm";
import { encodeMp3 } from "@/lib/audio/tools/encode";

const tone = (seconds: number, freq: number, amp: number, rate = 48000, channels = 2): Pcm => ({
  sampleRate: rate,
  channels: Array.from({ length: channels }, () => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate))),
});

describe("PCM", () => {
  it("trims with fades", () => {
    const t = trim(tone(4, 440, 0.5), 1, 3, 0.5, 0.5);
    expect(duration(t)).toBeCloseTo(2, 3);
    expect(t.channels[0][0]).toBe(0);
    expect(Math.abs(t.channels[0][t.channels[0].length - 1])).toBeLessThan(0.01);
  });

  it("gain, mono and resampling", () => {
    expect(peakDb(gain(tone(1, 440, 0.5), 6))).toBeCloseTo(20 * Math.log10(0.5 * 1.9953), 1);
    expect(toMono(tone(1, 440, 0.5)).channels).toHaveLength(1);
    const r = resample(tone(1, 440, 0.5, 48000), 22050);
    expect(r.channels[0].length).toBe(22050);
    expect(peakDb(r)).toBeCloseTo(peakDb(tone(1, 440, 0.5)), 0);
  });

  it("WAV round-trip", () => {
    const p = tone(0.5, 1000, 0.8, 44100, 2);
    const back = decodeWav(encodeWav(p));
    expect(back.sampleRate).toBe(44100);
    expect(back.channels).toHaveLength(2);
    expect(back.channels[0][100]).toBeCloseTo(p.channels[0][100], 3);
  });
});

describe("loudness (BS.1770)", () => {
  it("a 1 kHz sine at −20 dBFS reads about −20 LUFS per channel (−17 for stereo)", () => {
    // reference: a 0 dBFS 1 kHz sine on one channel is −3.01 LUFS
    const amp = Math.pow(10, -20 / 20);
    expect(integratedLoudness(tone(5, 1000, amp, 48000, 1))).toBeCloseTo(-23.01, 0);
    expect(integratedLoudness(tone(5, 1000, amp, 48000, 2))).toBeCloseTo(-20.0, 0);
    // other sample rates read the same
    expect(integratedLoudness(tone(5, 1000, amp, 44100, 2))).toBeCloseTo(-20.0, 0);
  });

  it("silence is −Infinity; gating ignores quiet stretches", () => {
    expect(integratedLoudness(tone(2, 1000, 0))).toBe(-Infinity);
    const loud = tone(3, 1000, 0.1);
    const withSilence: Pcm = { sampleRate: 48000, channels: loud.channels.map((c) => Float32Array.from([...c, ...new Float32Array(48000 * 3)])) };
    expect(integratedLoudness(withSilence)).toBeCloseTo(integratedLoudness(loud), 0);
  });

  it("normalising reaches the target, unless peaks would clip", () => {
    const quiet = tone(5, 1000, 0.05);
    const plan = planNormalize(quiet, -14);
    expect(plan.after).toBeCloseTo(-14, 1);
    expect(integratedLoudness(gain(quiet, plan.gain))).toBeCloseTo(-14, 0);
    const spiky: Pcm = { sampleRate: 48000, channels: tone(5, 1000, 0.01).channels.map((c) => ((c[1000] = 0.9), c)) };
    const p2 = planNormalize(spiky, -14);
    expect(p2.limitedByPeak).toBe(true);
    expect(peakDb(gain(spiky, p2.gain))).toBeLessThanOrEqual(-0.99);
  });
});

describe("MP3", () => {
  it("encodes a valid MP3 stream of about the right length", async () => {
    const mp3 = await encodeMp3(tone(2, 440, 0.5, 44100), 128);
    // frame sync word at the start
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0);
    // 128 kbps × 2 s ≈ 32 KB
    expect(mp3.length).toBeGreaterThan(28_000);
    expect(mp3.length).toBeLessThan(36_000);
  });
});
