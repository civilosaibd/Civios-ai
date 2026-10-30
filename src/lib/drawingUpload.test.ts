import { describe, expect, it } from "vitest";
import { detectDrawingType, inspectDrawingHeader } from "./drawingUpload";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (value: string) => new TextEncoder().encode(value);

describe("inspectDrawingHeader", () => {
  it("accepts supported raster and document signatures", () => {
    expect(inspectDrawingHeader({ name: "plan.jpg", size: 128 }, bytes(0xff, 0xd8, 0xff)).ok).toBe(true);
    expect(inspectDrawingHeader({ name: "plan.png", size: 128 }, bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)).ok).toBe(true);
    expect(inspectDrawingHeader({ name: "plan.webp", size: 128 }, ascii("RIFF0000WEBP")).ok).toBe(true);
    expect(inspectDrawingHeader({ name: "plan.pdf", size: 128 }, ascii("%PDF-1.7")).ok).toBe(true);
  });

  it("accepts ASCII DXF with an ENTITIES section", () => {
    const dxf = "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n";
    const result = inspectDrawingHeader({ name: "plan.dxf", size: dxf.length }, ascii(dxf));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("dxf");
  });

  it("rejects a renamed executable or mismatched file", () => {
    const result = inspectDrawingHeader({ name: "plan.png", size: 128 }, bytes(0x4d, 0x5a, 0x90, 0x00));
    expect(result.ok).toBe(false);
  });

  it("rejects empty, oversized and unsupported files", () => {
    const pdf = ascii("%PDF-1.7");
    expect(inspectDrawingHeader({ name: "plan.pdf", size: 0 }, pdf).ok).toBe(false);
    expect(inspectDrawingHeader({ name: "plan.pdf", size: 21 * 1024 * 1024 }, pdf).ok).toBe(false);
    expect(inspectDrawingHeader({ name: "notes.docx", size: 128 }, pdf).ok).toBe(false);
  });

  it("does not claim that DWG geometry is supported", () => {
    const result = inspectDrawingHeader({ name: "plan.dwg", size: 1024 }, bytes(0x41, 0x43, 0x31, 0x30));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("ASCII DXF");
  });

  it("recognizes drawing disciplines from file names and CAD layers", () => {
    expect(detectDrawingType("A-Foundation-Layout.pdf").type).toBe("foundation");
    expect(detectDrawingType("drawing.dxf", ["A-WALL", "S-COLUMN"]).type).toBe("column-layout");
    expect(detectDrawingType("unknown.pdf").type).toBe("unknown");
  });
});
