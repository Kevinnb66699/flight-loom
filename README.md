# Flight Loom

Flight Loom turns the motion and color of a drone flight into a living
audiovisual tapestry. A flight is split into movements, and each movement
becomes a woven band with its own density, curvature, palette, and voice.

The audience can:

- **Unravel** a movement so its threads recede.
- **Loop** a movement to thicken its weave and harmony.
- **Reweave** the flight by changing the order of its movements.

## Current MVP

- A deterministic five-movement sample flight that works without a network.
- A Canvas 2D generative textile renderer.
- A lightweight Web Audio soundscape, enabled by the viewer.
- Local browser analysis for MP4, MOV, or WebM files.
- No upload: selected footage remains on the viewer's device.

The local analyzer samples 24–32 frames and derives average color, frame
difference, and luminance-centroid drift. The drift is an expressive motion
approximation for the artwork, not precise optical flow, flight telemetry, or a
scientific measurement.

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

The repository contains no private or third-party drone footage. Demo footage
must be self-recorded or accompanied by clear permission and attribution.

This project was started for Hack the Arts 2026. Any pre-existing tools or
media reused in the final submission will be listed here before submission.
