import type { FlightSegment } from "./flight-data";

type FrameSample = {
  time: number;
  color: readonly [number, number, number];
  luminance: Float32Array;
  centroidX: number;
  centroidY: number;
  frameDifference: number;
  driftX: number;
  driftY: number;
};

const ANALYSIS_TIMEOUT_MS = 20_000;
const MAX_SEGMENTS = 5;

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "The browser took too long to read this video. Try an MP4 (H.264) or WebM file.",
        ),
      );
    }, ANALYSIS_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("error", handleError);
    };

    const handleLoaded = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(
        new Error(
          "The browser could not read this video. Try an MP4 (H.264) or WebM file.",
        ),
      );
    };

    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("error", handleError);
  });
}

function seekToFrame(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = window.setTimeout(() => {
      finish(
        new Error(
          `A frame near ${time.toFixed(1)}s could not be decoded. Try converting the video to MP4 (H.264).`,
        ),
      );
    }, ANALYSIS_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("loadeddata", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();

      if (error) {
        reject(error);
      } else {
        // Yield one paint so the decoded frame is available to drawImage.
        window.requestAnimationFrame(() => resolve());
      }
    };

    const handleSeeked = () => finish();
    const handleError = () =>
      finish(
        new Error(
          `The browser failed while decoding a frame near ${time.toFixed(1)}s.`,
        ),
      );

    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("loadeddata", handleSeeked);
    video.addEventListener("error", handleError);

    if (Math.abs(video.currentTime - time) < 0.005 && video.readyState >= 2) {
      finish();
      return;
    }

    try {
      video.currentTime = time;
    } catch {
      finish(
        new Error(
          `The browser could not seek to a frame near ${time.toFixed(1)}s.`,
        ),
      );
    }
  });
}

function readFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  previousLuminance?: Float32Array,
): Omit<FrameSample, "time" | "driftX" | "driftY"> {
  const pixels = context.getImageData(0, 0, width, height).data;
  const pixelCount = width * height;
  const luminance = new Float32Array(pixelCount);

  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;
  let weightedX = 0;
  let weightedY = 0;
  let difference = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;

    red += r;
    green += g;
    blue += b;
    luminance[index] = luma;

    const x = index % width;
    const y = Math.floor(index / width);
    weight += luma;
    weightedX += x * luma;
    weightedY += y * luma;

    if (previousLuminance) {
      difference += Math.abs(luma - previousLuminance[index]);
    }
  }

  const hasVisiblePixels = weight > 0.001;
  const centroidX = hasVisiblePixels
    ? weightedX / weight / Math.max(1, width - 1)
    : 0.5;
  const centroidY = hasVisiblePixels
    ? weightedY / weight / Math.max(1, height - 1)
    : 0.5;

  return {
    color: [
      Math.round(red / pixelCount),
      Math.round(green / pixelCount),
      Math.round(blue / pixelCount),
    ],
    luminance,
    centroidX,
    centroidY,
    frameDifference: previousLuminance
      ? difference / pixelCount / 255
      : 0,
  };
}

function percentile(values: number[], ratio: number, floor: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * ratio)),
  );
  return Math.max(floor, sorted[index] ?? floor);
}

function channelToHex(value: number) {
  return Math.round(clamp(value, 0, 255))
    .toString(16)
    .padStart(2, "0");
}

function colorToHex(color: readonly [number, number, number]) {
  return `#${channelToHex(color[0])}${channelToHex(color[1])}${channelToHex(color[2])}`;
}

