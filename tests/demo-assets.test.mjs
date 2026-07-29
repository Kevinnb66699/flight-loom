import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const demoVideo = new URL(
  "../public/demo/flight-loom-source.mp4",
  import.meta.url,
);
const demoWebm = new URL(
  "../public/demo/flight-loom-source.webm",
  import.meta.url,
);
const demoPoster = new URL(
  "../public/demo/flight-loom-source-poster.webp",
  import.meta.url,
);

test("bundled source flight is a compact browser-ready MP4", async () => {
  const [{ size }, header] = await Promise.all([
    stat(demoVideo),
    readFile(demoVideo),
  ]);

  assert.ok(size > 1_000_000);
  assert.ok(size < 15 * 1024 * 1024);
  assert.equal(header.subarray(4, 8).toString("ascii"), "ftyp");
});

test("bundled source flight includes a compact VP9 fallback", async () => {
  const [{ size }, header] = await Promise.all([
    stat(demoWebm),
    readFile(demoWebm),
  ]);

  assert.ok(size > 1_000_000);
  assert.ok(size < 15 * 1024 * 1024);
  assert.equal(header.subarray(0, 4).toString("hex"), "1a45dfa3");
});

test("bundled source poster is a valid compact WebP", async () => {
  const [{ size }, header] = await Promise.all([
    stat(demoPoster),
    readFile(demoPoster),
  ]);

  assert.ok(size > 10_000);
  assert.ok(size < 1024 * 1024);
  assert.equal(header.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(header.subarray(8, 12).toString("ascii"), "WEBP");
});
