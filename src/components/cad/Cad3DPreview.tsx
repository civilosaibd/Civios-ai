import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, Line, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import type { CadDocument, CadEntity, Point2D } from "@/lib/cad2d/geometry";

const unitToMetres: Record<CadDocument["units"], number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };
const DEFAULT_WALL_HEIGHT = 3;
const point3 = (p: Point2D, factor: number, y = 0): [number, number, number] => [p.x * factor, y, -p.y * factor];

function Entity3D({ entity, color, factor }: { entity: CadEntity; color: string; factor: number }) {
  const height = DEFAULT_WALL_HEIGHT;
  if (entity.type === "wall") {
    const dx = (entity.end.x - entity.start.x) * factor;
    const dy = (entity.end.y - entity.start.y) * factor;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return null;
    const center: [number, number, number] = [(entity.start.x + entity.end.x) * factor / 2, height / 2, -(entity.start.y + entity.end.y) * factor / 2];
    return <mesh position={center} rotation={[0, Math.atan2(dy, dx), 0]} castShadow receiveShadow>
      <boxGeometry args={[length, height, Math.max(0.04, entity.thickness * factor)]} />
      <meshStandardMaterial color={color} roughness={0.82} />
    </mesh>;
  }
  if (entity.type === "column") {
    return <mesh position={point3(entity.at, factor, height / 2)} rotation={[0, -entity.rotation, 0]} castShadow receiveShadow>
      <boxGeometry args={[Math.max(0.08, entity.width * factor), height, Math.max(0.08, entity.depth * factor)]} />
      <meshStandardMaterial color={color} roughness={0.72} />
    </mesh>;
  }
  if (entity.type === "door") {
    return <group position={point3(entity.at, factor)} rotation={[0, -entity.rotation, 0]}>
      <mesh position={[entity.width * factor / 2, 1.05, 0]} castShadow><boxGeometry args={[Math.max(0.04, entity.width * factor), 2.1, 0.07]} /><meshStandardMaterial color="#b77942" roughness={0.6} /></mesh>
      <mesh position={[entity.width * factor / 2, 2.12, 0]}><boxGeometry args={[entity.width * factor + 0.12, 0.08, 0.14]} /><meshStandardMaterial color="#e6c79e" /></mesh>
    </group>;
  }
  if (entity.type === "window") {
    return <group position={point3(entity.at, factor)} rotation={[0, -entity.rotation, 0]}>
      <mesh position={[entity.width * factor / 2, 1.35, 0]}><boxGeometry args={[Math.max(0.04, entity.width * factor), 1.1, 0.08]} /><meshStandardMaterial color="#60a5fa" metalness={0.12} roughness={0.18} transparent opacity={0.72} /></mesh>
      <mesh position={[entity.width * factor / 2, 1.35, 0.06]}><boxGeometry args={[0.045, 1.1, 0.04]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
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
  const levels = Math.max(1, Math.min(20, Math.round(floorCount)));
  const factor = unitToMetres[document.units];
  const visibleEntities = useMemo(() => document.entities.filter((entity) => document.layers.find((layer) => layer.id === entity.layerId)?.visible !== false), [document]);
  const bounds = useMemo(() => {
    if (!visibleEntities.length) return { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
    const points: Point2D[] = [];
    visibleEntities.forEach((entity) => {
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
  const radius = Math.max(width, depth, 3);
  return <div className="relative min-h-[360px] w-full flex-1 bg-slate-100" data-testid="indocad-3d-preview">
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [radius * 1.35, radius * 1.1, radius * 1.35], fov: 42, near: 0.1, far: radius * 30 }}>
      <color attach="background" args={["#eaf0f7"]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={["#ffffff", "#64748b", 0.55]} />
      <directionalLight position={[width, radius * 2, depth]} intensity={1.35} castShadow shadow-mapSize={[2048, 2048]} />
      <group position={[-center[0], 0, -center[2]]}>
        <mesh rotation-x={-Math.PI / 2} position={[center[0], -0.08, center[2]]} receiveShadow>
          <planeGeometry args={[width + radius * 1.5, depth + radius * 1.5]} />
          <meshStandardMaterial color="#dce5ed" roughness={0.95} />
        </mesh>
        <Grid position={[center[0], -0.065, center[2]]} args={[width + radius * 1.5, depth + radius * 1.5]} cellSize={1} sectionSize={5} fadeDistance={radius * 4} infiniteGrid={false} />
        {Array.from({ length: levels }, (_, level) => <group key={`floor-${level}`} position={[0, level * 3.2, 0]}>
          {level > 0 && <mesh position={[center[0], -0.025, center[2]]} receiveShadow><boxGeometry args={[width, 0.12, depth]} /><meshStandardMaterial color="#cbd5e1" roughness={0.85} /></mesh>}
          {visibleEntities.filter((entity) => level === 0 || (entity.type !== "text" && entity.type !== "dimension")).map((entity) => <Entity3D key={`${level}-${entity.id}`} entity={entity} factor={factor} color={document.layers.find((layer) => layer.id === entity.layerId)?.color ?? "#64748b"} />)}
        </group>)}
        {levels > 1 && <mesh position={[center[0], levels * 3.2 - 0.02, center[2]]} receiveShadow><boxGeometry args={[width, 0.14, depth]} /><meshStandardMaterial color="#94a3b8" roughness={0.8} /></mesh>}
      </group>
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} minDistance={2} maxDistance={radius * 12} />
    </Canvas>
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-white/70 bg-white/85 px-3 py-2 text-[11px] text-slate-600 shadow-sm backdrop-blur">
      <b className="text-slate-800">Live 3D preview</b><span className="mx-2">·</span>{levels} floor(s)<span className="mx-2">·</span>{visibleEntities.length} visible objects<span className="mx-2">·</span>{document.units}
      <p className="mt-0.5 text-[10px] text-slate-500">Drag to orbit · scroll to zoom · right-drag to pan</p>
    </div>
    {!visibleEntities.length && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="rounded-xl bg-white/90 px-5 py-4 text-center shadow"><p className="text-sm font-semibold text-slate-800">Your 3D model will appear here</p><p className="mt-1 text-xs text-slate-500">Draw walls, columns, doors or furniture in 2D to build the model.</p></div></div>}
  </div>;
}
