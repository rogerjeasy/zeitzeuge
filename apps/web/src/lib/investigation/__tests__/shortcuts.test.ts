import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTypingTarget, shortcutFor } from "../shortcuts";

const body = { tagName: "BODY" };

describe("shortcutFor", () => {
  it("maps the review keys", () => {
    const cases: [string, string][] = [
      ["j", "next"],
      ["J", "next"],
      ["ArrowRight", "next"],
      ["k", "prev"],
      ["ArrowLeft", "prev"],
      ["a", "accept"],
      ["c", "correct"],
      ["r", "reject"],
      ["ArrowUp", "fieldUp"],
      ["ArrowDown", "fieldDown"],
      ["?", "help"],
      ["Escape", "close"],
    ];
    for (const [key, action] of cases) assert.equal(shortcutFor({ key }, body), action, key);
    assert.equal(shortcutFor({ key: "?", shiftKey: true }, body), "help");
    assert.equal(shortcutFor({ key: "x" }, body), null);
  });

  it("leaves the browser's own shortcuts alone", () => {
    assert.equal(shortcutFor({ key: "r", metaKey: true }, body), null);
    assert.equal(shortcutFor({ key: "ArrowRight", ctrlKey: true }, body), null);
    assert.equal(shortcutFor({ key: "a", altKey: true }, body), null);
  });

  it("is inactive while typing", () => {
    assert.equal(shortcutFor({ key: "a" }, { tagName: "INPUT", type: "text" }), null);
    assert.equal(shortcutFor({ key: "j" }, { tagName: "TEXTAREA" }), null);
    assert.equal(shortcutFor({ key: "k" }, { tagName: "DIV", isContentEditable: true }), null);
    assert.equal(shortcutFor({ key: "j" }, { tagName: "BUTTON" }), "next");
    assert.equal(shortcutFor({ key: "j" }, { tagName: "INPUT", type: "checkbox" }), "next");
  });

  it("does not repeat a decision while a key is held", () => {
    assert.equal(shortcutFor({ key: "a", repeat: true }, body), null);
    assert.equal(shortcutFor({ key: "j", repeat: true }, body), "next");
  });
});

describe("isTypingTarget", () => {
  it("treats text-like inputs, selects and textboxes as typing", () => {
    assert.equal(isTypingTarget({ tagName: "input" }), true);
    assert.equal(isTypingTarget({ tagName: "INPUT", type: "search" }), true);
    assert.equal(isTypingTarget({ tagName: "INPUT", type: "range" }), true);
    assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
    assert.equal(isTypingTarget({ tagName: "DIV", role: "textbox" }), true);
    assert.equal(isTypingTarget({ tagName: "A" }), false);
    assert.equal(isTypingTarget(null), false);
  });
});
