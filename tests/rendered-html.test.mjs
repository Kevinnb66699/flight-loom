import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Flight Loom experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Flight Loom/);
  assert.match(html, /Every flight leaves a hidden textile/);
  assert.match(html, /How Flight Loom works/);
  assert.match(html, /Source video/);
  assert.match(html, /Motion sample/);
  assert.match(html, /Digital textile/);
  assert.match(html, /See one moment become one woven band/);
  assert.match(html, /SOURCE VIDEO/);
  assert.match(html, /MOTION SAMPLE/);
  assert.match(html, /DIGITAL TEXTILE/);
  assert.match(html, /Motion energy/);
  assert.match(html, /becomes 26 moving threads/);
  assert.match(html, /Sampled colors become thread/);
  assert.match(html, /Try the demo flight/);
  assert.match(html, /Upload your video/);
  assert.match(html, /Your video stays on this device/);
  assert.match(html, /\/demo\/flight-loom-source\.mp4/);
  assert.match(html, /\/demo\/flight-loom-source\.webm/);
  assert.match(html, /Project-provided drone footage/);
  assert.match(html, /Private local analysis/);
  assert.match(
    html,
    /aria-pressed="true"[^>]*>Soundscape\s*(?:<!-- -->)?on<\/button>/,
  );
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Your site is taking shape/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("native video controls prime Web Audio during event capture", async () => {
  const source = await readFile(
    new URL("../app/components/FlightLoom.tsx", import.meta.url),
    "utf8",
  );
  const shellStart = source.indexOf('className="video-shell"');
  const videoStart = source.indexOf("<video", shellStart);
  const shellOpening = source.slice(shellStart, videoStart);

  assert.ok(shellStart >= 0 && videoStart > shellStart);
  assert.match(shellOpening, /onPointerDownCapture={unlockSoundscape}/);
  assert.match(shellOpening, /onPointerUpCapture={unlockSoundscape}/);
});
