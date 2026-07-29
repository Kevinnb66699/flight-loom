import assert from "node:assert/strict";
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
  assert.match(html, /Weave the motion of flight/);
  assert.match(html, /Weave the sample flight/);
  assert.match(html, /Recorded source drone flight/);
  assert.match(html, /\/demo\/flight-loom-source\.mp4/);
  assert.match(html, /\/demo\/flight-loom-source\.webm/);
  assert.match(html, /Project-provided drone footage/);
  assert.match(html, /Local analysis/);
  assert.match(html, /The loom tray/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Your site is taking shape/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});
