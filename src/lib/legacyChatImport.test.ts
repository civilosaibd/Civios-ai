import { describe, expect, it } from "vitest";
import {
  LEGACY_IMPORT_TITLE,
  importLegacyChatHistory,
  parseLegacyChatHistory,
  type ImportableConversation,
} from "./legacyChatImport";

const legacy = JSON.stringify([
  { role: "user", content: "Slab thickness koto?" },
  { role: "assistant", content: "BNBC onujayi ..." },
]);

const existing: ImportableConversation[] = [
  { id: "c_1", title: "New chat", messages: [], updatedAt: 1 },
];

describe("parseLegacyChatHistory", () => {
  it("parses a well-formed legacy thread", () => {
    expect(parseLegacyChatHistory(legacy)).toEqual([
      { role: "user", content: "Slab thickness koto?" },
      { role: "assistant", content: "BNBC onujayi ..." },
    ]);
  });

  it("returns [] for missing, corrupt, or non-array values", () => {
    expect(parseLegacyChatHistory(null)).toEqual([]);
    expect(parseLegacyChatHistory("not json")).toEqual([]);
    expect(parseLegacyChatHistory("{}")).toEqual([]);
    expect(parseLegacyChatHistory("[]")).toEqual([]);
  });

  it("drops malformed entries but keeps valid ones", () => {
    const raw = JSON.stringify([
      { role: "user", content: "ok" },
      { role: "system", content: "bad role" },
      { content: "no role" },
      { role: "assistant" },
      null,
      { role: "assistant", content: "kept" },
    ]);
    expect(parseLegacyChatHistory(raw)).toEqual([
      { role: "user", content: "ok" },
      { role: "assistant", content: "kept" },
    ]);
  });
});

describe("importLegacyChatHistory", () => {
  it("appends the legacy thread as its own titled conversation", () => {
    const result = importLegacyChatHistory(existing, legacy, { id: "c_new", now: 42 });
    expect(result.imported).toBe(true);
    expect(result.conversations).toHaveLength(2);
    const imported = result.conversations[1];
    expect(imported.id).toBe("c_new");
    expect(imported.title).toBe(LEGACY_IMPORT_TITLE);
    expect(imported.updatedAt).toBe(42);
    expect(imported.messages).toHaveLength(2);
    // Existing conversations are untouched.
    expect(result.conversations[0]).toBe(existing[0]);
  });

  it("is a no-op when there is no legacy history", () => {
    const result = importLegacyChatHistory(existing, null, { id: "c_x", now: 1 });
    expect(result.imported).toBe(false);
    expect(result.conversations).toBe(existing);
  });

  it("does not import the same thread twice", () => {
    const first = importLegacyChatHistory(existing, legacy, { id: "c_new", now: 42 });
    const second = importLegacyChatHistory(first.conversations, legacy, { id: "c_other", now: 43 });
    expect(second.imported).toBe(false);
    expect(second.conversations).toBe(first.conversations);
  });
});
