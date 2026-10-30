import { describe, expect, it } from "vitest";
import { detectDrawingType, inspectDrawingHeader } from "./drawingUpload";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("inspectDrawingHeader", () => {
  it("accepts a PDF only when its PDF signature matches", () => {
    const result = inspectDrawingHeader({ name: "floor-plan.pdf", size: 128 }, bytes(0x25, 0x50, 0x44, 0x46, 0x2d));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("pdf");
  });

  it("rejects a renamed executable or mismatched file", () => {
    const result = inspectDrawingHeader({ name: "plan.png", size: 128 }, bytes(0x4d, 0x5a, 0x90, 0x00));
    expect(result.ok).toBe(false);
  });

  it("rejects empty and oversized files", () => {
    expect(inspectDrawingHeader({ name: "plan.pdf", size: 0 }, bytes(0x25, 0x50, 0x44, 0x46, 0x2d)).ok).toBe(false);
    expect(inspectDrawingHeader({ name: "plan.pdf", size: 21 * 1024 * 1024 }, bytes(0x25, 0x50, 0x44, 0x46, 0x2d)).ok).toBe(false);
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
