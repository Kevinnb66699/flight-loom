"use client";

import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  cycleRepeats,
  deriveOverallMood,
  FlightSegment,
  moveSegment,
  sampleFlight,
  toggleReverse,
} from "../lib/flight-data";

type AudioRig = {
  context: AudioContext;
  master: GainNode;
  oscillators: OscillatorNode[];
};

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

function FlightCanvas({
  segments,
  activeId,
  started,
}: {
  segments: readonly FlightSegment[];
  activeId: string;
  started: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let animationFrame = 0;
    let width = 0;
    let height = 0;
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
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = () => {
      frame += reduceMotion ? 0.08 : 1;
      context.clearRect(0, 0, width, height);

      const background = context.createRadialGradient(
        width * 0.48,
        height * 0.45,
        10,
        width * 0.48,
        height * 0.45,
        Math.max(width, height) * 0.72,
      );
      background.addColorStop(0, "#18211e");
      background.addColorStop(0.42, "#0e1514");
      background.addColorStop(1, "#070b0a");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = "rgba(239, 226, 199, 0.045)";
      context.lineWidth = 1;
      for (let x = 18; x < width; x += 24) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      if (!started) {
        context.strokeStyle = "rgba(227, 180, 91, 0.22)";
        for (let row = 0; row < 18; row += 1) {
          const y = height * 0.2 + row * (height * 0.032);
          context.beginPath();
          context.moveTo(width * 0.12, y);
          context.bezierCurveTo(
            width * 0.36,
            y - 8,
            width * 0.63,
            y + 8,
            width * 0.88,
            y,
          );
          context.stroke();
        }
        animationFrame = requestAnimationFrame(draw);
        return;
      }

      const sidePadding = Math.max(18, width * 0.035);
      const topPadding = Math.max(34, height * 0.12);
      const usableWidth = width - sidePadding * 2;
      const usableHeight = height - topPadding * 1.8;
      const gap = Math.max(6, usableWidth * 0.009);
      const segmentWidth =
        (usableWidth - gap * Math.max(0, segments.length - 1)) /
        Math.max(1, segments.length);

      segments.forEach((segment, segmentIndex) => {
        const xStart = sidePadding + segmentIndex * (segmentWidth + gap);
        const xEnd = xStart + segmentWidth;
        const active = segment.id === activeId;
        const direction = segment.reversed ? -1 : 1;
        const density = Math.round(10 + segment.energy * 20);
        const bend = segment.turn * segmentWidth * 0.18;
        const lift = segment.lift * usableHeight * 0.11;
        const time = frame * 0.006 * direction;

        context.save();
        context.beginPath();
        context.rect(xStart, topPadding, segmentWidth, usableHeight);
        context.clip();
        context.globalCompositeOperation = "screen";

        for (let repeat = 0; repeat < segment.repeats; repeat += 1) {
          const repeatOffset = repeat * 3.2;

          for (let thread = 0; thread < density; thread += 1) {
            const ratio = thread / Math.max(1, density - 1);
            const y =
              topPadding +
              ratio * usableHeight +
              Math.sin(time * 2 + thread * 0.43 + segmentIndex) *
                (1.5 + segment.energy * 4) +
              repeatOffset;
            const color =
              segment.palette[(thread + repeat) % segment.palette.length];

            context.beginPath();
            context.moveTo(xStart - 4, y + lift * 0.2);
            context.bezierCurveTo(
              xStart + segmentWidth * 0.28,
              y - bend + lift,
              xStart + segmentWidth * 0.72,
              y + bend - lift,
              xEnd + 4,
              y - lift * 0.2,
            );
            context.strokeStyle = color;
            context.globalAlpha =
              0.2 + segment.energy * 0.28 + repeat * 0.055;
            context.lineWidth = active ? 1.35 : 0.9;
            context.stroke();
          }

          const warpCount = Math.max(6, Math.round(segmentWidth / 13));
          for (let warp = 0; warp < warpCount; warp += 1) {
            const ratio = warp / Math.max(1, warpCount - 1);
            const x =
              xStart +
              ratio * segmentWidth +
              Math.sin(time + warp * 0.62) * (1 + segment.sceneShift * 3);
            context.beginPath();
            context.moveTo(x, topPadding - 3);
            context.bezierCurveTo(
              x + bend * 0.12,
              topPadding + usableHeight * 0.35,
              x - bend * 0.12,
              topPadding + usableHeight * 0.7,
              x,
              topPadding + usableHeight + 3,
            );
            context.strokeStyle =
              segment.palette[(warp + 1) % segment.palette.length];
            context.globalAlpha = 0.12 + repeat * 0.045;
            context.lineWidth = 0.75;
            context.stroke();
          }
        }

        if (segment.reversed) {
          context.globalCompositeOperation = "source-over";
          const unravel = context.createLinearGradient(
            xStart,
            0,
            xEnd,
            0,
          );
          unravel.addColorStop(0, "rgba(7, 11, 10, 0.05)");
          unravel.addColorStop(0.72, "rgba(7, 11, 10, 0.42)");
          unravel.addColorStop(1, "rgba(7, 11, 10, 0.92)");
          context.fillStyle = unravel;
          context.globalAlpha = 1;
          context.fillRect(xStart, topPadding, segmentWidth, usableHeight);
        }

        context.restore();

        context.strokeStyle = active
          ? "rgba(227, 180, 91, 0.82)"
          : "rgba(239, 226, 199, 0.13)";
        context.lineWidth = active ? 1.4 : 1;
        context.strokeRect(xStart, topPadding, segmentWidth, usableHeight);

        context.fillStyle = active
          ? "rgba(239, 226, 199, 0.86)"
          : "rgba(239, 226, 199, 0.42)";
        context.font = "10px ui-monospace, SFMono-Regular, monospace";
        context.fillText(
          `${String(segmentIndex + 1).padStart(2, "0")} · ${segment.label.toUpperCase()}`,
          xStart,
          topPadding + usableHeight + 24,
          segmentWidth,
        );
      });

      const activeIndex = Math.max(
        0,
        segments.findIndex(({ id }) => id === activeId),
      );
      const shuttleRegion =
        sidePadding + activeIndex * (segmentWidth + gap) + segmentWidth / 2;
      const shuttleY =
        topPadding +
        usableHeight *
          (0.5 + Math.sin(frame * 0.018) * (reduceMotion ? 0.04 : 0.36));
      context.fillStyle = "#e3b45b";
      context.shadowColor = "rgba(227, 180, 91, 0.8)";
      context.shadowBlur = 14;
      context.beginPath();
      context.moveTo(shuttleRegion - 7, shuttleY);
      context.lineTo(shuttleRegion, shuttleY - 4);
      context.lineTo(shuttleRegion + 7, shuttleY);
      context.lineTo(shuttleRegion, shuttleY + 4);
      context.closePath();
      context.fill();
      context.shadowBlur = 0;

      animationFrame = requestAnimationFrame(draw);
    };

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
      aria-label="A generative tapestry woven from five drone-flight segments"
    />
  );
}

