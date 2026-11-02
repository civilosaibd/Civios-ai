import { dimensionLength, entityBounds, polygonVertices, type CadDocument, type CadEntity, type CadLayer, type Point2D } from "./geometry";
import { getWallVisibleSegments } from "./wall-openings";

const INSUNITS: Record<CadDocument["units"], number> = { in: 1, ft: 2, mm: 4, cm: 5, m: 6 };

function visible(doc: CadDocument, entity: CadEntity): boolean {
  return doc.layers.find((layer) => layer.id === entity.layerId)?.visible !== false;
}

function layerName(doc: CadDocument, entity: CadEntity): string {
  return doc.layers.find((layer) => layer.id === entity.layerId)?.name ?? "0";
}

function fmt(n: number): string {
  return Number(n.toFixed(6)).toString();
}

function dxfPair(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

function lineEntity(layer: string, a: Point2D, b: Point2D): string {
  return `0\nLINE\n8\n${layer}\n10\n${fmt(a.x)}\n20\n${fmt(a.y)}\n11\n${fmt(b.x)}\n21\n${fmt(b.y)}\n`;
}

function polyEntity(layer: string, points: Point2D[], closed: boolean): string {
  let body = `0\nLWPOLYLINE\n8\n${layer}\n90\n${points.length}\n70\n${closed ? 1 : 0}\n`;
  for (const point of points) body += `10\n${fmt(point.x)}\n20\n${fmt(point.y)}\n`;
  return body;
}

/** R12-compatible ASCII DXF of the visible drawing. Lengths stay in document units. */
export function documentToDxf(doc: CadDocument): string {
  let body = "";
  const skipped: string[] = [];
  for (const entity of doc.entities) {
    if (!visible(doc, entity)) continue;
    const layer = layerName(doc, entity);
    if (entity.type === "line") body += lineEntity(layer, entity.start, entity.end);
    else if (entity.type === "wall") getWallVisibleSegments(entity, doc.entities).forEach((segment) => { body += lineEntity(layer, segment.start, segment.end); });
    else if (entity.type === "polyline") body += polyEntity(layer, entity.points, entity.closed);
    else if (entity.type === "rectangle") body += polyEntity(layer, [entity.min, { x: entity.max.x, y: entity.min.y }, entity.max, { x: entity.min.x, y: entity.max.y }], true);
    else if (entity.type === "polygon") body += polyEntity(layer, polygonVertices(entity), true);
    else if (entity.type === "circle") body += `0\nCIRCLE\n8\n${layer}\n10\n${fmt(entity.center.x)}\n20\n${fmt(entity.center.y)}\n40\n${fmt(entity.radius)}\n`;
    else if (entity.type === "arc") {
      const start = (entity.startAngle * 180) / Math.PI;
      const end = (entity.endAngle * 180) / Math.PI;
      body += `0\nARC\n8\n${layer}\n10\n${fmt(entity.center.x)}\n20\n${fmt(entity.center.y)}\n40\n${fmt(entity.radius)}\n50\n${fmt(start)}\n51\n${fmt(end)}\n`;
    }
    else if (entity.type === "door" || entity.type === "window") {
      const dx = Math.cos(entity.rotation) * entity.width / 2;
      const dy = Math.sin(entity.rotation) * entity.width / 2;
      const a = { x: entity.at.x - dx, y: entity.at.y - dy };
      const b = { x: entity.at.x + dx, y: entity.at.y + dy };
      if (entity.type === "door") {
        body += lineEntity(layer, a, b);
        body += `0\nARC\n8\n${layer}\n10\n${fmt(a.x)}\n20\n${fmt(a.y)}\n40\n${fmt(entity.width)}\n50\n${fmt((entity.rotation * 180) / Math.PI)}\n51\n${fmt(((entity.rotation + (entity.swing === "left" ? 1 : -1) * Math.PI / 2) * 180) / Math.PI)}\n`;
      } else {
        const nx = -Math.sin(entity.rotation), ny = Math.cos(entity.rotation);
        const jamb = Math.max(0.08, entity.width * 0.06);
        body += lineEntity(layer, { x: a.x + nx * jamb / 2, y: a.y + ny * jamb / 2 }, { x: b.x + nx * jamb / 2, y: b.y + ny * jamb / 2 });
        body += lineEntity(layer, { x: a.x - nx * jamb / 2, y: a.y - ny * jamb / 2 }, { x: b.x - nx * jamb / 2, y: b.y - ny * jamb / 2 });
        body += lineEntity(layer, { x: a.x - nx * jamb, y: a.y - ny * jamb }, { x: a.x + nx * jamb, y: a.y + ny * jamb });
        body += lineEntity(layer, { x: b.x - nx * jamb, y: b.y - ny * jamb }, { x: b.x + nx * jamb, y: b.y + ny * jamb });
      }
    }
    else if (entity.type === "stair") {
      const b=entityBounds(entity); body += polyEntity(layer,[b.min,{x:b.max.x,y:b.min.y},b.max,{x:b.min.x,y:b.max.y}],true);
      for(let i=1;i<entity.steps;i++){const f=i/entity.steps;if(entity.direction==="x"){const x=entity.at.x-entity.width/2+entity.width*f;body+=lineEntity(layer,{x,y:entity.at.y-entity.depth/2},{x,y:entity.at.y+entity.depth/2});}else{const y=entity.at.y-entity.depth/2+entity.depth*f;body+=lineEntity(layer,{x:entity.at.x-entity.width/2,y},{x:entity.at.x+entity.width/2,y});}}
    }
    else if (entity.type === "column") {
      const hx = entity.width / 2, hy = entity.depth / 2;
      body += polyEntity(layer, [
        { x: entity.at.x - hx, y: entity.at.y - hy },
        { x: entity.at.x + hx, y: entity.at.y - hy },
        { x: entity.at.x + hx, y: entity.at.y + hy },
        { x: entity.at.x - hx, y: entity.at.y + hy },
      ], true);
    }
    else if (entity.type === "text") {
      body += `0\nTEXT\n8\n${layer}\n10\n${fmt(entity.at.x)}\n20\n${fmt(entity.at.y)}\n40\n${fmt(entity.height)}\n1\n${entity.text.replace(/\n/g, " ")}\n`;
    }
    else if (entity.type === "dimension") {
      body += lineEntity(layer, entity.a, entity.b);
      const mid = { x: (entity.a.x + entity.b.x) / 2, y: (entity.a.y + entity.b.y) / 2 };
      body += `0\nTEXT\n8\n${layer}\n10\n${fmt(mid.x)}\n20\n${fmt(mid.y + entity.offset)}\n40\n1\n1\n${fmt(dimensionLength(entity))}\n`;
    }
    else skipped.push(entity.type);
  }
  const layers = doc.layers.map((layer) => `0\nLAYER\n2\n${layer.name}\n70\n${layer.visible ? 0 : 1}\n62\n7\n6\nCONTINUOUS\n`).join("");
  return [
    "0", "SECTION", "2", "HEADER",
    "9", "$INSUNITS", "70", String(INSUNITS[doc.units]),
    "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES",
    "0", "TABLE", "2", "LAYER", "70", String(doc.layers.length),
    layers.trimEnd(),
    "0", "ENDTAB", "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    body.trimEnd(),
    "0", "ENDSEC", "0", "EOF", "",
  ].filter((line) => line !== "").join("\n") + "\n" + (skipped.length ? `999\n${skipped.length} unsupported entities omitted\n` : "");
}

function esc(value: string): string {
  return value.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

/** SVG in drawing units. Hidden layers are omitted. */
export function documentToSvg(doc: CadDocument): string {
  const shown = doc.entities.filter((entity) => visible(doc, entity));
  let minX = 0, minY = 0, maxX = 100, maxY = 100;
  const touch = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const entity of shown) {
    if (entity.type === "line" || entity.type === "wall") { touch(entity.start.x, entity.start.y); touch(entity.end.x, entity.end.y); }
    else if (entity.type === "circle" || entity.type === "arc") { touch(entity.center.x - entity.radius, entity.center.y - entity.radius); touch(entity.center.x + entity.radius, entity.center.y + entity.radius); }
    else if (entity.type === "polygon") polygonVertices(entity).forEach((p) => touch(p.x, p.y));
    else if ("at" in entity && entity.at) touch(entity.at.x, entity.at.y);
    else if (entity.type === "dimension") { touch(entity.a.x, entity.a.y); touch(entity.b.x, entity.b.y); }
    else if (entity.type === "rectangle") { touch(entity.min.x, entity.min.y); touch(entity.max.x, entity.max.y); }
    else if (entity.type === "polyline") entity.points.forEach((p) => touch(p.x, p.y));
  }
  const padX = (maxX - minX) * 0.05 || 1;
  const padY = (maxY - minY) * 0.05 || 1;
  const color = (layerId: string) => doc.layers.find((layer) => layer.id === layerId)?.color ?? "#111827";
  const parts: string[] = [];
  for (const entity of shown) {
    const stroke = color(entity.layerId);
    if (entity.type === "line") parts.push(`<line x1="${entity.start.x}" y1="${entity.start.y}" x2="${entity.end.x}" y2="${entity.end.y}" stroke="${stroke}" fill="none"/>`);
    else if (entity.type === "wall") getWallVisibleSegments(entity, shown).forEach((segment) => parts.push(`<line x1="${segment.start.x}" y1="${segment.start.y}" x2="${segment.end.x}" y2="${segment.end.y}" stroke="${stroke}" stroke-width="${entity.thickness}" stroke-linecap="square" fill="none"/>`));
    else if (entity.type === "circle") parts.push(`<circle cx="${entity.center.x}" cy="${entity.center.y}" r="${entity.radius}" stroke="${stroke}" fill="none"/>`);
    else if (entity.type === "door" || entity.type === "window") {
      const dx = Math.cos(entity.rotation) * entity.width / 2, dy = Math.sin(entity.rotation) * entity.width / 2;
      const a = { x: entity.at.x - dx, y: entity.at.y - dy }, b = { x: entity.at.x + dx, y: entity.at.y + dy };
      if (entity.type === "door") {
        const endAngle = entity.rotation + (entity.swing === "left" ? 1 : -1) * Math.PI / 2;
        const arcEnd = { x: entity.at.x + Math.cos(endAngle) * entity.width / 2, y: entity.at.y + Math.sin(endAngle) * entity.width / 2 };
        parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}"/><path d="M ${a.x} ${a.y} A ${entity.width / 2} ${entity.width / 2} 0 0 ${entity.swing === "left" ? 0 : 1} ${arcEnd.x} ${arcEnd.y}" stroke="${stroke}" fill="none"/>`);
      } else {
        const nx = -Math.sin(entity.rotation), ny = Math.cos(entity.rotation), jamb = Math.max(0.08, entity.width * 0.06);
        parts.push(`<line x1="${a.x + nx * jamb / 2}" y1="${a.y + ny * jamb / 2}" x2="${b.x + nx * jamb / 2}" y2="${b.y + ny * jamb / 2}" stroke="${stroke}"/><line x1="${a.x - nx * jamb / 2}" y1="${a.y - ny * jamb / 2}" x2="${b.x - nx * jamb / 2}" y2="${b.y - ny * jamb / 2}" stroke="${stroke}"/><line x1="${a.x - nx * jamb}" y1="${a.y - ny * jamb}" x2="${a.x + nx * jamb}" y2="${a.y + ny * jamb}" stroke="${stroke}"/><line x1="${b.x - nx * jamb}" y1="${b.y - ny * jamb}" x2="${b.x + nx * jamb}" y2="${b.y + ny * jamb}" stroke="${stroke}"/>`);
      }
    }
    else if (entity.type === "text") parts.push(`<text x="${entity.at.x}" y="${entity.at.y}" font-size="${entity.height}" fill="${stroke}">${esc(entity.text)}</text>`);
    else if (entity.type === "dimension") parts.push(`<line x1="${entity.a.x}" y1="${entity.a.y}" x2="${entity.b.x}" y2="${entity.b.y}" stroke="${stroke}" fill="none"/><text x="${(entity.a.x + entity.b.x) / 2}" y="${(entity.a.y + entity.b.y) / 2}" font-size="1" fill="${stroke}">${fmt(dimensionLength(entity))}</text>`);
    else if (entity.type === "stair") {
      const b=entityBounds(entity),pts=[b.min,{x:b.max.x,y:b.min.y},b.max,{x:b.min.x,y:b.max.y}];parts.push(`<polyline points="${pts.map(p=>`${p.x},${p.y}`).join(" ")}" stroke="${stroke}" fill="${stroke}" fill-opacity="0.06"/>`);
      for(let i=1;i<entity.steps;i++){const f=i/entity.steps;if(entity.direction==="x"){const x=entity.at.x-entity.width/2+entity.width*f;parts.push(`<line x1="${x}" y1="${entity.at.y-entity.depth/2}" x2="${x}" y2="${entity.at.y+entity.depth/2}" stroke="${stroke}"/>`);}else{const y=entity.at.y-entity.depth/2+entity.depth*f;parts.push(`<line x1="${entity.at.x-entity.width/2}" y1="${y}" x2="${entity.at.x+entity.width/2}" y2="${y}" stroke="${stroke}"/>`);}}
    }
    else if (entity.type === "polyline" || entity.type === "polygon" || entity.type === "rectangle" || entity.type === "column") {
      const points = entity.type === "polyline" ? entity.points
        : entity.type === "polygon" ? polygonVertices(entity)
        : entity.type === "rectangle" ? [entity.min, { x: entity.max.x, y: entity.min.y }, entity.max, { x: entity.min.x, y: entity.max.y }]
        : [{ x: entity.at.x - entity.width / 2, y: entity.at.y - entity.depth / 2 }, { x: entity.at.x + entity.width / 2, y: entity.at.y - entity.depth / 2 }, { x: entity.at.x + entity.width / 2, y: entity.at.y + entity.depth / 2 }, { x: entity.at.x - entity.width / 2, y: entity.at.y + entity.depth / 2 }];
      parts.push(`<polyline points="${points.map((p) => `${p.x},${p.y}`).join(" ")}" stroke="${stroke}" fill="${entity.type === "column" ? stroke : "none"}" fill-opacity="${entity.type === "column" ? 0.25 : 0}"/>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - padX} ${minY - padY} ${maxX - minX + padX * 2} ${maxY - minY + padY * 2}">\n${parts.join("\n")}\n</svg>\n`;
}

type Group = { code: string; values: Record<string, string[]> };

function parseEntities(text: string): { groups: Group[]; notes: string[] } {
  const lines = text.replace(/\r/g, "").split("\n");
  const groups: Group[] = [];
  let i = 0;
  let inEntities = false;
  const notes: string[] = [];
  while (i + 1 < lines.length) {
    const code = lines[i].trim();
    const value = lines[i + 1]?.trim() ?? "";
    i += 2;
    if (code === "0" && value === "SECTION") continue;
    if (code === "2" && value === "ENTITIES") { inEntities = true; continue; }
    if (code === "0" && value === "ENDSEC") { inEntities = false; continue; }
    if (!inEntities) continue;
    if (code === "0") groups.push({ code: value, values: {} });
    else if (groups.length) {
      const current = groups[groups.length - 1];
      (current.values[code] ??= []).push(value);
    }
  }
  return { groups, notes };
}

function num(group: Group, code: string, index = 0): number {
  const value = Number(group.values[code]?.[index]);
  return Number.isFinite(value) ? value : NaN;
}

/** Import LINE, LWPOLYLINE, CIRCLE, ARC, and TEXT. Other entities are counted in notes. */
export function dxfToDocument(text: string, units: CadDocument["units"] = "mm"): { document: CadDocument; notes: string[] } {
  const { groups } = parseEntities(text);
  const layers = new Map<string, CadLayer>();
  const ensure = (name: string): string => {
    const existing = layers.get(name);
    if (existing) return existing.id;
    const layer: CadLayer = { id: `layer-${layers.size}`, name, visible: true, color: "#111827", lineWeight: 1 };
    layers.set(name, layer);
    return layer.id;
  };
  ensure("0");
  const entities: CadEntity[] = [];
  const notes: string[] = [];
  let n = 0;
  for (const group of groups) {
    const layerId = ensure(group.values["8"]?.[0] ?? "0");
    const id = `dxf-${n++}`;
    if (group.code === "LINE") {
      const start = { x: num(group, "10"), y: num(group, "20") };
      const end = { x: num(group, "11"), y: num(group, "21") };
      if ([start.x, start.y, end.x, end.y].every(Number.isFinite)) entities.push({ id, layerId, type: "line", start, end });
    } else if (group.code === "CIRCLE") {
      const center = { x: num(group, "10"), y: num(group, "20") };
      const radius = num(group, "40");
      if (Number.isFinite(center.x) && radius > 0) entities.push({ id, layerId, type: "circle", center, radius });
    } else if (group.code === "ARC") {
      const center = { x: num(group, "10"), y: num(group, "20") };
      const radius = num(group, "40");
      const startAngle = (num(group, "50") * Math.PI) / 180;
      const endAngle = (num(group, "51") * Math.PI) / 180;
      if (radius > 0) entities.push({ id, layerId, type: "arc", center, radius, startAngle, endAngle });
    } else if (group.code === "LWPOLYLINE") {
      const xs = group.values["10"] ?? [];
      const ys = group.values["20"] ?? [];
      const points = xs.map((x, index) => ({ x: Number(x), y: Number(ys[index]) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      const closed = (Number(group.values["70"]?.[0]) & 1) === 1;
      if (points.length >= 2) entities.push({ id, layerId, type: "polyline", points, closed });
    } else if (group.code === "TEXT") {
      const at = { x: num(group, "10"), y: num(group, "20") };
      const height = num(group, "40") || 1;
      const value = group.values["1"]?.[0] ?? "";
      if (Number.isFinite(at.x)) entities.push({ id, layerId, type: "text", at, text: value, height, rotation: 0 });
    } else notes.push(group.code);
  }
  if (!layers.size) ensure("0");
  return {
    document: { version: 2, units, entities, layers: [...layers.values()] },
    notes,
  };
}