function averageColor(samples: FrameSample[]): readonly [number, number, number] {
  const total = samples.reduce(
    (sum, sample) => [
      sum[0] + sample.color[0],
      sum[1] + sample.color[1],
      sum[2] + sample.color[2],
    ],
    [0, 0, 0],
  );

  return [
    total[0] / samples.length,
    total[1] / samples.length,
    total[2] / samples.length,
  ];
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function segmentLabel(
  energy: number,
  turn: number,
  lift: number,
  index: number,
) {
  let movement = "Open glide";

  if (energy < 0.2) {
    movement = "Quiet drift";
  } else if (Math.abs(turn) > 0.38) {
    movement = turn > 0 ? "Rightward bend" : "Leftward bend";
  } else if (Math.abs(lift) > 0.34) {
    movement = lift > 0 ? "Rising thread" : "Descending thread";
  } else if (energy > 0.72) {
    movement = "Kinetic weave";
  }

  return `${String(index + 1).padStart(2, "0")} · ${movement}`;
}

function buildSegments(
  samples: FrameSample[],
  duration: number,
): FlightSegment[] {
  const segmentCount = Math.min(
    MAX_SEGMENTS,
    Math.max(1, Math.ceil(duration / 6)),
  );
  const differenceScale = percentile(
    samples.slice(1).map((sample) => sample.frameDifference),
    0.9,
    0.035,
  );
  const driftScale = percentile(
    samples
      .slice(1)
      .map((sample) => Math.hypot(sample.driftX, sample.driftY)),
    0.9,
    0.025,
  );

  return Array.from({ length: segmentCount }, (_, segmentIndex) => {
    const startIndex = Math.floor(
      (segmentIndex * samples.length) / segmentCount,
    );
    const endIndex = Math.max(
      startIndex + 1,
      Math.floor(((segmentIndex + 1) * samples.length) / segmentCount),
    );
    const group = samples.slice(startIndex, endIndex);

    const sceneShift = clamp(
      average(group.map((sample) => sample.frameDifference)) / differenceScale,
    );
    const turn = clamp(
      average(group.map((sample) => sample.driftX)) / driftScale,
      -1,
      1,
    );
    // Canvas Y grows downward, so upward visual drift is positive "lift".
    const lift = clamp(
      -average(group.map((sample) => sample.driftY)) / driftScale,
      -1,
      1,
    );
    const driftEnergy = clamp(
      average(
        group.map((sample) => Math.hypot(sample.driftX, sample.driftY)),
      ) / driftScale,
    );
    const energy = clamp(sceneShift * 0.72 + driftEnergy * 0.28);

    const middle = group[Math.floor((group.length - 1) / 2)];
    const palette = [
      colorToHex(group[0].color),
      colorToHex(averageColor(group)),
      colorToHex(group[group.length - 1]?.color ?? middle.color),
    ] as const;

    const segmentStart = (segmentIndex / segmentCount) * duration;
    const segmentEnd = ((segmentIndex + 1) / segmentCount) * duration;

    return {
      id: `analyzed-${segmentIndex + 1}`,
      label: segmentLabel(energy, turn, lift, segmentIndex),
      duration: Math.max(0.1, segmentEnd - segmentStart),
      energy,
      turn,
      lift,
      palette,
      sceneShift,
      repeats: 1,
      reversed: false,
    };
  });
}

/**
 * Samples a local video in the browser and turns its changing color and
 * brightness distribution into a small set of creative flight controls.
 *
 * `turn` and `lift` use brightness-centroid drift as a lightweight visual
 * motion approximation. They are expressive inputs for Flight Loom, not
 * scientifically accurate optical-flow or flight-telemetry measurements.
 */
export async function analyzeVideoFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<FlightSegment[]> {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof URL === "undefined"
  ) {
    throw new Error("Video analysis is available only in a web browser.");
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a non-empty local video file to analyze.");
  }
  if (file.type && !file.type.startsWith("video/")) {
    throw new Error("This file does not appear to be a video.");
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");

  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.left = "-9999px";
  video.style.opacity = "0";

  try {
    onProgress?.(0);
    document.body.appendChild(video);

    const metadataReady = waitForVideoMetadata(video);
    video.src = objectUrl;
    video.load();
    await metadataReady;

    const duration = video.duration;
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      throw new Error("The selected video has no readable duration or frames.");
    }

    const longestSide = 96;
    const scale =
      longestSide / Math.max(video.videoWidth, video.videoHeight, 1);
    canvas.width = Math.max(24, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(24, Math.round(video.videoHeight * scale));

    const context = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });
    if (!context) {
      throw new Error("This browser cannot create a canvas for video analysis.");
    }

    const sampleCount = Math.round(
      clamp(24 + Math.min(duration, 60) / 7.5, 24, 32),
    );
    const start = Math.min(0.04, duration * 0.01);
    const end = Math.max(start, duration - Math.min(0.06, duration * 0.01));
    const samples: FrameSample[] = [];
    let previousLuminance: Float32Array | undefined;
    let previousCentroidX = 0.5;
    let previousCentroidY = 0.5;

    for (let index = 0; index < sampleCount; index += 1) {
      const ratio = sampleCount === 1 ? 0 : index / (sampleCount - 1);
      const time = start + (end - start) * ratio;

      await seekToFrame(video, time);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = readFrame(
        context,
        canvas.width,
        canvas.height,
        previousLuminance,
      );

      samples.push({
        ...frame,
        time,
        driftX:
          index === 0 ? 0 : frame.centroidX - previousCentroidX,
        driftY:
          index === 0 ? 0 : frame.centroidY - previousCentroidY,
      });

      previousLuminance = frame.luminance;
      previousCentroidX = frame.centroidX;
      previousCentroidY = frame.centroidY;
      onProgress?.(((index + 1) / sampleCount) * 0.94);
    }

    const segments = buildSegments(samples, duration);
    onProgress?.(1);
    return segments;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Flight Loom could not analyze this video.");
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    canvas.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
