import assert from "node:assert/strict";
import test from "node:test";

import {
  cycleRepeats,
  deriveOverallMood,
  moveSegment,
  normalize,
  reorderSegments,
  sampleFlight,
  sampleFlightSource,
  toggleReverse,
} from "../app/lib/flight-data.ts";

test("sampleFlight exposes five valid, deterministic segments", () => {
  assert.equal(sampleFlight.length, 5);
  assert.equal(new Set(sampleFlight.map(({ id }) => id)).size, 5);

  for (const segment of sampleFlight) {
    assert.equal(segment.palette.length, 3);
    assert.ok(segment.duration > 0);
    assert.ok(segment.energy >= 0 && segment.energy <= 1);
    assert.ok(segment.turn >= -1 && segment.turn <= 1);
    assert.ok(segment.lift >= -1 && segment.lift <= 1);
    assert.ok(segment.sceneShift >= 0 && segment.sceneShift <= 1);
  }

  const duration = sampleFlight.reduce(
    (total, segment) => total + segment.duration,
    0,
  );
  assert.ok(Math.abs(duration - sampleFlightSource.duration) < 0.01);
  assert.match(sampleFlightSource.videoSrc, /^\/demo\/.+\.mp4$/);
  assert.match(sampleFlightSource.webmSrc, /^\/demo\/.+\.webm$/);
  assert.match(sampleFlightSource.posterSrc, /^\/demo\/.+\.webp$/);
});

test("moveSegment reorders without mutating its input", () => {
  const original = [...sampleFlight];
  const moved = moveSegment(original, 0, 3);
  const ids = sampleFlight.map(({ id }) => id);

  assert.deepEqual(
    moved.map(({ id }) => id),
    [ids[1], ids[2], ids[3], ids[0], ids[4]],
  );
  assert.deepEqual(original, sampleFlight);
});

test("reorderSegments moves by stable segment ids", () => {
  const ids = sampleFlight.map(({ id }) => id);
  const reordered = reorderSegments(
    sampleFlight,
    ids[4],
    ids[1],
  );

  assert.deepEqual(
    reordered.map(({ id }) => id),
    [ids[0], ids[4], ids[1], ids[2], ids[3]],
  );
});

test("toggleReverse and cycleRepeats only update the requested segment", () => {
  const targetId = sampleFlight[2].id;
  const reversed = toggleReverse(sampleFlight, targetId);
  assert.equal(reversed[2].reversed, true);
  assert.strictEqual(reversed[0], sampleFlight[0]);

  const twice = cycleRepeats(reversed, targetId);
  const threeTimes = cycleRepeats(twice, targetId);
  const reset = cycleRepeats(threeTimes, targetId);

  assert.equal(twice[2].repeats, 2);
  assert.equal(threeTimes[2].repeats, 3);
  assert.equal(reset[2].repeats, 1);
});

test("normalize clamps values to a zero-to-one range", () => {
  assert.equal(normalize(15, 10, 20), 0.5);
  assert.equal(normalize(5, 10, 20), 0);
  assert.equal(normalize(25, 10, 20), 1);
  assert.equal(normalize(10, 10, 10), 0);
});

test("deriveOverallMood accounts for lift and reversed playback", () => {
  const rising = [
    {
      ...sampleFlight[2],
      energy: 0.5,
      sceneShift: 0.5,
      lift: 0.9,
    },
  ];

  assert.equal(deriveOverallMood(rising), "Rising Light");
  assert.equal(
    deriveOverallMood(toggleReverse(rising, rising[0].id)),
    "Descending Hush",
  );
  assert.equal(deriveOverallMood([]), "Quiet Drift");
});
