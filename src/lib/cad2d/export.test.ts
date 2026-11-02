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

import { importDxfDocument } from "./dxf-import";

describe("native DXF importer", () => {
  it("imports common entities, preserves layers and reads INSUNITS", () => {
    const dxf = [
      "0","SECTION","2","HEADER","9","$INSUNITS","70","4","0","ENDSEC",
      "0","SECTION","2","TABLES","0","TABLE","2","LAYER","70","2",
      "0","LAYER","2","0","70","0","62","7",
      "0","LAYER","2","WALLS","70","0","62","1","0","ENDTAB","0","ENDSEC",
      "0","SECTION","2","ENTITIES",
      "0","LINE","8","WALLS","10","0","20","0","11","120","21","0",
      "0","LWPOLYLINE","8","0","90","3","70","1","10","0","20","0","10","40","20","0","10","40","20","30",
      "0","CIRCLE","8","0","10","20","20","20","40","5",
      "0","ENDSEC","0","EOF",
    ].join("\\n");
    const result = importDxfDocument(dxf);
    expect(result.document.units).toBe("mm");
    expect(result.document.entities).toHaveLength(3);
    expect(result.document.layers.map((layer) => layer.name)).toEqual(["0", "WALLS"]);
    expect(result.document.entities[0].type).toBe("line");
    expect(result.document.entities[1].type).toBe("polyline");
    expect(result.document.entities[2].type).toBe("circle");
    expect(result.notes).toEqual([]);
  });

  it("imports classic POLYLINE/VERTEX sequences and reports unsupported entities", () => {
    const dxf = [
      "0","SECTION","2","ENTITIES",
      "0","POLYLINE","8","SITE","70","1",
      "0","VERTEX","10","0","20","0",
      "0","VERTEX","10","10","20","0",
      "0","VERTEX","10","10","20","10",
      "0","SEQEND",
      "0","INSERT","8","BLOCKS","2","CHAIR",
      "0","ENDSEC","0","EOF",
    ].join("\\n");
    const result = importDxfDocument(dxf, "ft");
    expect(result.document.entities).toHaveLength(1);
    expect(result.document.entities[0].type).toBe("polyline");
    expect(result.document.units).toBe("ft");
    expect(result.notes).toContain("INSERT");
  });

  it("rejects empty or unsupported-only drawings", () => {
    expect(() => importDxfDocument("")).toThrow(/empty/i);
    expect(() => importDxfDocument(["0","SECTION","2","ENTITIES","0","INSERT","2","X","0","ENDSEC","0","EOF"].join("\\n"))).toThrow(/supported/i);
  });
});
