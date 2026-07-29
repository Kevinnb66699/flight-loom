export type FlightPalette = readonly [string, string, string];

export type FlightSegment = Readonly<{
  id: string;
  label: string;
  duration: number;
  energy: number;
  turn: number;
  lift: number;
  palette: FlightPalette;
  sceneShift: number;
  repeats: number;
  reversed: boolean;
}>;

export type OverallMood =
  | "Quiet Drift"
  | "Rising Light"
  | "Descending Hush"
  | "Kinetic Current"
  | "Shifting Horizon"
  | "Cinematic Flow";

export const sampleFlightSource = {
  label: "Recorded cliff-to-valley flight",
  videoSrc: "/demo/flight-loom-source.mp4",
  webmSrc: "/demo/flight-loom-source.webm",
  posterSrc: "/demo/flight-loom-source-poster.webp",
  duration: 32.5,
  credit: "Project-provided drone footage",
} as const;

export const sampleFlight: readonly FlightSegment[] = [
  {
    id: "cliff-valley-1",
    label: "Cliffside Passage",
    duration: 6.5,
    energy: 0.793,
    turn: -0.099,
    lift: -0.094,
    palette: ["#4868A8", "#182828", "#989888"],
    sceneShift: 0.942,
    repeats: 1,
    reversed: false,
  },
  {
    id: "cliff-valley-2",
    label: "Ridge Release",
    duration: 6.5,
    energy: 0.705,
    turn: 0.129,
    lift: -0.029,
    palette: ["#385898", "#687888", "#384868"],
    sceneShift: 0.797,
    repeats: 1,
    reversed: false,
  },
  {
    id: "cliff-valley-3",
    label: "Valley Turn",
    duration: 6.5,
    energy: 0.662,
    turn: 0.057,
    lift: -0.049,
    palette: ["#284888", "#586878", "#788888"],
    sceneShift: 0.858,
    repeats: 1,
    reversed: false,
  },
  {
    id: "cliff-valley-4",
    label: "River Thread",
    duration: 6.5,
    energy: 0.715,
    turn: 0.082,
    lift: 0.009,
    palette: ["#284888", "#687868", "#788898"],
    sceneShift: 0.947,
    repeats: 1,
    reversed: false,
  },
  {
    id: "cliff-valley-5",
    label: "Stone Horizon",
    duration: 6.5,
    energy: 0.627,
    turn: -0.142,
    lift: 0.007,
    palette: ["#888878", "#686858", "#284878"],
    sceneShift: 0.808,
    repeats: 1,
    reversed: false,
  },
];

export function normalize(value: number, min: number, max: number): number {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    max <= min
  ) {
    return 0;
  }

  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function moveSegment(
  segments: readonly FlightSegment[],
  fromIndex: number,
  toIndex: number,
): FlightSegment[] {
  const reordered = [...segments];

  if (
    reordered.length < 2 ||
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    fromIndex >= reordered.length
  ) {
    return reordered;
  }

  const destination = Math.min(Math.max(toIndex, 0), reordered.length - 1);
  if (fromIndex === destination) {
    return reordered;
  }

  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(destination, 0, moved);
  return reordered;
}

export function reorderSegments(
  segments: readonly FlightSegment[],
  movingId: string,
  targetId: string,
): FlightSegment[] {
  const fromIndex = segments.findIndex(({ id }) => id === movingId);
  const toIndex = segments.findIndex(({ id }) => id === targetId);

  if (fromIndex === -1 || toIndex === -1) {
    return [...segments];
  }

  return moveSegment(segments, fromIndex, toIndex);
}

export function toggleReverse(
  segments: readonly FlightSegment[],
  segmentId: string,
): FlightSegment[] {
  return segments.map((segment) =>
    segment.id === segmentId
      ? { ...segment, reversed: !segment.reversed }
      : segment,
  );
}

export function cycleRepeats(
  segments: readonly FlightSegment[],
  segmentId: string,
): FlightSegment[] {
  return segments.map((segment) =>
    segment.id === segmentId
      ? {
          ...segment,
          repeats: segment.repeats >= 3 ? 1 : segment.repeats + 1,
        }
      : segment,
  );
}

export function deriveOverallMood(
  segments: readonly FlightSegment[],
): OverallMood {
  if (segments.length === 0) {
    return "Quiet Drift";
  }

  let totalWeight = 0;
  let energy = 0;
  let lift = 0;
  let turn = 0;
  let sceneShift = 0;

  for (const segment of segments) {
    const weight =
      Math.max(0, segment.duration) * Math.max(1, segment.repeats);
    const direction = segment.reversed ? -1 : 1;

    totalWeight += weight;
    energy += normalize(segment.energy, 0, 1) * weight;
    lift += Math.max(-1, Math.min(1, segment.lift)) * direction * weight;
    turn += Math.abs(Math.max(-1, Math.min(1, segment.turn))) * weight;
    sceneShift += normalize(segment.sceneShift, 0, 1) * weight;
  }

  if (totalWeight === 0) {
    return "Quiet Drift";
  }

  energy /= totalWeight;
  lift /= totalWeight;
  turn /= totalWeight;
  sceneShift /= totalWeight;

  if (energy <= 0.35 && sceneShift <= 0.4) {
    return "Quiet Drift";
  }
  if (lift >= 0.32) {
    return "Rising Light";
  }
  if (lift <= -0.32) {
    return "Descending Hush";
  }
  if (energy >= 0.72 || turn >= 0.62) {
    return "Kinetic Current";
  }
  if (sceneShift >= 0.65) {
    return "Shifting Horizon";
  }

  return "Cinematic Flow";
}
