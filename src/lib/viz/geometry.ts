import * as THREE from "three";
import type { BuildingModel, FloorRef, Opening, Pt, Wall } from "./types";
import { bounds } from "./model";

// Procedural 3D from a (verified) BuildingModel. Model (x, y) → three (x, z = -y), y is up.
// Every mesh carries userData { kind, floor } so the viewer can show/hide/isolate/section layers.

export type Kind = "wall" | "column" | "beam" | "slab" | "roof" | "door" | "window" | "stair" | "balcony" | "footing" | "plinth" | "parapet";
export interface BuiltScene {
  root: THREE.Group;
  /** index 0..floors-1 = storeys; index `floors` = roof level */
  floorGroups: THREE.Group[];
  foundation: THREE.Group;
  labels: { text: string; position: [number, number, number]; floor: number }[];
  size: { w: number; d: number; h: number };
  center: THREE.Vector3;
}

const EXTERIOR: Record<string, string> = { Paint: "#f1f5f9", "Brick finish": "#b45a3c", Stone: "#a8a29e", Tile: "#d6c7a1", Glass: "#93c5fd", Metal: "#94a3b8" };
const STRUCT: Record<string, string> = { "Reinforced concrete": "#9ca3af", Steel: "#64748b", Brick: "#b45a3c", "Concrete block": "#a1a1aa" };

const onFloor = (f: FloorRef, i: number) => f === "all" || f === i;
const V = (p: Pt, y = 0) => new THREE.Vector3(p.x, y, -p.y);

function box(w: number, h: number, d: number, mat: THREE.Material, kind: Kind, floor: number): THREE.Mesh<THREE.BoxGeometry> {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.userData = { kind, floor }; m.castShadow = true; m.receiveShadow = true;
  return m;
}

function wallPieces(w: Wall, ops: Opening[], wallH: number) {
  const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;
  const iv: { s0: number; s1: number; y0: number; y1: number; o: Opening }[] = [];
  for (const o of ops) {
    const rx = o.c.x - w.a.x, ry = o.c.y - w.a.y;
    const s = rx * ux + ry * uy, perp = Math.abs(rx * uy - ry * ux);
    if (perp > Math.max(0.35, w.thickness) || s < -0.2 || s > L + 0.2) continue;
    const s0 = Math.max(0, s - o.width / 2), s1 = Math.min(L, s + o.width / 2);
    if (s1 - s0 < 0.2) continue;
    iv.push({ s0, s1, y0: Math.max(0, o.sill), y1: Math.min(wallH, o.sill + o.height), o });
  }
  iv.sort((a, b) => a.s0 - b.s0);
  const pieces: { s0: number; s1: number; y0: number; y1: number }[] = [];
  let cur = 0;
  for (const i of iv) {
    if (i.s0 < cur) continue; // overlapping opening: skip
    if (i.s0 - cur > 0.01) pieces.push({ s0: cur, s1: i.s0, y0: 0, y1: wallH });
    if (i.y0 > 0.01) pieces.push({ s0: i.s0, s1: i.s1, y0: 0, y1: i.y0 });
    if (i.y1 < wallH - 0.01) pieces.push({ s0: i.s0, s1: i.s1, y0: i.y1, y1: wallH });
    cur = i.s1;
  }
  if (L - cur > 0.01) pieces.push({ s0: cur, s1: L, y0: 0, y1: wallH });
  return { pieces, ux, uy, L, iv };
}

