/** Run: node bot/worker.test.mjs */
import assert from "node:assert/strict";
import { parseOptions, extractUrl } from "./worker.js";

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
};

check("defaults when the message is only a link", () => {
  const o = parseOptions("https://youtu.be/abc123");
  assert.deepEqual(o, { count: "6", language: "", model: "small", reframe: "smart" });
});

check("reads count, language, model and framing", () => {
  const o = parseOptions("https://youtu.be/abc 8 ru medium blur");
  assert.equal(o.count, "8");
  assert.equal(o.language, "ru");
  assert.equal(o.model, "medium");
  assert.equal(o.reframe, "blur");
});

check("clamps an absurd clip count", () => {
  assert.equal(parseOptions("link 99").count, "20");
  assert.equal(parseOptions("link 0").count, "1");
});

check("settings inside a URL are ignored", () => {
  // The id contains "ru" and digits; neither may leak into the options.
  const o = parseOptions("https://youtu.be/ru?t=12&x=blur");
  assert.equal(o.language, "");
  assert.equal(o.reframe, "smart");
  assert.equal(o.count, "6");
});

check("extracts the first url", () => {
  assert.equal(extractUrl("смотри https://a.example/x потом"), "https://a.example/x");
  assert.equal(extractUrl("без ссылки"), null);
});

check("order does not matter", () => {
  const o = parseOptions("ru 4 https://x.example/v");
  assert.equal(o.language, "ru");
  assert.equal(o.count, "4");
});

console.log(`${passed} worker tests passed`);