export function FlightLoom() {
  const [segments, setSegments] = useState<FlightSegment[]>([
    ...sampleFlight,
  ]);
  const [activeId, setActiveId] = useState(sampleFlight[0].id);
  const [started, setStarted] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<number | null>(null);
  const [sourceLabel, setSourceLabel] = useState("Curated sample flight");
  const [message, setMessage] = useState(
    "One flight. Five movements. Infinite weaves.",
  );
  const audioRef = useRef<AudioRig | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeIndex = Math.max(
    0,
    segments.findIndex(({ id }) => id === activeId),
  );
  const activeSegment = segments[activeIndex] ?? segments[0];
  const mood = useMemo(() => deriveOverallMood(segments), [segments]);

  useEffect(() => {
    const rig = audioRef.current;
    if (!rig || !activeSegment) return;

    const now = rig.context.currentTime;
    const base = 92 + activeSegment.energy * 54 + activeSegment.lift * 18;
    const ratios = [1, 1.5 + activeSegment.turn * 0.08, 2];
    rig.oscillators.forEach((oscillator, index) => {
      oscillator.frequency.setTargetAtTime(
        Math.max(48, base * ratios[index]),
        now,
        0.18,
      );
    });
    rig.master.gain.setTargetAtTime(
      0.025 + activeSegment.repeats * 0.012,
      now,
      0.2,
    );
  }, [activeSegment]);

  useEffect(
    () => () => {
      void audioRef.current?.context.close();
    },
    [],
  );

  const enableSound = async () => {
    if (audioRef.current) {
      await audioRef.current.context.close();
      audioRef.current = null;
      setSoundOn(false);
      return;
    }

    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = 0.035;
    master.connect(context.destination);
    const oscillators = [0, 1, 2].map((index) => {
      const oscillator = context.createOscillator();
      const voice = context.createGain();
      oscillator.type = index === 0 ? "sine" : "triangle";
      voice.gain.value = index === 0 ? 0.75 : 0.22;
      oscillator.connect(voice);
      voice.connect(master);
      oscillator.start();
      return oscillator;
    });
    audioRef.current = { context, master, oscillators };
    setSoundOn(true);
    setStarted(true);
  };

  const moveActive = (direction: -1 | 1) => {
    const destination = clamp(
      activeIndex + direction,
      0,
      segments.length - 1,
    );
    setSegments((current) =>
      moveSegment(current, activeIndex, destination),
    );
    setMessage("The seam moved. The flight now tells a different story.");
  };

  const reverseActive = () => {
    setSegments((current) => toggleReverse(current, activeId));
    setStarted(true);
    setMessage(
      activeSegment.reversed
        ? "The threads return to the weave."
        : "This movement is unraveling from its edge.",
    );
  };

  const loopActive = () => {
    setSegments((current) => cycleRepeats(current, activeId));
    setStarted(true);
    setMessage("Repetition thickens the cloth and deepens its voice.");
  };

  const resetFlight = () => {
    setSegments([...sampleFlight]);
    setActiveId(sampleFlight[0].id);
    setStarted(false);
    setSourceLabel("Curated sample flight");
    setMessage("One flight. Five movements. Infinite weaves.");
  };

  const analyzeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAnalysisProgress(0);
    setMessage("Reading motion and color locally in your browser…");
    try {
      const { analyzeVideoFile } = await import("../lib/analyze-video");
      const analyzed = await analyzeVideoFile(file, setAnalysisProgress);
      setSegments(analyzed);
      setActiveId(analyzed[0].id);
      setSourceLabel(file.name);
      setStarted(true);
      setMessage(
        "The clip is now cloth. Select a movement to reshape its future.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This clip could not be analyzed. The sample flight is still ready.",
      );
    } finally {
      setAnalysisProgress(null);
      event.target.value = "";
    }
  };

  return (
    <main className="flight-loom">
      <header className="loom-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            FL
          </span>
          <div>
            <p className="eyebrow">Flight Loom / Digital textile 001</p>
            <h1>Weave the motion of flight.</h1>
          </div>
        </div>
        <div className="header-actions">
          <span className="privacy-note">Local analysis · No upload</span>
          <button
            className="text-button"
            type="button"
            onClick={enableSound}
            aria-pressed={soundOn}
          >
            Sound {soundOn ? "on" : "off"}
          </button>
          <button className="text-button" type="button" onClick={resetFlight}>
            Reset
          </button>
        </div>
      </header>

      <section className="loom-stage" aria-label="Interactive flight tapestry">
        <FlightCanvas
          segments={segments}
          activeId={activeId}
          started={started}
        />
        {!started && (
          <div className="stage-intro">
            <p className="eyebrow">Motion becomes thread</p>
            <h2>A flight is more than a recording.</h2>
            <p>
              It is a sequence of pressure, direction, color, and return. Start
              the loom to make those movements tangible.
            </p>
            <div className="stage-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => setStarted(true)}
              >
                Weave the sample flight
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                Weave your own clip
              </button>
            </div>
          </div>
        )}

        <div className="stage-readout">
          <div>
            <span>Source</span>
            <strong>{sourceLabel}</strong>
          </div>
          <div>
            <span>Current state</span>
            <strong>{analysisProgress === null ? mood : "Analyzing"}</strong>
          </div>
          <div>
            <span>Movement</span>
            <strong>{activeSegment?.label ?? "Waiting"}</strong>
          </div>
        </div>
      </section>

      <section className="loom-tray" aria-label="Flight movements">
        <div className="tray-heading">
          <div>
            <p className="eyebrow">The loom tray</p>
            <p className="status-message" aria-live="polite">
              {analysisProgress === null
                ? message
                : `Analyzing frame ${Math.round(analysisProgress * 100)}%`}
            </p>
          </div>
          <div className="mapping-legend" aria-label="Artwork mapping">
            <span>Flow → angle</span>
            <span>Speed → density</span>
            <span>Color → thread</span>
            <span>Turn → curvature</span>
          </div>
        </div>

        <div className="segment-row">
          {segments.map((segment, index) => (
            <button
              className={`segment-swatch ${
                segment.id === activeId ? "is-active" : ""
              }`}
              key={segment.id}
              type="button"
              onClick={() => {
                setActiveId(segment.id);
                setStarted(true);
              }}
              style={
                {
                  "--swatch-a": segment.palette[0],
                  "--swatch-b": segment.palette[1],
                  "--swatch-c": segment.palette[2],
                } as React.CSSProperties
              }
              aria-pressed={segment.id === activeId}
            >
              <span className="swatch-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="swatch-weave" aria-hidden="true" />
              <span className="swatch-copy">
                <strong>{segment.label}</strong>
                <small>
                  {segment.reversed ? "Unraveling" : "Woven"} · ×
                  {segment.repeats}
                </small>
              </span>
            </button>
          ))}
        </div>

        <div className="loom-controls">
          <div className="movement-meta">
            <span>Selected movement</span>
            <strong>{activeSegment?.label}</strong>
          </div>
          <div className="control-group">
            <button
              type="button"
              onClick={() => moveActive(-1)}
              disabled={activeIndex === 0}
              aria-label="Move selected movement earlier"
            >
              ← Reweave
            </button>
            <button
              type="button"
              onClick={() => moveActive(1)}
              disabled={activeIndex === segments.length - 1}
              aria-label="Move selected movement later"
            >
              Reweave →
            </button>
            <button
              type="button"
              onClick={reverseActive}
              aria-pressed={activeSegment?.reversed}
            >
              {activeSegment?.reversed ? "Restore" : "Unravel"}
            </button>
            <button type="button" onClick={loopActive}>
              Loop ×{activeSegment?.repeats ?? 1}
            </button>
          </div>
          <button
            className="load-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={analysisProgress !== null}
          >
            {analysisProgress === null ? "Load a flight" : "Reading the clip…"}
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            onChange={analyzeFile}
          />
        </div>
      </section>

      <footer className="loom-footer">
        <p>One flight. Infinite weaves.</p>
        <p>Built for Hack the Arts · 2026</p>
      </footer>
    </main>
  );
}
