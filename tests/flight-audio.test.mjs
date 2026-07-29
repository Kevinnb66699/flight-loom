import assert from "node:assert/strict";
import test from "node:test";

import {
  getFlightSoundSettings,
  midiToFrequency,
} from "../app/lib/flight-audio.ts";
import { sampleFlight } from "../app/lib/flight-data.ts";

test("flight notes stay on a C pentatonic scale", () => {
  const allowed = [48, 50, 52, 55, 57, 60, 62, 64, 67].map(
    midiToFrequency,
  );

  for (let step = 0; step < 8; step += 1) {
    const settings = getFlightSoundSettings(sampleFlight[0], 0, step);
    assert.ok(
      allowed.some(
        (frequency) => Math.abs(frequency - settings.frequency) < 0.001,
      ),
    );
  }
});

test("lift raises pitch while energy increases note density gently", () => {
  const low = getFlightSoundSettings(
    { ...sampleFlight[0], lift: -1, energy: 0.1 },
    0,
    0,
  );
  const high = getFlightSoundSettings(
    { ...sampleFlight[0], lift: 1, energy: 0.9 },
    0,
    0,
  );

  assert.ok(high.frequency > low.frequency);
  assert.ok(high.intervalSeconds < low.intervalSeconds);
  assert.ok(high.peakGain > low.peakGain);
});

test("turn, repeats, and output levels remain bounded", () => {
  const settings = getFlightSoundSettings(
    {
      ...sampleFlight[0],
      turn: 1,
      repeats: 9,
      sceneShift: 2,
    },
    0,
    0,
  );

  assert.equal(settings.pan, 0.45);
  assert.equal(settings.repeats, 3);
  assert.ok(settings.peakGain <= 0.05);
  assert.ok(settings.windGain < 0.01);
  assert.ok(settings.wetGain <= 0.14);
});
