import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, Line, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import type { CadDocument, CadEntity, Point2D } from "@/lib/cad2d/geometry";
import { getWallOpeningIntervals, getWallVisibleSegments } from "@/lib/cad2d/wall-openings";

type MaterialThemeId = "modern" | "warm" | "glass" | "concrete";
const MATERIAL_THEMES: Record<MaterialThemeId, { label: string; wall: string; column: string; frame: string; trim: string; roof: string; glass: string; ground: string }> = {
  modern: { label: "Modern White", wall: "#e8edf2", column: "#cbd5e1", frame: "#334155", trim: "#f8fafc", roof: "#d7dde5", glass: "#8fc8e8", ground: "#dce5ed" },
  warm: { label: "Warm Stone", wall: "#c8b59b", column: "#9a8062", frame: "#493b30", trim: "#e9dcc8", roof: "#b9a68f", glass: "#a6cbd8", ground: "#e3d9ca" },
  glass: { label: "Glass & Steel", wall: "#9fb4c3", column: "#475569", frame: "#1e293b", trim: "#cbd5e1", roof: "#64748b", glass: "#77bde0", ground: "#d9e3ea" },
  concrete: { label: "Exposed Concrete", wall: "#a8adb3", column: "#858c94", frame: "#3f4852", trim: "#d1d5db", roof: "#9ca3af", glass: "#9bc7df", ground: "#d4d8dc" },
};

const unitToMetres: Record<CadDocument["units"], number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };
const DEFAULT_WALL_HEIGHT = 3;
const point3 = (p: Point2D, factor: number, y = 0): [number, number, number] => [p.x * factor, y, -p.y * factor];

