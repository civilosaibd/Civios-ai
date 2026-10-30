import { describe, expect, it } from "vitest";
import {
  isValidDrawingImageDataUrl,
  readJsonBodyLimited,
  validateDrawingImages,
} from "./validation";

const base64 = (value: string) => btoa(value);
const jpeg = `data:image/jpeg;base64,${base64(String.fromCharCode(0xff, 0xd8, 0xff, 0x00))}`;
const png = "data:image/png;base64,iVBORw0KGgo=";
const webp = `data:image/webp;base64,${base64("RIFF0000WEBP")}`;

describe("AI drawing request validation", () => {
  it("checks actual image signatures instead of trusting a data URL MIME label", () => {
    expect(isValidDrawingImageDataUrl(jpeg)).toBe(true);
    expect(isValidDrawingImageDataUrl(png)).toBe(true);
    expect(isValidDrawingImageDataUrl(webp)).toBe(true);
    expect(isValidDrawingImageDataUrl("data:image/png;base64,/9j/AA==")).toBe(false);
    expect(isValidDrawingImageDataUrl("data:image/jpeg;base64,not-base64!")).toBe(false);
  });

  it("requires one to five unique, numbered pages", () => {
    expect(validateDrawingImages([{ pageNumber: 1, dataUrl: jpeg }]).ok).toBe(true);
    expect(validateDrawingImages([{ pageNumber: 1, dataUrl: jpeg }, { pageNumber: 1, dataUrl: png }]).ok).toBe(false);
    expect(validateDrawingImages([{ pageNumber: 0, dataUrl: jpeg }]).ok).toBe(false);
    expect(validateDrawingImages([]).ok).toBe(false);
    expect(validateDrawingImages(Array.from({ length: 6 }, (_, i) => ({ pageNumber: i + 1, dataUrl: jpeg }))).ok).toBe(false);
  });

  it("rejects malformed JSON request bodies", async () => {
    const result = await readJsonBodyLimited(new Request("https://example.test", { method: "POST", body: "{" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("enforces the byte ceiling even without Content-Length", async () => {
    const result = await readJsonBodyLimited(new Request("https://example.test", { method: "POST", body: JSON.stringify({ value: "123456789" }) }), 8);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(413);
  });
});
