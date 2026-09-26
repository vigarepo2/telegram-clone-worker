import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const compiled = await build({
  entryPoints: ["src/shared/chatInput.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { normalizeChatInput } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);

test("chat input accepts existing usernames and numeric IDs without changing identity", () => {
  for (const value of [
    "@example_channel",
    "-1001234567890",
    "-456789",
    "123456",
  ]) {
    assert.deepEqual(normalizeChatInput(` ${value} `), { ok: true, value });
  }
});

test("public Telegram chat and message links resolve to the username", () => {
  for (const value of [
    "https://t.me/example_channel",
    "https://t.me/example_channel/",
    "https://t.me/example_channel/123",
    "https://t.me/example_channel/123?single",
  ]) {
    assert.deepEqual(normalizeChatInput(value), {
      ok: true,
      value: "@example_channel",
    });
  }
});

test("private Telegram message links produce the full channel ID", () => {
  assert.deepEqual(normalizeChatInput("https://t.me/c/1234567890/123"), {
    ok: true,
    value: "-1001234567890",
  });
  assert.equal(normalizeChatInput("https://t.me/c/1234567890").ok, false);
  assert.equal(normalizeChatInput("https://t.me/c/012345/123").ok, false);
});

test("invite links explain how to provide a supported chat identifier", () => {
  for (const value of [
    "https://t.me/+ABC123",
    "https://t.me/joinchat/ABC123",
  ]) {
    const result = normalizeChatInput(value);
    assert.equal(result.ok, false);
    assert.match(result.error, /Invite links/);
  }
});

test("unrelated URLs, deceptive hosts, credentials, and malformed paths are rejected", () => {
  for (const value of [
    "https://example.com/example_channel",
    "https://t.me.evil.test/example_channel",
    "https://t.me@evil.test/example_channel",
    "https://user:pass@t.me/example_channel",
    "http://t.me/example_channel",
    "javascript:alert(1)",
    "https://t.me/c/1/2/3",
    "https://t.me/example_channel/not-an-id",
    "https://t.me/example_channel//123",
    "",
    "@",
    "-0",
  ]) {
    assert.equal(normalizeChatInput(value).ok, false, value);
  }
});
