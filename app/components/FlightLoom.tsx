"use client";

import {
  ChangeEvent,
  CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  cycleRepeats,
  deriveOverallMood,
  findSegmentAtTime,
  FlightSegment,
  moveSegment,
  sampleFlight,
  sampleFlightSource,
  toggleReverse,
} from "../lib/flight-data";
import {
  closeFlightAudioRig,
  createFlightAudioRig,
  FlightAudioRig,
  getFlightSoundSettings,
  hushFlightAmbient,
  playFlightNote,
  resumeFlightAudioRig,
  stopFlightNotes,
  updateFlightAmbient,
} from "../lib/flight-audio";

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const signedPercent = (value: number) =>
  `${value >= 0 ? "+" : ""}${Math.round(value * 100)}%`;

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
};

const horizontalDriftLabel = (value: number) => {
  if (value < -0.08) return "leftward curve";
  if (value > 0.08) return "rightward curve";
  return "nearly straight";
};

const verticalDriftLabel = (value: number) => {
  if (value < -0.08) return "downward pull";
  if (value > 0.08) return "upward pull";
  return "level pull";
};

function FlightCanvas({
  segments,
  activeId,
  started,
  revealProgress,
}: {
  segments: readonly FlightSegment[];
  activeId: string;
  started: boolean;
  revealProgress: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revealProgressRef = useRef(revealProgress);

  useEffect(() => {
    revealProgressRef.current = revealProgress;
  }, [revealProgress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let hasDrawn = false;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      if (reduceMotion && hasDrawn) {
        cancelAnimationFrame(animationFrame);
        animationFrame = requestAnimationFrame(draw);
      }
    };

    const draw = () => {
      hasDrawn = true;
      frame += reduceMotion ? 0 : 1;
      context.clearRect(0, 0, width, height);

      const background = context.createRadialGradient(
        width * 0.5,
        height * 0.42,
        20,
        width * 0.5,
        height * 0.42,
        Math.max(width, height) * 0.78,
      );
      background.addColorStop(0, "#17201d");
      background.addColorStop(0.48, "#0d1312");
      background.addColorStop(1, "#070a09");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = "rgba(239, 226, 199, 0.04)";
      context.lineWidth = 1;
      for (let x = 16; x < width; x += 22) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      if (segments.length === 0) {
        if (!reduceMotion) {
          animationFrame = requestAnimationFrame(draw);
        }
        return;
      }

      const left = Math.max(20, width * 0.045);
      const top = Math.max(54, height * 0.12);
      const clothWidth = width - left * 2;
      const clothHeight = height - top - Math.max(52, height * 0.13);
      const totalDuration = segments.reduce(
        (total, segment) => total + Math.max(0.1, segment.duration),
        0,
      );
      const time = frame * 0.007;
      let elapsed = 0;

      context.fillStyle = "rgba(239, 226, 199, 0.025)";
      context.fillRect(left, top, clothWidth, clothHeight);

      const bands = segments.map((segment) => {
        const startRatio = elapsed / totalDuration;
        elapsed += Math.max(0.1, segment.duration);
        const endRatio = elapsed / totalDuration;
        return {
          segment,
          xStart: left + startRatio * clothWidth,
          xEnd: left + endRatio * clothWidth,
        };
      });

      bands.forEach(({ segment, xStart, xEnd }, segmentIndex) => {
        const bandWidth = xEnd - xStart;
        const active = segment.id === activeId;
        const direction = segment.reversed ? -1 : 1;
        const density = Math.round(10 + segment.energy * 20);
        const bend = segment.turn * bandWidth * 0.56;
        const lift = segment.lift * clothHeight * 0.3;

        const wash = context.createLinearGradient(xStart, top, xEnd, top);
        wash.addColorStop(0, `${segment.palette[0]}${active ? "38" : "24"}`);
        wash.addColorStop(0.5, `${segment.palette[1]}${active ? "52" : "3d"}`);
        wash.addColorStop(1, `${segment.palette[2]}${active ? "38" : "24"}`);
        context.fillStyle = wash;
        context.fillRect(xStart, top, bandWidth, clothHeight);

        context.save();
        context.beginPath();
        context.rect(xStart, top, bandWidth, clothHeight);
        context.clip();
        context.globalCompositeOperation = "screen";

        for (let repeat = 0; repeat < segment.repeats; repeat += 1) {
          const repeatOffset = repeat * 3;
          for (let thread = 0; thread < density; thread += 1) {
            const ratio = thread / Math.max(1, density - 1);
            const pulse =
              Math.sin(
                time * 1.8 * direction + thread * 0.42 + segmentIndex,
              ) *
              (2.2 + segment.energy * 5);
            const y = top + ratio * clothHeight + pulse + repeatOffset;

            context.beginPath();
            context.moveTo(xStart - 2, y + lift * 0.15);
            context.bezierCurveTo(
              xStart + bandWidth * 0.28,
              y - bend + lift,
              xStart + bandWidth * 0.72,
              y + bend - lift,
              xEnd + 2,
              y - lift * 0.15,
            );
            const threadColor =
              segment.palette[(thread + repeat) % segment.palette.length];
            context.strokeStyle = threadColor;
            context.globalAlpha =
              0.42 + segment.energy * 0.4 + repeat * 0.05;
            context.lineWidth = active ? 2.1 : 1.35;
            context.shadowColor = threadColor;
            context.shadowBlur = active ? 4 : 0;
            context.stroke();

            context.shadowBlur = 0;
            context.strokeStyle = "rgba(239, 226, 199, 0.62)";
            context.globalAlpha = active ? 0.48 : 0.27;
            context.lineWidth = active ? 0.7 : 0.45;
            context.stroke();
          }
        }

        if (segment.reversed) {
          const unravel = context.createLinearGradient(xStart, 0, xEnd, 0);
          unravel.addColorStop(0, "rgba(7, 10, 9, 0.04)");
          unravel.addColorStop(0.7, "rgba(7, 10, 9, 0.4)");
          unravel.addColorStop(1, "rgba(7, 10, 9, 0.88)");
          context.globalCompositeOperation = "source-over";
          context.globalAlpha = 1;
          context.fillStyle = unravel;
          context.fillRect(xStart, top, bandWidth, clothHeight);
        }

        context.restore();

        context.strokeStyle = active
          ? "rgba(239, 190, 92, 0.82)"
          : "rgba(239, 226, 199, 0.13)";
        context.lineWidth = active ? 1.5 : 1;
        context.strokeRect(xStart, top, bandWidth, clothHeight);

        context.fillStyle = active
          ? "rgba(239, 226, 199, 0.92)"
          : "rgba(239, 226, 199, 0.46)";
        context.font = "10px ui-monospace, SFMono-Regular, monospace";
        context.fillText(
          String(segmentIndex + 1).padStart(2, "0"),
          xStart + 7,
          top - 13,
        );
      });

      const warpCount = Math.max(18, Math.round(clothWidth / 13));
      context.save();
      context.globalCompositeOperation = "screen";
      for (let warp = 0; warp < warpCount; warp += 1) {
        const ratio = warp / Math.max(1, warpCount - 1);
        const x = left + ratio * clothWidth;
        const band =
          bands.find(({ xStart, xEnd }) => x >= xStart && x <= xEnd) ??
          bands[bands.length - 1];
        const wave =
          Math.sin(time + warp * 0.58) *
          (1.5 + band.segment.sceneShift * 4.6);
        context.beginPath();
        context.moveTo(x + wave, top);
        context.bezierCurveTo(
          x - wave,
          top + clothHeight * 0.33,
          x + wave,
          top + clothHeight * 0.67,
          x - wave,
          top + clothHeight,
        );
        context.strokeStyle =
          band.segment.palette[(warp + 1) % band.segment.palette.length];
        context.globalAlpha = 0.3;
        context.lineWidth = 1;
        context.stroke();

        if (warp % 4 === 0) {
          context.strokeStyle = "rgba(239, 226, 199, 0.38)";
          context.globalAlpha = 0.22;
          context.lineWidth = 0.5;
          context.stroke();
        }
      }
      context.restore();

      const visibleRatio = started
        ? clamp(revealProgressRef.current, 0.025, 1)
        : 0.08;
      const revealX = left + clothWidth * visibleRatio;

      if (visibleRatio < 0.999) {
        const futureMask = context.createLinearGradient(
          revealX,
          0,
          Math.min(width, revealX + 68),
          0,
        );
        futureMask.addColorStop(0, "rgba(7, 10, 9, 0.18)");
        futureMask.addColorStop(1, "rgba(7, 10, 9, 0.48)");
        context.fillStyle = futureMask;
        context.fillRect(
          revealX,
          top - 1,
          left + clothWidth - revealX + 1,
          clothHeight + 2,
        );

        context.strokeStyle = "rgba(239, 190, 92, 0.88)";
        context.shadowColor = "rgba(239, 190, 92, 0.55)";
        context.shadowBlur = 12;
        context.beginPath();
        context.moveTo(revealX, top - 8);
        context.lineTo(revealX, top + clothHeight + 8);
        context.stroke();

        context.fillStyle = "#efbe5c";
        context.beginPath();
        context.moveTo(revealX - 8, top + clothHeight * 0.5);
        context.lineTo(revealX, top + clothHeight * 0.5 - 5);
        context.lineTo(revealX + 8, top + clothHeight * 0.5);
        context.lineTo(revealX, top + clothHeight * 0.5 + 5);
        context.closePath();
        context.fill();
        context.shadowBlur = 0;
      }

      context.strokeStyle = "rgba(239, 226, 199, 0.18)";
      context.strokeRect(left, top, clothWidth, clothHeight);

      if (!reduceMotion) {
        animationFrame = requestAnimationFrame(draw);
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    draw();
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [activeId, segments, started]);

  return (
    <canvas
      ref={canvasRef}
      className="loom-canvas"
      role="img"
      aria-label={`A digital textile woven from ${segments.length} flight movements`}
    />
  );
}

function MetricRow({
  label,
  value,
  amount,
  result,
  signed = false,
}: {
  label: string;
  value: string;
  amount: number;
  result: string;
  signed?: boolean;
}) {
  const metricLeft = signed
    ? amount < 0
      ? 50 - Math.abs(clamp(amount, -1, 1)) * 50
      : 50
    : 0;
  const metricWidth = signed
    ? Math.abs(clamp(amount, -1, 1)) * 50
    : clamp(amount) * 100;

  return (
    <div className={`metric-row ${signed ? "is-signed" : ""}`}>
      <div className="metric-heading">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="metric-track" aria-hidden="true">
        {signed && <span className="metric-zero" />}
        <span
          className="metric-fill"
          style={
            {
              "--metric-left": `${metricLeft}%`,
              "--metric-width": `${metricWidth}%`,
            } as CSSProperties
          }
        />
      </div>
      <small>{result}</small>
    </div>
  );
}

export function FlightLoom() {
  const [segments, setSegments] = useState<FlightSegment[]>([
    ...sampleFlight,
  ]);
  const [sourceSegments, setSourceSegments] = useState<FlightSegment[]>([
    ...sampleFlight,
  ]);
  const [selectedBandId, setSelectedBandId] = useState(sampleFlight[0].id);
  const [started, setStarted] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<number | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>(
    sampleFlightSource.label,
  );
  const [usingSample, setUsingSample] = useState(true);
  const [followPlayback, setFollowPlayback] = useState(true);
  const [playhead, setPlayhead] = useState(0);
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "Press play to watch this flight become a textile.",
  );
  const audioRef = useRef<FlightAudioRig | null>(null);
  const demoVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisRunRef = useRef(0);
  const lastSoundTimeRef = useRef(Number.NEGATIVE_INFINITY);
  const soundTransitionRef = useRef(false);
  const pendingAudioContextRef = useRef<AudioContext | null>(null);
  const mountedRef = useRef(true);

  const selectedIndex = Math.max(
    0,
    segments.findIndex(({ id }) => id === selectedBandId),
  );
  const selectedSegment = segments[selectedIndex] ?? segments[0];
  const sourceActivePosition = useMemo(
    () => findSegmentAtTime(sourceSegments, playhead),
    [playhead, sourceSegments],
  );
  const sourceActiveIndex = sourceActivePosition?.index ?? 0;
  const sourceActiveSegment =
    sourceActivePosition?.segment ?? sourceSegments[0];
  const sourceActiveId = sourceActiveSegment?.id ?? "";
  const mood = useMemo(() => deriveOverallMood(segments), [segments]);
  const totalDuration = useMemo(
    () =>
      sourceSegments.reduce(
        (total, segment) => total + Math.max(0.1, segment.duration),
        0,
      ),
    [sourceSegments],
  );
  const playheadPercent = clamp(playhead / Math.max(0.001, totalDuration)) * 100;
  const threadCount = sourceActiveSegment
    ? Math.round(10 + sourceActiveSegment.energy * 20)
    : 0;
  const driftAngle = sourceActiveSegment
    ? (Math.atan2(-sourceActiveSegment.lift, sourceActiveSegment.turn) * 180) /
      Math.PI
    : 0;
  const hasViewerEdits = useMemo(
    () => JSON.stringify(segments) !== JSON.stringify(sourceSegments),
    [segments, sourceSegments],
  );
  const revealProgress =
    followPlayback && !hasViewerEdits ? playheadPercent / 100 : started ? 1 : 0;
  const canvasActiveId = sourceActiveId || selectedBandId;

  useEffect(
    () => () => {
      if (customVideoUrl) {
        URL.revokeObjectURL(customVideoUrl);
      }
    },
    [customVideoUrl],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const pendingContext = pendingAudioContextRef.current;
      pendingAudioContextRef.current = null;
      if (pendingContext) {
        void pendingContext.close().catch(() => undefined);
      }
      const rig = audioRef.current;
      audioRef.current = null;
      if (rig) {
        void closeFlightAudioRig(rig);
      }
    };
  }, []);

  const playSampleFlight = () => {
    analysisRunRef.current += 1;
    setAnalysisProgress(null);
    setSegments([...sampleFlight]);
    setSourceSegments([...sampleFlight]);
    setSelectedBandId(sampleFlight[0].id);
    setSourceLabel(sampleFlightSource.label);
    setUsingSample(true);
    setFollowPlayback(true);
    setPlayhead(0);
    setCustomVideoUrl(null);
    setStarted(true);
    lastSoundTimeRef.current = Number.NEGATIVE_INFINITY;
    hushFlightAmbient(audioRef.current);
    stopFlightNotes(audioRef.current);
    setMessage("The gold shuttle follows the source video as it weaves.");
    if (audioRef.current) {
      void resumeFlightAudioRig(audioRef.current);
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById("experience")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      const video = demoVideoRef.current;
      if (!video) return;
      video.currentTime = 0;
      video.load();
      void video.play().catch(() => {
        setMessage("The weave is ready. Press play on the source video.");
      });
    });
  };

  const enableSound = async () => {
    if (soundTransitionRef.current) return;
    soundTransitionRef.current = true;

    const currentRig = audioRef.current;
    if (currentRig) {
      audioRef.current = null;
      setSoundOn(false);
      hushFlightAmbient(currentRig);
      stopFlightNotes(currentRig);
      setMessage("Soundscape off.");
      try {
        await closeFlightAudioRig(currentRig);
      } catch {
        // The browser may already have released an interrupted audio context.
      } finally {
        soundTransitionRef.current = false;
      }
      return;
    }

    let pendingContext: AudioContext | null = null;
    let pendingRig: FlightAudioRig | null = null;
    try {
      if (typeof AudioContext === "undefined") {
        throw new Error("Web Audio is not supported in this browser.");
      }
      if (!sourceActiveSegment) {
        throw new Error("No flight movement is available to sonify.");
      }

      pendingContext = new AudioContext();
      pendingAudioContextRef.current = pendingContext;
      if (pendingContext.state !== "running") {
        await pendingContext.resume();
      }
      if (!mountedRef.current) {
        await pendingContext.close();
        return;
      }
      pendingRig = createFlightAudioRig(pendingContext);
      audioRef.current = pendingRig;
      pendingAudioContextRef.current = null;
      updateFlightAmbient(pendingRig, sourceActiveSegment);
      playFlightNote(pendingRig, sourceActiveSegment, sourceActiveIndex);
      lastSoundTimeRef.current = playhead;
      setSoundOn(true);
      setStarted(true);
      setMessage(
        "Soundscape on: motion now triggers soft pentatonic notes.",
      );
      void demoVideoRef.current?.play().catch(() => {
        if (audioRef.current !== pendingRig) return;
        hushFlightAmbient(pendingRig);
        setMessage(
          "Soundscape is ready. Press play on the source video to hear it.",
        );
      });
    } catch (error) {
      audioRef.current = null;
      if (pendingAudioContextRef.current === pendingContext) {
        pendingAudioContextRef.current = null;
      }
      try {
        if (pendingRig) {
          await closeFlightAudioRig(pendingRig);
        } else if (pendingContext) {
          await pendingContext.close();
        }
      } catch {
        // The failed audio context may already be closed.
      }
      if (mountedRef.current) {
        setSoundOn(false);
        setMessage(
          error instanceof Error
            ? error.message
            : "The soundscape could not start in this browser.",
        );
      }
    } finally {
      soundTransitionRef.current = false;
    }
  };

  const previewSegmentSound = (
    segment: FlightSegment,
    segmentIndex = selectedIndex,
  ) => {
    const rig = audioRef.current;
    if (!rig) return;
    stopFlightNotes(rig);
    lastSoundTimeRef.current = playhead;
    void resumeFlightAudioRig(rig).then((running) => {
      if (running && audioRef.current === rig) {
        playFlightNote(rig, segment, segmentIndex);
      }
    });
  };

  const moveActive = (direction: -1 | 1) => {
    const destination = clamp(
      selectedIndex + direction,
      0,
      segments.length - 1,
    );
    setSegments((current) =>
      moveSegment(current, selectedIndex, destination),
    );
    setFollowPlayback(false);
    setMessage("Viewer edit: the selected band moved in the final textile.");
  };

  const reverseActive = () => {
    setSegments((current) => toggleReverse(current, selectedBandId));
    if (selectedSegment) {
      previewSegmentSound(
        { ...selectedSegment, reversed: !selectedSegment.reversed },
        selectedIndex,
      );
    }
    setFollowPlayback(false);
    setStarted(true);
    setMessage("Viewer edit: the selected band changed direction.");
  };

  const loopActive = () => {
    setSegments((current) => cycleRepeats(current, selectedBandId));
    if (selectedSegment) {
      previewSegmentSound(
        {
          ...selectedSegment,
          repeats:
            selectedSegment.repeats >= 3 ? 1 : selectedSegment.repeats + 1,
        },
        selectedIndex,
      );
    }
    setFollowPlayback(false);
    setStarted(true);
    setMessage("Viewer edit: repeating a band makes its threads denser.");
  };

  const resetFlight = () => {
    analysisRunRef.current += 1;
    setAnalysisProgress(null);
    const video = demoVideoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    setSegments([...sampleFlight]);
    setSourceSegments([...sampleFlight]);
    setSelectedBandId(sampleFlight[0].id);
    setStarted(false);
    setSourceLabel(sampleFlightSource.label);
    setUsingSample(true);
    setFollowPlayback(true);
    setPlayhead(0);
    setCustomVideoUrl(null);
    lastSoundTimeRef.current = Number.NEGATIVE_INFINITY;
    hushFlightAmbient(audioRef.current);
    stopFlightNotes(audioRef.current);
    setMessage("Press play to watch this flight become a textile.");
  };

  const analyzeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const runId = analysisRunRef.current + 1;
    analysisRunRef.current = runId;
    setAnalysisProgress(0);
    setMessage("Sampling motion and color locally in your browser.");
    try {
      const { analyzeVideoFile } = await import("../lib/analyze-video");
      const analyzed = await analyzeVideoFile(file, (progress) => {
        if (analysisRunRef.current === runId) {
          setAnalysisProgress(progress);
        }
      });
      if (analysisRunRef.current !== runId) return;

      demoVideoRef.current?.pause();
      setSegments(analyzed);
      setSourceSegments(analyzed);
      setSelectedBandId(analyzed[0].id);
      setSourceLabel(file.name);
      setCustomVideoUrl(URL.createObjectURL(file));
      setUsingSample(false);
      setFollowPlayback(true);
      setPlayhead(0);
      setStarted(true);
      lastSoundTimeRef.current = Number.NEGATIVE_INFINITY;
      hushFlightAmbient(audioRef.current);
      stopFlightNotes(audioRef.current);
      setMessage(
        "Analysis complete. Press play to watch your clip drive the weave.",
      );
      window.requestAnimationFrame(() => {
        document
          .getElementById("experience")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      if (analysisRunRef.current !== runId) return;
      setMessage(
        error instanceof Error
          ? error.message
          : "This clip could not be analyzed. The sample flight is still ready.",
      );
    } finally {
      if (analysisRunRef.current === runId) {
        setAnalysisProgress(null);
      }
      input.value = "";
    }
  };

  const focusSegment = (segment: FlightSegment) => {
    setSelectedBandId(segment.id);
    setFollowPlayback(false);
    setStarted(true);

    const sourceIndex = sourceSegments.findIndex(
      ({ id }) => id === segment.id,
    );
    if (sourceIndex >= 0) {
      const segmentStart = sourceSegments
        .slice(0, sourceIndex)
        .reduce((total, item) => total + item.duration, 0);
      const seekTime = segmentStart + sourceSegments[sourceIndex].duration * 0.12;
      const video = demoVideoRef.current;
      if (video) {
        video.pause();
        video.currentTime = seekTime;
      }
      setPlayhead(seekTime);
      lastSoundTimeRef.current = seekTime;
    }
    previewSegmentSound(segment, Math.max(0, sourceIndex));

    setMessage(
      `Paused on "${segment.label}" so you can compare its source and woven band.`,
    );
  };

  const resumeSource = () => {
    setFollowPlayback(true);
    if (sourceActiveId) {
      setSelectedBandId(sourceActiveId);
    }
    setStarted(true);
    setMessage("Following the original source timing again.");
    if (audioRef.current) {
      void resumeFlightAudioRig(audioRef.current);
    }
    void demoVideoRef.current?.play().catch(() => {
      setMessage("Press play on the source video to resume synchronization.");
    });
  };

  const handleTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const time = Math.min(
      event.currentTarget.currentTime,
      Math.max(0, totalDuration - 0.001),
    );
    setPlayhead(time);

    const sourcePosition = findSegmentAtTime(sourceSegments, time);
    const movement = sourcePosition?.segment;
    const safeMovementIndex = sourcePosition?.index ?? 0;

    const rig = audioRef.current;
    if (rig && movement) {
      if (rig.context.state !== "running") {
        void resumeFlightAudioRig(rig);
      } else {
        updateFlightAmbient(rig, movement);
        const settings = getFlightSoundSettings(
          movement,
          safeMovementIndex,
          rig.noteStep,
        );
        if (time + 0.1 < lastSoundTimeRef.current) {
          lastSoundTimeRef.current = Number.NEGATIVE_INFINITY;
        }
        if (
          time - lastSoundTimeRef.current >= settings.intervalSeconds
        ) {
          playFlightNote(rig, movement, safeMovementIndex);
          lastSoundTimeRef.current = time;
        }
      }
    }

    if (followPlayback && movement && movement.id !== selectedBandId) {
      setSelectedBandId(movement.id);
    }
  };

  const handleSeeked = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const time = Math.min(
      event.currentTarget.currentTime,
      Math.max(0, totalDuration - 0.001),
    );
    const sourcePosition = findSegmentAtTime(sourceSegments, time);
    if (!sourcePosition) return;

    setPlayhead(time);
    if (followPlayback) {
      setSelectedBandId(sourcePosition.segment.id);
    } else {
      setMessage(
        `Source preview: "${sourcePosition.segment.label}". Editing remains on "${selectedSegment?.label ?? "the selected band"}".`,
      );
    }
  };

  return (
    <main className="flight-loom">
      <header className="loom-header">
        <a className="brand-lockup" href="#top" aria-label="Flight Loom home">
          <span className="brand-mark" aria-hidden="true">
            FL
          </span>
          <span>
            <strong>Flight Loom</strong>
            <small>Drone video to digital textile</small>
          </span>
        </a>
        <div className="header-actions">
          <span className="privacy-note">Private local analysis</span>
          <button
            className="text-button"
            type="button"
            onClick={enableSound}
            aria-pressed={soundOn}
          >
            Soundscape {soundOn ? "on" : "off"}
          </button>
          <button className="text-button" type="button" onClick={resetFlight}>
            Reset
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Interactive generative art</p>
          <h1>Every flight leaves a hidden textile.</h1>
          <p className="hero-summary">
            Flight Loom samples visible motion and color from a drone video,
            then turns those values into moving digital threads you can remix.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              type="button"
              onClick={playSampleFlight}
            >
              Try the demo flight
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload your video
            </button>
          </div>
          <p className="hero-note">
            Your video stays on this device. No account, server upload, or
            telemetry required.
          </p>
        </div>

        <div className="process-strip" aria-label="How Flight Loom works">
          <div className="process-step">
            <span>01</span>
            <strong>Source video</strong>
            <small>Play a recorded drone flight</small>
          </div>
          <span className="process-arrow" aria-hidden="true">
            →
          </span>
          <div className="process-step">
            <span>02</span>
            <strong>Motion sample</strong>
            <small>Read frame change, drift, and color</small>
          </div>
          <span className="process-arrow" aria-hidden="true">
            →
          </span>
          <div className="process-step">
            <span>03</span>
            <strong>Digital textile</strong>
            <small>Map those values into live threads</small>
          </div>
        </div>
      </section>

      <section className="experience" id="experience">
        <div className="experience-heading">
          <div>
            <p className="eyebrow">The live translation</p>
            <h2>See one moment become one woven band.</h2>
          </div>
          <p className="status-message" aria-live="polite">
            {analysisProgress === null
              ? message
              : `Analyzing local frames: ${Math.round(analysisProgress * 100)}%`}
          </p>
        </div>

        <div className="flow-grid">
          <article className="flow-panel source-panel">
            <div className="panel-heading">
              <span className="step-number">01</span>
              <div>
                <p>SOURCE VIDEO</p>
                <strong>{sourceLabel}</strong>
              </div>
            </div>
            <div className="video-shell">
              <video
                key={usingSample ? "sample-flight" : customVideoUrl}
                ref={demoVideoRef}
                className="source-video"
                src={!usingSample ? customVideoUrl ?? undefined : undefined}
                poster={
                  usingSample ? sampleFlightSource.posterSrc : undefined
                }
                muted
                playsInline
                controls
                preload="metadata"
                aria-label="Source drone video"
                onPlay={() => {
                  setStarted(true);
                  if (audioRef.current) {
                    void resumeFlightAudioRig(audioRef.current);
                  }
                  setMessage(
                    "The highlighted motion sample is shaping the active band.",
                  );
                }}
                onPause={() => {
                  hushFlightAmbient(audioRef.current);
                  stopFlightNotes(audioRef.current);
                }}
                onTimeUpdate={handleTimeUpdate}
                onSeeked={handleSeeked}
                onEnded={() => {
                  hushFlightAmbient(audioRef.current);
                  stopFlightNotes(audioRef.current);
                  lastSoundTimeRef.current = Number.NEGATIVE_INFINITY;
                  setMessage(
                    "The source flight is complete. Remix any band below.",
                  );
                }}
              >
                {usingSample && (
                  <>
                    <source
                      src={sampleFlightSource.webmSrc}
                      type="video/webm"
                    />
                    <source
                      src={sampleFlightSource.videoSrc}
                      type="video/mp4"
                    />
                  </>
                )}
              </video>
              {analysisProgress !== null && (
                <div className="analysis-overlay" aria-hidden="true">
                  <span
                    style={
                      {
                        "--analysis-progress": `${analysisProgress * 100}%`,
                      } as CSSProperties
                    }
                  />
                  <strong>
                    Sampling frames {Math.round(analysisProgress * 100)}%
                  </strong>
                </div>
              )}
            </div>
            <div className="source-meta">
              <span>
                {formatTime(playhead)} / {formatTime(totalDuration)}
              </span>
              <span>{usingSample ? sampleFlightSource.credit : "Local file"}</span>
            </div>
          </article>

          <article className="flow-panel signature-panel">
            <div className="panel-heading">
              <span className="step-number">02</span>
              <div>
                <p>MOTION SAMPLE</p>
                <strong>
                  {sourceActiveSegment?.label ?? "Waiting for video"}
                </strong>
              </div>
            </div>

            {sourceActiveSegment && (
              <>
                <div className="drift-field">
                  <span>Screen drift</span>
                  <div className="drift-crosshair" aria-hidden="true">
                    <span
                      className="drift-arrow"
                      style={
                        {
                          "--drift-angle": `${driftAngle}deg`,
                        } as CSSProperties
                      }
                    />
                  </div>
                  <strong>
                    {horizontalDriftLabel(sourceActiveSegment.turn)},{" "}
                    {verticalDriftLabel(sourceActiveSegment.lift)}
                  </strong>
                </div>

                <div className="metrics">
                  <MetricRow
                    label="Motion energy"
                    value={`${Math.round(sourceActiveSegment.energy * 100)}%`}
                    amount={sourceActiveSegment.energy}
                    result={`becomes ${threadCount} moving threads`}
                  />
                  <MetricRow
                    label="Frame change"
                    value={`${Math.round(sourceActiveSegment.sceneShift * 100)}%`}
                    amount={sourceActiveSegment.sceneShift}
                    result="adds warp variation"
                  />
                  <MetricRow
                    label="Horizontal drift"
                    value={signedPercent(sourceActiveSegment.turn)}
                    amount={sourceActiveSegment.turn}
                    result={horizontalDriftLabel(sourceActiveSegment.turn)}
                    signed
                  />
                  <MetricRow
                    label="Vertical drift"
                    value={signedPercent(sourceActiveSegment.lift)}
                    amount={sourceActiveSegment.lift}
                    result={verticalDriftLabel(sourceActiveSegment.lift)}
                    signed
                  />
                </div>

                <div className="palette-readout">
                  <span>Sampled colors become thread</span>
                  <div>
                    {sourceActiveSegment.palette.map((color) => (
                      <i
                        key={color}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </article>

          <article className="flow-panel output-panel">
            <div className="panel-heading">
              <span className="step-number">03</span>
              <div>
                <p>DIGITAL TEXTILE</p>
                <strong>
                  {followPlayback ? "Following source" : "Viewer remix"}
                </strong>
              </div>
              <span className="live-state">
                <i aria-hidden="true" />
                {started ? "Live" : "Ready"}
              </span>
            </div>
            <div className="canvas-shell">
              <FlightCanvas
                segments={segments}
                activeId={canvasActiveId}
                started={started}
                revealProgress={revealProgress}
              />
              {!started && (
                <button
                  type="button"
                  className="canvas-start"
                  onClick={playSampleFlight}
                >
                  Play flight and start weaving
                </button>
              )}
            </div>
            <div className="output-caption">
              <span>{mood}</span>
              <span>
                {followPlayback && !hasViewerEdits
                  ? "Gold shuttle = current source position"
                  : "Bright band = current source preview"}
              </span>
            </div>
          </article>
        </div>
      </section>

      <section className="remix-section" aria-label="Flight timeline and remix">
        <div className="remix-heading">
          <div>
            <p className="eyebrow">
              {hasViewerEdits ? "Remixed band order" : "Source timeline"}
            </p>
            <h2>Select a moment, then change its band.</h2>
          </div>
          {!followPlayback && (
            <button
              type="button"
              className="follow-button"
              onClick={resumeSource}
            >
              Follow source again
            </button>
          )}
        </div>

        <div className="timeline">
          {!hasViewerEdits ? (
            <div className="timeline-rail" aria-hidden="true">
              <span style={{ width: `${playheadPercent}%` }} />
              <i style={{ left: `${playheadPercent}%` }} />
            </div>
          ) : (
            <p className="remix-order-note">
              Cards show your artwork order. Gold dot = source preview;
              outlined card = band being edited.
            </p>
          )}
          <div className="segment-row">
            {segments.map((segment, index) => (
              <button
                className={`segment-card${
                  segment.id === selectedBandId ? " is-active" : ""
                }${
                  segment.id === sourceActiveId
                    ? " is-source-current"
                    : ""
                }`}
                key={segment.id}
                type="button"
                onClick={() => focusSegment(segment)}
                style={
                  {
                    "--swatch-a": segment.palette[0],
                    "--swatch-b": segment.palette[1],
                    "--swatch-c": segment.palette[2],
                  } as CSSProperties
                }
                aria-current={
                  segment.id === sourceActiveId ? "true" : undefined
                }
                aria-pressed={segment.id === selectedBandId}
              >
                <span className="source-now-dot" aria-hidden="true" />
                <span className="segment-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="segment-weave" aria-hidden="true" />
                <span className="segment-copy">
                  <strong>{segment.label}</strong>
                  <small>
                    {segment.reversed ? "Reversed" : "Forward"} · repeat ×
                    {segment.repeats}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="edit-bar">
          <div className="edit-label">
            <span>Viewer edits</span>
            <strong>{selectedSegment?.label}</strong>
            <small>These controls change the artwork, not the source video.</small>
          </div>
          <div className="control-group">
            <button
              type="button"
              onClick={() => moveActive(-1)}
              disabled={selectedIndex === 0}
            >
              Move earlier
            </button>
            <button
              type="button"
              onClick={() => moveActive(1)}
              disabled={selectedIndex === segments.length - 1}
            >
              Move later
            </button>
            <button
              type="button"
              onClick={reverseActive}
              aria-pressed={selectedSegment?.reversed}
            >
              {selectedSegment?.reversed
                ? "Restore direction"
                : "Reverse band"}
            </button>
            <button type="button" onClick={loopActive}>
              Repeat ×{selectedSegment?.repeats ?? 1}
            </button>
          </div>
          <button
            className="load-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={analysisProgress !== null}
          >
            {analysisProgress === null ? "Analyze another video" : "Analyzing"}
          </button>
        </div>
      </section>

      <section className="method-note">
        <p className="eyebrow">How the mapping works</p>
        <h2>Artistic visual analysis, not flight telemetry.</h2>
        <p>
          Flight Loom samples 24–32 frames in your browser. Changes between
          frames shape thread density; brightness-center drift bends the weave;
          sampled colors dye the threads. These are expressive visual
          approximations—not precise optical flow, GPS, or aircraft telemetry.
        </p>
      </section>

      <footer className="loom-footer">
        <p>Flight Loom · One flight, infinite weaves.</p>
        <p>Built for Hack the Arts 2026</p>
      </footer>

      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        tabIndex={-1}
        aria-hidden="true"
        onChange={analyzeFile}
      />
    </main>
  );
}
