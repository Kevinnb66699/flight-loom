import type { FlightSegment } from "./flight-data";

type FlightAudioVoice = {
  oscillator: OscillatorNode;
  envelope: GainNode;
};

export type FlightAudioRig = {
  context: AudioContext;
  master: GainNode;
  noteBus: GainNode;
  reverb: ConvolverNode;
  wetGain: GainNode;
  windSource: AudioBufferSourceNode;
  windFilter: BiquadFilterNode;
  windGain: GainNode;
  activeNotes: Set<FlightAudioVoice>;
  noteStep: number;
  resumePromise: Promise<boolean> | null;
};

const PENTATONIC_OFFSETS = [0, 2, 4, 7, 9, 12, 14, 16, 19] as const;

const clampAudio = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const seededNoise = (length: number, seed: number) => {
  const values = new Float32Array(length);
  let state = seed >>> 0;

  for (let index = 0; index < length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    values[index] = (state / 0x100000000) * 2 - 1;
  }

  return values;
};

export const midiToFrequency = (midi: number) =>
  440 * 2 ** ((midi - 69) / 12);

export function getFlightSoundSettings(
  segment: FlightSegment,
  segmentIndex: number,
  noteStep: number,
) {
  const lift = clampAudio(segment.lift, -1, 1);
  const energy = clampAudio(segment.energy);
  const sceneShift = clampAudio(segment.sceneShift);
  const liftDegree = Math.round(((lift + 1) / 2) * 4);
  const direction = segment.reversed ? -1 : 1;
  const phraseOffset = direction * ((segmentIndex + noteStep) % 3);
  const degree = Math.round(
    clampAudio(liftDegree + phraseOffset, 0, PENTATONIC_OFFSETS.length - 1),
  );
  const midi = 48 + PENTATONIC_OFFSETS[degree];

  return {
    frequency: midiToFrequency(midi),
    intervalSeconds: 1.25 - energy * 0.55,
    pan: clampAudio(segment.turn * 2, -0.45, 0.45),
    peakGain: 0.025 + energy * 0.025,
    attackSeconds: 0.03 + (1 - energy) * 0.04,
    releaseSeconds: 0.85 + (1 - energy) * 0.4,
    filterFrequency: 700 + sceneShift * 1100 + energy * 300,
    windFrequency: 350 + sceneShift * 550,
    windGain: 0.0025 + energy * 0.006,
    wetGain: 0.06 + sceneShift * 0.08,
    repeats: Math.round(clampAudio(segment.repeats, 1, 3)),
  };
}

function createImpulseResponse(context: AudioContext) {
  const duration = 1.35;
  const length = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const noise = seededNoise(length, 731 + channel * 97);
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      data[index] = noise[index] * (1 - progress) ** 2.8;
    }
  }

  return impulse;
}

export function createFlightAudioRig(context: AudioContext): FlightAudioRig {
  const master = context.createGain();
  master.gain.value = 0.72;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  master.connect(compressor);
  compressor.connect(context.destination);

  const noteBus = context.createGain();
  noteBus.gain.value = 1;
  noteBus.connect(master);

  const reverb = context.createConvolver();
  reverb.buffer = createImpulseResponse(context);
  const wetGain = context.createGain();
  wetGain.gain.value = 0.1;
  noteBus.connect(reverb);
  reverb.connect(wetGain);
  wetGain.connect(master);

  const windBuffer = context.createBuffer(
    1,
    Math.floor(context.sampleRate * 2),
    context.sampleRate,
  );
  windBuffer.copyToChannel(
    seededNoise(windBuffer.length, 20260729),
    0,
  );

  const windSource = context.createBufferSource();
  windSource.buffer = windBuffer;
  windSource.loop = true;
  const windFilter = context.createBiquadFilter();
  windFilter.type = "bandpass";
  windFilter.frequency.value = 520;
  windFilter.Q.value = 0.45;
  const windGain = context.createGain();
  windGain.gain.value = 0.0001;
  windSource.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(master);
  windSource.start();

  return {
    context,
    master,
    noteBus,
    reverb,
    wetGain,
    windSource,
    windFilter,
    windGain,
    activeNotes: new Set(),
    noteStep: 0,
    resumePromise: null,
  };
}

