/**
 * Analyze audio from an ArrayBuffer and return per-frame energy values.
 * Uses Web Audio API OfflineAudioContext to decode the audio.
 */
export async function analyzeAudio(
  audioBuffer: ArrayBuffer,
  fps: number,
): Promise<{ energies: number[]; duration: number }> {
  const audioCtx = new OfflineAudioContext(1, 1, 44100);
  const decoded = await audioCtx.decodeAudioData(audioBuffer.slice(0));

  const duration = decoded.duration;
  const totalFrames = Math.ceil(duration * fps);
  const sampleRate = decoded.sampleRate;
  const channelData = decoded.getChannelData(0);

  const fftSize = 2048;
  const energies: number[] = new Array(totalFrames);

  let maxEnergy = 0;

  for (let frame = 0; frame < totalFrames; frame++) {
    const timeSec = frame / fps;
    const centerSample = Math.floor(timeSec * sampleRate);
    const halfWindow = fftSize / 2;
    const start = Math.max(0, centerSample - halfWindow);
    const end = Math.min(channelData.length, centerSample + halfWindow);

    let sumSquares = 0;
    for (let i = start; i < end; i++) {
      sumSquares += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sumSquares / (end - start || 1));

    energies[frame] = rms;
    if (rms > maxEnergy) maxEnergy = rms;
  }

  if (maxEnergy > 0) {
    for (let i = 0; i < energies.length; i++) {
      energies[i] = energies[i] / maxEnergy;
    }
  }

  return { energies, duration };
}

/**
 * Compute beats from energies with configurable sensitivity.
 * sensitivity: 0..1 where 0 = very few beats, 1 = everything is a beat.
 * Controls the onset detection multiplier and lookback window.
 */
export function computeBeats(
  energies: number[],
  sensitivity: number,
): number[] {
  const len = energies.length;
  const beats: number[] = new Array(len);

  // Map sensitivity 0..1 to useful ranges:
  // - multiplier: higher = more amplification of onset differences (1..6)
  // - windowSize: lower = more reactive to fast changes (3..15)
  const multiplier = 1 + sensitivity * 5;
  const windowSize = Math.round(15 - sensitivity * 12);

  for (let i = 0; i < len; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize); j < i; j++) {
      sum += energies[j];
      count++;
    }
    const localAvg = count > 0 ? sum / count : 0;
    beats[i] = Math.max(0, (energies[i] - localAvg) * multiplier);
  }

  let maxBeat = 0;
  for (let i = 0; i < len; i++) {
    if (beats[i] > maxBeat) maxBeat = beats[i];
  }
  if (maxBeat > 0) {
    for (let i = 0; i < len; i++) {
      beats[i] = Math.min(1, beats[i] / maxBeat);
    }
  }

  return beats;
}
