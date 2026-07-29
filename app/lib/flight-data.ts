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

export const sampleFlight: readonly FlightSegment[] = [
  {
    id: "dawn-thread",
    label: "Dawn Thread",
    duration: 8,
    energy: 0.28,
    turn: -0.12,
    lift: 0.19,
    palette: ["#E8D7BC", "#A6B8AE", "#F3A85F"],
    sceneShift: 0.18,
    repeats: 1,
    reversed: false,
  },
  {
    id: "canyon-arc",
    label: "Canyon Arc",
    duration: 11,
    energy: 0.67,
    turn: 0.79,
    lift: 0.05,
    palette: ["#C56B4E", "#663F36", "#E9B872"],
    sceneShift: 0.55,
    repeats: 1,
    reversed: false,
  },
  {
    id: "cloud-lift",
    label: "Cloud Lift",
    duration: 9,
    energy: 0.54,
    turn: 0.18,
    lift: 0.82,
    palette: ["#D8E7EF", "#8FB5CB", "#F7F2DE"],
    sceneShift: 0.36,
    repeats: 1,
    reversed: false,
  },
  {
    id: "forest-pulse",
    label: "Forest Pulse",
    duration: 12,
    energy: 0.81,
    turn: -0.51,
    lift: -0.28,
    palette: ["#173F35", "#477A5A", "#C4A75A"],
    sceneShift: 0.78,
    repeats: 1,
    reversed: false,
  },
  {
    id: "homeward-drift",
    label: "Homeward Drift",
    duration: 10,
    energy: 0.38,
    turn: 0.22,
    lift: -0.62,
    palette: ["#475B6B", "#B46F63", "#E6C995"],
    sceneShift: 0.31,
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
