import { describe, expect, it } from "vitest";
import { documentToDxf, documentToSvg, dxfToDocument } from "./export";
import { distance, type CadDocument } from "./geometry";

describe("CAD export", () => {
  const doc: CadDocument = {
    version: 2,
    units: "mm",
    layers: [
      { id: "layer-0", name: "0", visible: true, color: "#111827", lineWeight: 1 },
      { id: "hidden", name: "HIDDEN", visible: false, color: "#999", lineWeight: 1 },
    ],
    entities: [
      { id: "w", layerId: "layer-0", type: "wall", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, thickness: 0.2 },
      { id: "c", layerId: "layer-0", type: "circle", center: { x: 5, y: 5 }, radius: 2 },
      { id: "secret", layerId: "hidden", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    ],
  };

  it("round-trips a wall length and a circle radius through DXF", () => {
    const imported = dxfToDocument(documentToDxf(doc), "mm");
    const line = imported.document.entities.find((entity) => entity.type === "line");
    const circle = imported.document.entities.find((entity) => entity.type === "circle");
    expect(line && line.type === "line" ? distance(line.start, line.end) : 0).toBeCloseTo(10, 5);
    expect(circle && circle.type === "circle" ? circle.radius : 0).toBeCloseTo(2, 5);
  });

  it("omits hidden layers from SVG and DXF", () => {
    expect(documentToSvg(doc)).not.toContain("HIDDEN");
    expect(documentToDxf(doc)).not.toContain("1.000000\n21\n1");
  });
});