function Entity3D({ entity, color, factor, theme, entities }: { entity: CadEntity; color: string; factor: number; theme: typeof MATERIAL_THEMES[MaterialThemeId]; entities: CadEntity[] }) {
  const height = DEFAULT_WALL_HEIGHT;
  if (entity.type === "wall") {
    const dx = (entity.end.x - entity.start.x) * factor;
    const dy = (entity.end.y - entity.start.y) * factor;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return null;
    const rotation = Math.atan2(dy, dx);
    const thickness = Math.max(0.04, entity.thickness * factor);
    const wallMesh = (from: number, to: number, bottom: number, top: number, key: string) => {
      const segmentLength = (to - from) * factor;
      if (segmentLength < 0.001 || top <= bottom) return null;
      const centerDistance = (from + to) / 2;
      const center: [number, number, number] = [
        (entity.start.x + (entity.end.x - entity.start.x) * centerDistance / Math.max(length / factor, 1e-9)) * factor,
        (bottom + top) / 2,
        -(entity.start.y + (entity.end.y - entity.start.y) * centerDistance / Math.max(length / factor, 1e-9)) * factor,
      ];
      return <mesh key={key} position={center} rotation={[0, rotation, 0]} castShadow receiveShadow>
        <boxGeometry args={[segmentLength, top - bottom, thickness]} />
        <meshStandardMaterial color={theme.wall} roughness={0.82} />
      </mesh>;
    };
    const segments = getWallVisibleSegments(entity, entities);
    const openings = getWallOpeningIntervals(entity, entities);
    return <group>
      {segments.map((segment, index) => {
        const from = Math.hypot(segment.start.x - entity.start.x, segment.start.y - entity.start.y);
        const to = Math.hypot(segment.end.x - entity.start.x, segment.end.y - entity.start.y);
        return wallMesh(from, to, 0, height, `wall-${entity.id}-solid-${index}`);
      })}
      {openings.filter(({ opening }) => opening.type === "window").map(({ from, to, opening }, index) => {
        const sillHeight = Math.min(0.8, height * 0.3);
        const headHeight = Math.min(2.0, height * 0.72);
        return <group key={`wall-${entity.id}-window-${opening.id}-${index}`}>
          {wallMesh(from, to, 0, sillHeight, `wall-${entity.id}-window-sill-${index}`)}
          {wallMesh(from, to, headHeight, height, `wall-${entity.id}-window-head-${index}`)}
        </group>;
      })}
    </group>;
  }
  if (entity.type === "column") {
    return <mesh position={point3(entity.at, factor, height / 2)} rotation={[0, -entity.rotation, 0]} castShadow receiveShadow>
      <boxGeometry args={[Math.max(0.08, entity.width * factor), height, Math.max(0.08, entity.depth * factor)]} />
      <meshStandardMaterial color={theme.column} roughness={0.72} />
    </mesh>;
  }
  if (entity.type === "door") {
    const doorWidth = Math.max(0.65, entity.width * factor);
    const frame = 0.075;
    return <group position={point3(entity.at, factor)} rotation={[0, -entity.rotation, 0]}>
      <mesh position={[0, 1.05, 0.015]} castShadow>
        <boxGeometry args={[doorWidth, 2.1, 0.055]} />
        <meshStandardMaterial color={theme.frame} roughness={0.48} />
      </mesh>
      {[-1, 1].map((side) => <mesh key={side} position={[side * (doorWidth / 2 + frame / 2), 1.08, 0]}>
        <boxGeometry args={[frame, 2.22, 0.13]} />
        <meshStandardMaterial color={theme.trim} roughness={0.62} />
      </mesh>)}
      <mesh position={[0, 2.18, 0]}><boxGeometry args={[doorWidth + frame * 2, 0.12, 0.13]} /><meshStandardMaterial color={theme.trim} roughness={0.62} /></mesh>
      <mesh position={[0, 0.035, 0.04]}><boxGeometry args={[doorWidth + frame * 2, 0.07, 0.18]} /><meshStandardMaterial color={theme.trim} roughness={0.7} /></mesh>
      <mesh position={[doorWidth * 0.34, 1.05, 0.055]}><sphereGeometry args={[0.035, 12, 12]} /><meshStandardMaterial color="#d6b36a" metalness={0.72} roughness={0.25} /></mesh>
    </group>;
  }
  if (entity.type === "window") {
    const windowWidth = Math.max(0.5, entity.width * factor);
    const windowHeight = 1.15;
    const frame = 0.055;
    const frameColor = "#334155";
    return <group position={point3(entity.at, factor)} rotation={[0, -entity.rotation, 0]}>
      <mesh position={[0, 1.38, -0.012]}>
        <boxGeometry args={[windowWidth, windowHeight, 0.035]} />
        <meshPhysicalMaterial color={theme.glass} metalness={0.18} roughness={0.12} transmission={0.12} transparent opacity={0.82} />
      </mesh>
      {[-1, 1].map((side) => <mesh key={side} position={[side * (windowWidth / 2 + frame / 2), 1.38, 0.025]}>
        <boxGeometry args={[frame, windowHeight + frame * 2, 0.09]} />
        <meshStandardMaterial color={frameColor} metalness={0.48} roughness={0.34} />
      </mesh>)}
      {[-1, 1].map((side) => <mesh key={side} position={[0, 1.38 + side * (windowHeight / 2 + frame / 2), 0.025]}>
        <boxGeometry args={[windowWidth + frame * 2, frame, 0.09]} />
        <meshStandardMaterial color={frameColor} metalness={0.48} roughness={0.34} />
      </mesh>)}
      <mesh position={[0, 1.38, 0.035]}><boxGeometry args={[0.035, windowHeight, 0.095]} /><meshStandardMaterial color={theme.frame} metalness={0.5} roughness={0.35} /></mesh>
      <mesh position={[0, 0.76, 0.06]}><boxGeometry args={[windowWidth + 0.2, 0.09, 0.24]} /><meshStandardMaterial color="#e2e8f0" roughness={0.65} /></mesh>
      <mesh position={[0, 2.02, 0.045]}><boxGeometry args={[windowWidth + 0.14, 0.08, 0.18]} /><meshStandardMaterial color="#e2e8f0" roughness={0.65} /></mesh>
    </group>;
  }
  if (entity.type === "rectangle") {
    const width = Math.max(0.03, (entity.max.x - entity.min.x) * factor);
    const depth = Math.max(0.03, (entity.max.y - entity.min.y) * factor);
    const center: [number, number, number] = [(entity.min.x + entity.max.x) * factor / 2, 0.06, -(entity.min.y + entity.max.y) * factor / 2];
    return <mesh position={center} castShadow receiveShadow><boxGeometry args={[width, 0.12, depth]} /><meshStandardMaterial color={color} roughness={0.75} /></mesh>;
  }
  if (entity.type === "circle") {
    return <mesh position={point3(entity.center, factor, 0.06)} scale={[1, 1, 1]} castShadow>
      <cylinderGeometry args={[Math.max(0.025, entity.radius * factor), Math.max(0.025, entity.radius * factor), 0.12, 32]} />
      <meshStandardMaterial color={color} />
    </mesh>;
  }
  if (entity.type === "ellipse") {
    return <mesh position={point3(entity.center, factor, 0.06)} scale={[Math.max(0.03, entity.rx * factor), 1, Math.max(0.03, entity.ry * factor)]}>
      <cylinderGeometry args={[1, 1, 0.12, 32]} /><meshStandardMaterial color={color} />
    </mesh>;
  }
  if (entity.type === "line" || entity.type === "polyline" || entity.type === "dimension") {
    const points = entity.type === "line" ? [entity.start, entity.end]
      : entity.type === "dimension" ? [entity.a, entity.b]
      : entity.points;
    if (points.length < 2) return null;
    const coords = points.map((p) => new THREE.Vector3(...point3(p, factor, 0.035)));
    if (entity.type === "polyline" && entity.closed) coords.push(coords[0].clone());
    return <Line points={coords} color={color} lineWidth={1.5} />;
  }
  if (entity.type === "polygon") {
    const points = Array.from({ length: Math.max(3, entity.sides) }, (_, i) => {
      const a = entity.rotation + i * Math.PI * 2 / Math.max(3, entity.sides);
      return new THREE.Vector3((entity.center.x + Math.cos(a) * entity.radius) * factor, 0.04, -(entity.center.y + Math.sin(a) * entity.radius) * factor);
    });
    points.push(points[0].clone());
    return <Line points={points} color={color} lineWidth={1.5} />;
  }
  if (entity.type === "arc") {
    const sweep = entity.endAngle >= entity.startAngle ? entity.endAngle - entity.startAngle : entity.endAngle + Math.PI * 2 - entity.startAngle;
    const points = Array.from({ length: 33 }, (_, i) => {
      const a = entity.startAngle + sweep * i / 32;
      return new THREE.Vector3((entity.center.x + Math.cos(a) * entity.radius) * factor, 0.04, -(entity.center.y + Math.sin(a) * entity.radius) * factor);
    });
    return <Line points={points} color={color} lineWidth={1.5} />;
  }
  if (entity.type === "text") {
    return <group position={point3(entity.at, factor, 0.08)}><mesh><boxGeometry args={[Math.max(0.2, entity.text.length * entity.height * factor * 0.35), 0.025, 0.025]} /><meshBasicMaterial color={color} /></mesh></group>;
  }
  return null;
}