export function buildScene(model: BuildingModel): BuiltScene {
  const H = model.floorHeight.value, T = model.slabThickness, floors = model.floors;
  const ext = new THREE.Color(EXTERIOR[model.materials.exterior] ?? EXTERIOR.Paint);
  const mat = {
    wall: new THREE.MeshStandardMaterial({ color: ext, roughness: 0.9 }),
    wallInt: new THREE.MeshStandardMaterial({ color: "#e5e7eb", roughness: 0.9 }),
    struct: new THREE.MeshStandardMaterial({ color: STRUCT[model.materials.structure] ?? STRUCT["Reinforced concrete"], roughness: 0.8 }),
    slab: new THREE.MeshStandardMaterial({ color: "#8b8f98", roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: "#7c6f64", roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: "#60a5fa", transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.2 }),
    door: new THREE.MeshStandardMaterial({ color: "#7c4a21", roughness: 0.7 }),
    stair: new THREE.MeshStandardMaterial({ color: "#a3a3a3", roughness: 0.8 }),
    footing: new THREE.MeshStandardMaterial({ color: "#6b7280", roughness: 1 }),
  };

  const root = new THREE.Group(); root.name = "building";
  const foundation = new THREE.Group(); foundation.name = "foundation"; root.add(foundation);
  const floorGroups: THREE.Group[] = [];
  for (let i = 0; i <= floors; i++) { const g = new THREE.Group(); g.name = i === floors ? "roof" : `floor-${i}`; g.userData = { floor: i }; floorGroups.push(g); root.add(g); }
  const labels: BuiltScene["labels"] = [];

  const fp = model.footprint.points;
  const shape = fp.length >= 3 ? new THREE.Shape(fp.map((p) => new THREE.Vector2(p.x, p.y))) : null;
  const slabAt = (i: number, kind: Kind, m: THREE.Material) => {
    if (!shape) return;
    const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, m); mesh.position.y = i * H - T; mesh.userData = { kind, floor: i }; mesh.castShadow = mesh.receiveShadow = true;
    floorGroups[i].add(mesh);
  };

  // foundation: plinth slab + isolated footings under every column
  if (shape) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
    const plinth = new THREE.Mesh(g, mat.footing); plinth.position.y = -T - 0.25; plinth.userData = { kind: "plinth", floor: -1 }; foundation.add(plinth);
  }
  for (const c of model.columns) {
    const f = box(1.2, 0.5, 1.2, mat.footing, "footing", -1); f.position.copy(V(c.c, -T - 0.25 - 0.25)); foundation.add(f);
  }

  for (let i = 0; i <= floors; i++) slabAt(i, i === floors ? "roof" : "slab", i === floors ? mat.roof : mat.slab);

  for (let f = 0; f < floors; f++) {
    const g = floorGroups[f], y0 = f * H, wallH = H - T;
    const doors = model.doors.filter((o) => onFloor(o.floor, f)), wins = model.windows.filter((o) => onFloor(o.floor, f));
    const ops = [...doors, ...wins];

    for (const w of model.walls.filter((w) => onFloor(w.floor, f))) {
      const { pieces, ux, uy, L } = wallPieces(w, ops, wallH);
      if (L < 0.05) continue;
      const theta = Math.atan2(uy, ux);
      for (const p of pieces) {
        const len = p.s1 - p.s0, hh = p.y1 - p.y0; if (len < 0.01 || hh < 0.01) continue;
        const m = box(len, hh, w.thickness, w.exterior ? mat.wall : mat.wallInt, "wall", f);
        const sMid = (p.s0 + p.s1) / 2;
        m.position.copy(V({ x: w.a.x + ux * sMid, y: w.a.y + uy * sMid }, y0 + p.y0 + hh / 2)); m.rotation.y = theta;
        g.add(m);
      }
    }
    // door leaves / window panes (placed on their wall so the opening is visibly filled)
    const wallsF = model.walls.filter((w) => onFloor(w.floor, f));
    for (const o of ops) {
      const isDoor = doors.includes(o);
      let best: { w: Wall; d: number } | null = null;
      for (const w of wallsF) {
        const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy) || 1;
        const rx = o.c.x - w.a.x, ry = o.c.y - w.a.y, s = (rx * dx + ry * dy) / L, d = Math.abs((rx * dy - ry * dx) / L);
        if (s >= -0.2 && s <= L + 0.2 && d < Math.max(0.35, w.thickness) && (!best || d < best.d)) best = { w, d };
      }
      if (!best) continue;
      const w = best.w, th = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
      const pane = box(o.width, Math.min(o.height, wallH - o.sill), 0.04, isDoor ? mat.door : mat.glass, isDoor ? "door" : "window", f);
      pane.position.copy(V(o.c, y0 + o.sill + pane.geometry.parameters.height / 2)); pane.rotation.y = th;
      // snap to the wall line
      const nx = -Math.sin(th), ny = Math.cos(th), off = ((o.c.x - w.a.x) * nx + (o.c.y - w.a.y) * ny);
      pane.position.x -= nx * off; pane.position.z += ny * off;
      g.add(pane);
    }

    for (const c of model.columns.filter((c) => onFloor(c.floor, f))) {
      const m = box(c.size, H, c.size, mat.struct, "column", f); m.position.copy(V(c.c, y0 - T + H / 2)); g.add(m);
    }
    // beams between aligned neighbouring columns (structural CONCEPT, inferred)
    const cols = model.columns.filter((c) => onFloor(c.floor, f));
    for (const c of cols) {
      const right = cols.filter((o) => o !== c && o.c.x > c.c.x + 0.5 && Math.abs(o.c.y - c.c.y) < 0.3 && o.c.x - c.c.x < 15).sort((a, b) => a.c.x - b.c.x)[0];
      const up = cols.filter((o) => o !== c && o.c.y > c.c.y + 0.5 && Math.abs(o.c.x - c.c.x) < 0.3 && o.c.y - c.c.y < 15).sort((a, b) => a.c.y - b.c.y)[0];
      for (const o of [right, up]) {
        if (!o) continue;
        const l = Math.hypot(o.c.x - c.c.x, o.c.y - c.c.y), bm = box(l, 0.4, 0.25, mat.struct, "beam", f);
        bm.position.copy(V({ x: (o.c.x + c.c.x) / 2, y: (o.c.y + c.c.y) / 2 }, y0 + H - T - 0.2)); bm.rotation.y = o === right ? 0 : Math.PI / 2; g.add(bm);
      }
    }
    for (const s of model.stairs.filter((s) => onFloor(s.floor, f))) {
      const n = Math.max(4, Math.ceil(H / 0.17)), run = s.d / n;
      const sg = new THREE.Group(); sg.userData = { kind: "stair", floor: f };
      for (let i = 0; i < n; i++) {
        const sh = ((i + 1) * (H - T)) / n, st = box(s.w, sh, run, mat.stair, "stair", f);
        st.position.set(0, y0 + sh / 2, -(-s.d / 2 + run * (i + 0.5))); sg.add(st);
      }
      sg.position.add(V(s.c, 0)); sg.rotation.y = s.rotation; g.add(sg);
    }
    if (f >= 1) for (const b of model.balconies.filter((b) => onFloor(b.floor, f))) {
      const slab = box(b.w, T, b.d, mat.slab, "balcony", f); slab.position.copy(V(b.c, y0 - T / 2)); slab.rotation.y = b.rotation; g.add(slab);
      const rail = box(b.w, 1.0, 0.06, mat.glass, "balcony", f); rail.position.copy(V({ x: b.c.x, y: b.c.y - b.d / 2 }, y0 + 0.5)); g.add(rail);
    }
    if (f === 0) for (const r of model.rooms.filter((r) => onFloor(r.floor, 0))) labels.push({ text: r.name, position: [r.c.x, y0 + 0.2, -r.c.y], floor: 0 });
  }

  // roof level: parapet + optional gable
  const top = floorGroups[floors], yTop = floors * H;
  if (fp.length >= 3) for (let i = 0; i < fp.length; i++) {
    const a = fp[i], b = fp[(i + 1) % fp.length], l = Math.hypot(b.x - a.x, b.y - a.y); if (l < 0.1) continue;
    const pr = box(l, model.roof.parapet, 0.15, mat.wall, "parapet", floors);
    pr.position.copy(V({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, yTop + model.roof.parapet / 2)); pr.rotation.y = Math.atan2(b.y - a.y, b.x - a.x); top.add(pr);
  }
  if (model.roof.type === "gable" && fp.length >= 3) {
    const bb = bounds(fp), alongX = bb.w >= bb.d, short = Math.min(bb.w, bb.d), rise = short * 0.25;
    const g = new THREE.BufferGeometry();
    const x0 = bb.minX, x1 = bb.maxX, y0 = bb.minY, y1 = bb.maxY, h = yTop + model.roof.parapet;
    const P = (x: number, y: number, yy: number) => [x, yy, -y];
    const v = alongX
      ? [P(x0, y0, h), P(x1, y0, h), P(x1, (y0 + y1) / 2, h + rise), P(x0, (y0 + y1) / 2, h + rise), P(x0, y1, h), P(x1, y1, h)]
      : [P(x0, y0, h), P(x0, y1, h), P(x0 + (x1 - x0) / 2, y1, h + rise), P(x0 + (x1 - x0) / 2, y0, h + rise), P(x1, y0, h), P(x1, y1, h)];
    const idx = alongX ? [0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4, 0, 3, 4, 1, 5, 2] : [0, 2, 1, 0, 3, 2, 3, 5, 2, 3, 4, 5, 0, 4, 3, 1, 2, 5];
    g.setAttribute("position", new THREE.Float32BufferAttribute(v.flat(), 3)); g.setIndex(idx); g.computeVertexNormals();
    const rf = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: "#a1432b", roughness: 0.8, side: THREE.DoubleSide })); rf.userData = { kind: "roof", floor: floors }; top.add(rf);
  }

  const bbx = new THREE.Box3().setFromObject(root);
  const sz = bbx.getSize(new THREE.Vector3());
  return { root, floorGroups, foundation, labels, size: { w: sz.x, d: sz.z, h: sz.y }, center: bbx.getCenter(new THREE.Vector3()) };
}

export function countByKind(root: THREE.Object3D): Record<string, number> {
  const out: Record<string, number> = {};
  root.traverse((o) => { const k = (o as THREE.Mesh).isMesh ? (o.userData.kind as string | undefined) : undefined; if (k) out[k] = (out[k] ?? 0) + 1; });
  return out;
}
