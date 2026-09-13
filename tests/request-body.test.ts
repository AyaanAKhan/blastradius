import assert from "node:assert/strict";
import test from "node:test";

import { BodyTooLargeError, readBoundedJson } from "../lib/request-body.ts";

test("readBoundedJson rejects a declared oversized body before reading it", async () => {
  const request = new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-length": "101" },
    body: "{}",
  });
  await assert.rejects(() => readBoundedJson(request, 100), BodyTooLargeError);
});

test("readBoundedJson enforces the limit while streaming", async () => {
  const request = new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify({ value: "x".repeat(120) }),
  });
  await assert.rejects(() => readBoundedJson(request, 100), BodyTooLargeError);
});

test("readBoundedJson parses a body within the limit", async () => {
  const request = new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify({ value: 42 }),
  });
  assert.deepEqual(await readBoundedJson(request, 100), { value: 42 });
});