export function updateFlightAmbient(
  rig: FlightAudioRig,
  segment: FlightSegment,
) {
  if (rig.context.state === "closed") return;

  const settings = getFlightSoundSettings(segment, 0, rig.noteStep);
  const now = rig.context.currentTime;
  rig.windFilter.frequency.setTargetAtTime(
    settings.windFrequency,
    now,
    0.65,
  );
  rig.windGain.gain.setTargetAtTime(settings.windGain, now, 0.7);
  rig.wetGain.gain.setTargetAtTime(settings.wetGain, now, 0.5);
}

export function hushFlightAmbient(rig: FlightAudioRig | null) {
  if (!rig || rig.context.state === "closed") return;
  rig.windGain.gain.setTargetAtTime(0.0001, rig.context.currentTime, 0.24);
}

export async function resumeFlightAudioRig(rig: FlightAudioRig) {
  if (rig.context.state === "closed") return false;
  if (rig.context.state === "running") return true;
  if (rig.resumePromise) return rig.resumePromise;

  rig.resumePromise = (async () => {
    try {
      await rig.context.resume();
      return rig.context.state === "running";
    } catch {
      return false;
    } finally {
      rig.resumePromise = null;
    }
  })();

  return rig.resumePromise;
}

export function stopFlightNotes(rig: FlightAudioRig | null) {
  if (!rig || rig.context.state === "closed") return;

  const now = rig.context.currentTime;
  rig.activeNotes.forEach(({ oscillator, envelope }) => {
    envelope.gain.cancelScheduledValues(now);
    envelope.gain.setTargetAtTime(0.0001, now, 0.015);
    try {
      oscillator.stop(now + 0.05);
    } catch {
      // The note may already have reached its scheduled stop time.
    }
  });
}

export function playFlightNote(
  rig: FlightAudioRig,
  segment: FlightSegment,
  segmentIndex: number,
) {
  if (rig.context.state !== "running") return;

  const settings = getFlightSoundSettings(
    segment,
    segmentIndex,
    rig.noteStep,
  );
  const context = rig.context;

  for (let repeat = 0; repeat < settings.repeats; repeat += 1) {
    if (rig.activeNotes.size >= 8) break;

    const start = context.currentTime + repeat * 0.28;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const panner =
      typeof context.createStereoPanner === "function"
        ? context.createStereoPanner()
        : null;
    const repeatGain = settings.peakGain * 0.62 ** repeat;
    const end =
      start + settings.attackSeconds + settings.releaseSeconds;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(settings.frequency, start);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(settings.filterFrequency, start);
    filter.Q.value = 0.7;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(
      repeatGain,
      start + settings.attackSeconds,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(filter);
    filter.connect(envelope);
    if (panner) {
      panner.pan.setValueAtTime(settings.pan, start);
      envelope.connect(panner);
      panner.connect(rig.noteBus);
    } else {
      envelope.connect(rig.noteBus);
    }

    const voice = { oscillator, envelope };
    rig.activeNotes.add(voice);
    oscillator.start(start);
    oscillator.stop(end + 0.05);
    oscillator.onended = () => {
      oscillator.disconnect();
      filter.disconnect();
      envelope.disconnect();
      panner?.disconnect();
      rig.activeNotes.delete(voice);
    };
  }

  rig.noteStep += 1;
}

export async function closeFlightAudioRig(rig: FlightAudioRig) {
  if (rig.context.state === "closed") return;

  const now = rig.context.currentTime;
  rig.master.gain.cancelScheduledValues(now);
  rig.master.gain.setValueAtTime(
    Math.max(0.0001, rig.master.gain.value),
    now,
  );
  rig.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  rig.windSource.stop(now + 0.05);
  stopFlightNotes(rig);

  await new Promise((resolve) => globalThis.setTimeout(resolve, 60));
  await rig.context.close();
  rig.activeNotes.clear();
}