export default function Cad3DPreview({ document, floorCount = 1 }: { document: CadDocument; floorCount?: number }) {
  const [themeId, setThemeId] = useState<MaterialThemeId>("modern");
  const theme = MATERIAL_THEMES[themeId];
  const levels = Math.max(1, Math.min(20, Math.round(floorCount)));
  const factor = unitToMetres[document.units];
  const visibleEntities = useMemo(() => document.entities.filter((entity) => document.layers.find((layer) => layer.id === entity.layerId)?.visible !== false), [document]);
  const bounds = useMemo(() => {
    if (!visibleEntities.length) return { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
    const points: Point2D[] = [];
    visibleEntities.filter((entity) => entity.type !== "text").forEach((entity) => {
      if (entity.type === "line" || entity.type === "wall") points.push(entity.start, entity.end);
      else if (entity.type === "polyline") points.push(...entity.points);
      else if (entity.type === "rectangle") points.push(entity.min, entity.max);
      else if (entity.type === "dimension") points.push(entity.a, entity.b);
      else if ("center" in entity) points.push(entity.center);
      else if ("at" in entity) points.push(entity.at);
    });
    const minX = Math.min(...points.map((p) => p.x)) * factor;
    const maxX = Math.max(...points.map((p) => p.x)) * factor;
    const minZ = -Math.max(...points.map((p) => p.y)) * factor;
    const maxZ = -Math.min(...points.map((p) => p.y)) * factor;
    return { minX, maxX, minZ, maxZ };
  }, [visibleEntities, factor]);
  const width = Math.max(4, bounds.maxX - bounds.minX);
  const depth = Math.max(4, bounds.maxZ - bounds.minZ);
  const center: [number, number, number] = [(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2];
  const modelHeight = levels * 3.2;
  const radius = Math.max(width, depth, modelHeight * 0.75, 3);
  return <div className="relative min-h-[360px] w-full flex-1 bg-slate-100" data-testid="indocad-3d-preview">
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [radius * 1.35, modelHeight / 2 + radius * 1.1, radius * 1.35], fov: 42, near: 0.1, far: radius * 40 }}>
      <color attach="background" args={["#eaf0f7"]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={["#ffffff", "#64748b", 0.55]} />
      <directionalLight position={[width, radius * 2, depth]} intensity={1.35} castShadow shadow-mapSize={[2048, 2048]} />
      <group position={[-center[0], 0, -center[2]]}>
        <mesh rotation-x={-Math.PI / 2} position={[center[0], -0.08, center[2]]} receiveShadow>
          <planeGeometry args={[width + radius * 1.5, depth + radius * 1.5]} />
          <meshStandardMaterial color={theme.ground} roughness={0.95} />
        </mesh>
        <Grid position={[center[0], -0.065, center[2]]} args={[width + radius * 1.5, depth + radius * 1.5]} cellSize={1} sectionSize={5} fadeDistance={radius * 4} infiniteGrid={false} />
        {Array.from({ length: levels }, (_, level) => <group key={`floor-${level}`} position={[0, level * 3.2, 0]}>
          {level > 0 && <mesh position={[center[0], -0.025, center[2]]} receiveShadow><boxGeometry args={[width, 0.12, depth]} /><meshStandardMaterial color="#cbd5e1" roughness={0.85} /></mesh>}
          {visibleEntities.filter((entity) => level === 0 || (entity.type !== "text" && entity.type !== "dimension")).map((entity) => <Entity3D key={`${level}-${entity.id}`} entity={entity} factor={factor} color={document.layers.find((layer) => layer.id === entity.layerId)?.color ?? "#64748b"} theme={theme} entities={visibleEntities} />)}
          {/* Continuous horizontal facade bands make each storey legible in the massing view. */}
          <mesh position={[center[0], 3.02, bounds.minZ - 0.045]} castShadow><boxGeometry args={[width + 0.18, 0.12, 0.18]} /><meshStandardMaterial color="#d6dde6" roughness={0.58} /></mesh>
          <mesh position={[center[0], 3.02, bounds.maxZ + 0.045]} castShadow><boxGeometry args={[width + 0.18, 0.12, 0.18]} /><meshStandardMaterial color="#d6dde6" roughness={0.58} /></mesh>
          <mesh position={[bounds.minX - 0.045, 3.02, center[2]]} castShadow><boxGeometry args={[0.18, 0.12, depth + 0.18]} /><meshStandardMaterial color="#d6dde6" roughness={0.58} /></mesh>
          <mesh position={[bounds.maxX + 0.045, 3.02, center[2]]} castShadow><boxGeometry args={[0.18, 0.12, depth + 0.18]} /><meshStandardMaterial color="#d6dde6" roughness={0.58} /></mesh>
          {/* Slim corner fins add depth without inventing balcony or structural elements. */}
          {[
            [bounds.minX - 0.035, 1.5, bounds.minZ - 0.035],
            [bounds.minX - 0.035, 1.5, bounds.maxZ + 0.035],
            [bounds.maxX + 0.035, 1.5, bounds.minZ - 0.035],
            [bounds.maxX + 0.035, 1.5, bounds.maxZ + 0.035],
          ].map((position, index) => <mesh key={`facade-fin-${level}-${index}`} position={position as [number, number, number]} castShadow>
            <boxGeometry args={[0.14, 3.0, 0.14]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.16} roughness={0.42} />
          </mesh>)}
        </group>)}
        {/* Flat roof slab with a low parapet gives the generated massing a clear top-floor silhouette. */}
        <mesh position={[center[0], levels * 3.2 + 0.04, center[2]]} castShadow receiveShadow>
          <boxGeometry args={[width + 0.36, 0.18, depth + 0.36]} />
          <meshStandardMaterial color={theme.roof} roughness={0.78} />
        </mesh>
        {[
          { position: [center[0], levels * 3.2 + 0.43, bounds.minZ - 0.12] as [number, number, number], size: [width + 0.36, 0.62, 0.16] as [number, number, number] },
          { position: [center[0], levels * 3.2 + 0.43, bounds.maxZ + 0.12] as [number, number, number], size: [width + 0.36, 0.62, 0.16] as [number, number, number] },
          { position: [bounds.minX - 0.12, levels * 3.2 + 0.43, center[2]] as [number, number, number], size: [0.16, 0.62, depth + 0.36] as [number, number, number] },
          { position: [bounds.maxX + 0.12, levels * 3.2 + 0.43, center[2]] as [number, number, number], size: [0.16, 0.62, depth + 0.36] as [number, number, number] },
        ].map((edge, index) => (
          <mesh key={`roof-parapet-${index}`} position={edge.position} castShadow receiveShadow>
            <boxGeometry args={edge.size} />
            <meshStandardMaterial color={theme.trim} roughness={0.82} />
          </mesh>
        ))}
      </group>
      <OrbitControls makeDefault target={[0, modelHeight / 2, 0]} enableDamping dampingFactor={0.1} minDistance={2} maxDistance={radius * 16} />
    </Canvas>
    <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-white/70 bg-white/90 px-3 py-2 shadow-md backdrop-blur">
      <label htmlFor="indocad-material-theme" className="text-[11px] font-medium text-slate-600">Exterior finish</label>
      <select id="indocad-material-theme" value={themeId} onChange={(event) => setThemeId(event.target.value as MaterialThemeId)} className="max-w-[145px] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500">
        {Object.entries(MATERIAL_THEMES).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
      </select>
    </div>
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-white/70 bg-white/85 px-3 py-2 text-[11px] text-slate-600 shadow-sm backdrop-blur">
      <b className="text-slate-800">Architectural 3D massing</b><span className="mx-2">·</span>{levels} floor(s)<span className="mx-2">·</span>{visibleEntities.length} visible objects<span className="mx-2">·</span>{document.units}
      <p className="mt-0.5 text-[10px] text-slate-500">Concept preview, not a construction-ready facade · drag to orbit · scroll to zoom · right-drag to pan</p>
    </div>
    {!visibleEntities.length && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="rounded-xl bg-white/90 px-5 py-4 text-center shadow"><p className="text-sm font-semibold text-slate-800">Your 3D model will appear here</p><p className="mt-1 text-xs text-slate-500">Draw walls, columns, doors or furniture in 2D to build the model.</p></div></div>}
  </div>;
}
