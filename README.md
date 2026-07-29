# Flight Loom

Flight Loom turns the motion and color of a drone flight into a living
audiovisual tapestry. A flight is split into movements, and each movement
becomes a woven band with its own density, curvature, palette, and voice.

The audience can:

- **Unravel** a movement so its threads recede.
- **Loop** a movement to thicken its weave and harmony.
- **Reweave** the flight by changing the order of its movements.

## Current MVP

- A 32.5-second recorded source flight with five precomputed movements.
- A Canvas 2D generative textile renderer.
- A lightweight Web Audio soundscape, enabled by the viewer.
- Local browser analysis for MP4, MOV, or WebM files.
- No upload: selected footage remains on the viewer's device.

The bundled demo uses 27 low-resolution frame samples. User-selected clips use
24–32 samples in the browser. Both paths derive color, frame difference, and
luminance-centroid drift. The drift is an expressive motion approximation for
the artwork, not precise optical flow, flight telemetry, or a scientific
measurement.

## Architecture

```text
Local drone clip
      ↓
Browser frame sampler
      ↓
FlightSegment[] (color, energy, turn, lift, scene shift)
      ↓
Deterministic Canvas weave + Web Audio voices
      ↓
Unravel / Loop / Reweave
```

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Validate the production build:

```bash
npm test
npm run lint
```

## Source and media

The bundled demo is a derived excerpt from project-provided drone footage,
included with the creator's authorization. The kept source range is 17.5–50.0
seconds from the selected flight. It passed the project's severe-shake scan
with no excluded intervals.

For browser delivery, the excerpt was converted from 4K/59.94 fps HEVC to
720p/30 fps H.264, with a VP9/WebM fallback and no audio. Source metadata,
chapters, DJI data streams, and telemetry are not present in either derived
video. The original footage remains outside this repository and was not
modified.

This project was started for Hack the Arts 2026. The footage predates this
repository; the Flight Loom analysis, interaction, artwork, and web experience
were created for the project.
