import { useCloudState } from "@/lib/cloudState";
import { Suspense, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Edges } from "@react-three/drei";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Box, Camera, LayoutGrid } from "lucide-react";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_INPUT, generatePlan, type PlanInput, type Room } from "@/lib/planGenerator";

const FT = 0.3048;
const FLOOR_H = 10 * FT;
const FINISHES = {
  white: { en: "White plaster", bn: "সাদা প্লাস্টার", wall: "#f1f5f9", floor: "#cbd5e1" },
  brick: { en: "Exposed brick", bn: "ইটের দেয়াল", wall: "#b45a3c", floor: "#a8a29e" },
  concrete: { en: "Fair-face concrete", bn: "কংক্রিট", wall: "#9ca3af", floor: "#6b7280" },
  wood: { en: "Warm wood", bn: "কাঠের ফিনিশ", wall: "#e7d3b5", floor: "#a16207" },
} as const;
type FinishKey = keyof typeof FINISHES;
const FURN: Record<string, { w: number; d: number; h: number; c: string }> = {
  Bed: { w: 6, d: 6.5, h: 1.8, c: "#60a5fa" }, Drawing: { w: 7, d: 3, h: 2.6, c: "#f97316" },
  Dining: { w: 5, d: 3, h: 2.5, c: "#a16207" }, Kitchen: { w: 2, d: 6, h: 3, c: "#64748b" },
  Bath: { w: 2, d: 1.5, h: 1.5, c: "#e2e8f0" },
};

function RoomMesh({ r, ox, oz, y, fin, showFurniture, bn, cutaway, showOpenings }: { r: Room; ox: number; oz: number; y: number; fin: FinishKey; showFurniture: boolean; bn: boolean; cutaway: boolean; showOpenings: boolean }) {
  const w = r.w * FT, d = r.h * FT, cx = ox + (r.x + r.w / 2) * FT, cz = oz - (r.y + r.h / 2) * FT;
  const t = 0.12, wallH = FLOOR_H - 0.15, f = FINISHES[fin];
  const key = Object.keys(FURN).find((k) => r.name.includes(k));
  const fu = key ? FURN[key] : null;
  const hasWindow = !/bath|toilet|store|corridor|stair/i.test(r.name);
  const doorW = Math.min(3 * FT, w * 0.42);
  const doorH = Math.min(6.8 * FT, wallH * 0.78);
  const windowW = Math.min(4 * FT, w * 0.55);
  const windowH = Math.min(3.2 * FT, wallH * 0.38);
  const windowSill = Math.min(3.2 * FT, wallH - windowH - 0.1);
  // Segment tuple: center X, center Y above floor, center Z, width, height, depth.
  const walls: [number, number, number, number, number, number][] = [];
  const addWall = (x: number, cy: number, z: number, ww: number, hh: number, dd: number) => {
    if (ww > 0.025 && hh > 0.025) walls.push([x, cy, z, ww, hh, dd]);
  };
  if (!showOpenings) {
    addWall(cx, wallH / 2 + 0.1, cz - d / 2, w, wallH, t);
    addWall(cx, wallH / 2 + 0.1, cz + d / 2, w, wallH, t);
  } else {
    const doorSideW = Math.max(0, (w - doorW) / 2);
    addWall(cx - doorW / 2 - doorSideW / 2, wallH / 2 + 0.1, cz + d / 2, doorSideW, wallH, t);
    addWall(cx + doorW / 2 + doorSideW / 2, wallH / 2 + 0.1, cz + d / 2, doorSideW, wallH, t);
    addWall(cx, doorH + (wallH - doorH) / 2 + 0.1, cz + d / 2, doorW, wallH - doorH, t);
    if (hasWindow) {
      const windowSideW = Math.max(0, (w - windowW) / 2);
      addWall(cx - windowW / 2 - windowSideW / 2, wallH / 2 + 0.1, cz - d / 2, windowSideW, wallH, t);
      addWall(cx + windowW / 2 + windowSideW / 2, wallH / 2 + 0.1, cz - d / 2, windowSideW, wallH, t);
      addWall(cx, windowSill / 2 + 0.1, cz - d / 2, windowW, windowSill, t);
      const upperH = Math.max(0, wallH - windowSill - windowH);
      addWall(cx, windowSill + windowH + upperH / 2 + 0.1, cz - d / 2, windowW, upperH, t);
    } else {
      addWall(cx, wallH / 2 + 0.1, cz - d / 2, w, wallH, t);
    }
  }
  addWall(cx - w / 2, wallH / 2 + 0.1, cz, t, wallH, d);
  addWall(cx + w / 2, wallH / 2 + 0.1, cz, t, wallH, d);
  return (
    <group>
      <mesh position={[cx, y + 0.05, cz]} receiveShadow>
        <boxGeometry args={[w, 0.1, d]} /><meshStandardMaterial color={f.floor} />
      </mesh>
      {walls.map(([x, cy, z, ww, hh, dd], i) => (
        <mesh key={i} position={[x, y + cy, z]} castShadow>
          <boxGeometry args={[ww, hh, dd]} /><meshStandardMaterial color={f.wall} transparent opacity={cutaway ? 0.22 : 0.85} depthWrite={!cutaway} />
          <Edges color="#0f172a" />
        </mesh>
      ))}
      {showOpenings && (
        <group>
          {/* Door leaf sits inside the wall gap. */}
          <mesh position={[cx, y + 0.1 + doorH / 2, cz + d / 2 + 0.012]}>
            <boxGeometry args={[doorW * 0.92, doorH * 0.96, 0.035]} />
            <meshStandardMaterial color="#8b5e3c" roughness={0.72} />
          </mesh>
          <mesh position={[cx, y + 0.1 + doorH / 2, cz + d / 2 + 0.034]}>
            <boxGeometry args={[doorW * 0.86, doorH * 0.91, 0.012]} />
            <meshStandardMaterial color="#b8895d" roughness={0.68} />
          </mesh>
          <mesh position={[cx + Math.min(1.1 * FT, doorW * 0.35), y + 0.1 + doorH / 2, cz + d / 2 + 0.045]}>
            <sphereGeometry args={[0.025, 10, 8]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.65} roughness={0.3} />
          </mesh>
          {hasWindow && (
            <group>
              {/* Blue glazed window, outer frame, and two simple mullions. */}
              <mesh position={[cx, y + 0.1 + windowSill + windowH / 2, cz - d / 2 - 0.014]}>
                <boxGeometry args={[windowW * 1.04, windowH * 1.04, 0.035]} />
                <meshStandardMaterial color="#475569" roughness={0.5} />
              </mesh>
              <mesh position={[cx, y + 0.1 + windowSill + windowH / 2, cz - d / 2 - 0.037]}>
                <boxGeometry args={[windowW * 0.91, windowH * 0.87, 0.012]} />
                <meshStandardMaterial color="#7dd3fc" metalness={0.15} roughness={0.2} />
              </mesh>
              <mesh position={[cx, y + 0.1 + windowSill + windowH / 2, cz - d / 2 - 0.045]}>
                <boxGeometry args={[0.025, windowH * 0.94, 0.014]} />
                <meshStandardMaterial color="#475569" />
              </mesh>
              <mesh position={[cx, y + 0.1 + windowSill + windowH / 2, cz - d / 2 - 0.045]}>
                <boxGeometry args={[windowW * 0.9, 0.025, 0.014]} />
                <meshStandardMaterial color="#475569" />
              </mesh>
            </group>
          )}
        </group>
      )}
      {showFurniture && fu && (
        <mesh position={[cx, y + 0.1 + (fu.h * FT) / 2, cz]}>
          <boxGeometry args={[Math.min(fu.w * FT, w * 0.7), fu.h * FT, Math.min(fu.d * FT, d * 0.7)]} />
          <meshStandardMaterial color={fu.c} />
        </mesh>
      )}
      <Text position={[cx, y + wallH + 0.4, cz]} fontSize={0.35} color="#0f172a" anchorX="center" outlineWidth={0.02} outlineColor="#ffffff">
        {bn ? r.nameBn : r.name}
      </Text>
    </group>
  );
}

function StructuralFrame({ width, depth, floors }: { width: number; depth: number; floors: number }) {
  // This is a conceptual visualization grid, not a structural design or reinforcement layout.
  // Add intermediate bays for larger plans so the frame does not remain a fixed 3x3 grid.
  const maxBayFt = 12;
  const xBays = Math.max(1, Math.min(8, Math.ceil(width / maxBayFt)));
  const zBays = Math.max(1, Math.min(8, Math.ceil(depth / maxBayFt)));
  const xs = Array.from({ length: xBays + 1 }, (_, i) => (-width / 2 + (width * i) / xBays) * FT);
  const zs = Array.from({ length: zBays + 1 }, (_, i) => (-depth / 2 + (depth * i) / zBays) * FT);
  const totalHeight = Math.max(1, floors) * FLOOR_H;
  const columnSize = 0.18;
  const beamSize = 0.16;
  const levels = Array.from({ length: Math.max(1, floors) }, (_, i) => (i + 1) * FLOOR_H);

  return (
    <group>
      {xs.flatMap((x) => zs.map((z) => (
        <mesh key={`column-${x.toFixed(3)}-${z.toFixed(3)}`} position={[x, totalHeight / 2, z]} castShadow>
          <boxGeometry args={[columnSize, totalHeight, columnSize]} />
          <meshStandardMaterial color="#64748b" metalness={0.25} roughness={0.55} />
        </mesh>
      )))}
      {levels.map((y) => (
        <group key={`beam-level-${y}`}>
          {zs.flatMap((z) => xs.slice(0, -1).map((x, i) => {
            const nextX = xs[i + 1];
            return (
              <mesh key={`x-${z.toFixed(3)}-${i}`} position={[(x + nextX) / 2, y, z]} castShadow>
                <boxGeometry args={[nextX - x, beamSize, beamSize]} />
                <meshStandardMaterial color="#ea580c" metalness={0.15} roughness={0.6} />
              </mesh>
            );
          }))}
          {xs.flatMap((x) => zs.slice(0, -1).map((z, i) => {
            const nextZ = zs[i + 1];
            return (
              <mesh key={`z-${x.toFixed(3)}-${i}`} position={[x, y, (z + nextZ) / 2]} castShadow>
                <boxGeometry args={[beamSize, beamSize, nextZ - z]} />
                <meshStandardMaterial color="#ea580c" metalness={0.15} roughness={0.6} />
              </mesh>
            );
          }))}
        </group>
      ))}
    </group>
  );
}

function ModelDimensions({ width, depth, floors }: { width: number; depth: number; floors: number }) {
  const w = width * FT;
  const d = depth * FT;
  const h = floors * FLOOR_H;
  const offset = 0.65;
  const line = 0.025;
  return (
    <group>
      <mesh position={[0, 0.04, d / 2 + offset]}><boxGeometry args={[w, line, line]} /><meshBasicMaterial color="#2563eb" /></mesh>
      <mesh position={[0, 0.04, -d / 2 - offset]}><boxGeometry args={[w, line, line]} /><meshBasicMaterial color="#2563eb" /></mesh>
      <mesh position={[w / 2 + offset, 0.04, 0]}><boxGeometry args={[line, line, d]} /><meshBasicMaterial color="#0891b2" /></mesh>
      <mesh position={[-w / 2 - offset, 0.04, 0]}><boxGeometry args={[line, line, d]} /><meshBasicMaterial color="#0891b2" /></mesh>
      <Text position={[0, 0.18, d / 2 + offset]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.22} color="#1d4ed8" anchorX="center">{width.toFixed(1)} ft</Text>
      <Text position={[w / 2 + offset, 0.18, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={0.22} color="#0e7490" anchorX="center">{depth.toFixed(1)} ft</Text>
      <mesh position={[w / 2 + offset, h / 2, -d / 2 - offset]}><boxGeometry args={[line, h, line]} /><meshBasicMaterial color="#16a34a" /></mesh>
      <Text position={[w / 2 + offset, h / 2, -d / 2 - offset - 0.18]} fontSize={0.22} color="#15803d" anchorX="center">{(h / FT).toFixed(1)} ft</Text>
    </group>
  );
}

function CameraRig({ view, size }: { view: string; size: number }) {
  const { camera } = useThree();
  const last = useRef("");
  if (last.current !== view) {
    last.current = view;
    const d = size * (camera instanceof Object && (camera as any).aspect < 1 ? 3.2 : 2.2);
    const pos: Record<string, [number, number, number]> = { iso: [d, d, d], top: [0, d * 1.6, 0.01], front: [0, d * 0.4, d * 1.3], side: [d * 1.3, d * 0.4, 0] };
    camera.position.set(...pos[view]);
    camera.lookAt(0, 0, 0);
  }
  return null;
}

export default function BimStudioPage() {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const L = (en: string, b: string) => (bn ? b : en);
  const [inp] = useCloudState<PlanInput>("civilos.plan", DEFAULT_INPUT, { merge: true });
  const plan = useMemo(() => generatePlan(inp), [inp]);
  const [shown, setShown] = useState(Math.min(inp.floors, 3));
  const [fin, setFin] = useState<FinishKey>("white");
  const [furniture, setFurniture] = useState(true);
  const [view, setView] = useState("iso");
  const [showStructure, setShowStructure] = useState(false);
  const [showRoof, setShowRoof] = useState(true);
  const [showDimensions, setShowDimensions] = useState(false);
  const [cutaway, setCutaway] = useState(false);
  const [showOpenings, setShowOpenings] = useState(true);
  const ox = -(plan.buildW * FT) / 2, oz = (plan.buildD * FT) / 2;
  const size = Math.max(plan.buildW, plan.buildD) * FT;

  const snapshot = () => {
    const c = document.querySelector<HTMLCanvasElement>("#bim-canvas canvas");
    if (!c) return;
    const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = "civilos-bim.png"; a.click();
  };

  return (
    <SidebarProvider>
      <SEO title="BIM Studio 3D — CivilOS AI" description="3D model of your generated floor plan with finishes, furniture and camera presets." />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center justify-between px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
            <div className="flex items-center gap-2"><SidebarTrigger />
              <h1 className="font-heading font-semibold flex items-center gap-2"><Box className="h-4 w-4 text-accent" /> BIM Studio 3D</h1>
            </div>
            <ThemeToggle />
          </header>
          <main className="p-4 md:p-6 grid lg:grid-cols-[300px_1fr] gap-5">
            <Card className="p-4 space-y-5 h-fit">
              <p className="text-sm text-muted-foreground">
                {L("Model built from your plan", "আপনার প্ল্যান থেকে মডেল")}: {inp.plotWidth}'×{inp.plotDepth}', {inp.bedrooms} {L("bed", "বেড")}, {inp.floors} {L("floors", "তলা")}
              </p>
              <Button variant="outline" size="sm" className="w-full" asChild><Link to="/plan-generator"><LayoutGrid className="h-4 w-4 mr-1" /> {L("Edit plan", "প্ল্যান বদলান")}</Link></Button>
              <div className="space-y-2">
                <Label className="text-xs">{L("Floors shown", "দেখানো তলা")}: {shown} / {inp.floors}</Label>
                <Slider min={1} max={inp.floors} step={1} value={[shown]} onValueChange={([v]) => setShown(v)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{L("Finish", "ফিনিশ")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(FINISHES) as FinishKey[]).map((k) => (
                    <Button key={k} size="sm" variant={fin === k ? "default" : "outline"} onClick={() => setFin(k)} className="text-xs">
                      {bn ? FINISHES[k].bn : FINISHES[k].en}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{L("Camera", "ক্যামেরা")}</Label>
                <div className="grid grid-cols-4 gap-1">
                  {[["iso", "3D"], ["top", L("Top", "উপর")], ["front", L("Front", "সামনে")], ["side", L("Side", "পাশে")]].map(([v, l]) => (
                    <Button key={v} size="sm" variant={view === v ? "default" : "outline"} className="text-xs px-1" onClick={() => setView(v)}>{l}</Button>
                  ))}
                </div>
              </div>
              <Button size="sm" variant={furniture ? "default" : "outline"} className="w-full" onClick={() => setFurniture(!furniture)}>
                {furniture ? L("Hide furniture", "ফার্নিচার লুকান") : L("Show furniture", "ফার্নিচার দেখান")}
              </Button>
              <div className="space-y-2 border-t pt-3">
                <Label className="text-xs">{L("Model layers", "মডেল লেয়ার")}</Label>
                <Button size="sm" variant={showStructure ? "default" : "outline"} className="w-full" onClick={() => setShowStructure(!showStructure)}>
                  {showStructure ? L("Hide structural frame", "স্ট্রাকচার লুকান") : L("Show columns & beams", "কলাম ও বিম দেখান")}
                </Button>
                <Button size="sm" variant={cutaway ? "default" : "outline"} className="w-full" onClick={() => setCutaway(!cutaway)}>
                  {cutaway ? L("Restore solid walls", "দেয়াল স্বাভাবিক করুন") : L("Cutaway / transparent walls", "স্বচ্ছ দেয়াল")}
                </Button>
                <Button size="sm" variant={showRoof ? "default" : "outline"} className="w-full" onClick={() => setShowRoof(!showRoof)}>
                  {showRoof ? L("Hide roof slab", "ছাদের স্ল্যাব লুকান") : L("Show roof slab", "ছাদের স্ল্যাব দেখান")}
                </Button>
                <Button size="sm" variant={showOpenings ? "default" : "outline"} className="w-full" onClick={() => setShowOpenings(!showOpenings)}>
                  {showOpenings ? L("Hide doors & windows", "দরজা-জানালা লুকান") : L("Show doors & windows", "দরজা-জানালা দেখান")}
                </Button>
                <Button size="sm" variant={showDimensions ? "default" : "outline"} className="w-full" onClick={() => setShowDimensions(!showDimensions)}>
                  {showDimensions ? L("Hide dimensions", "মাপ লুকান") : L("Show dimensions", "মাপ দেখান")}
                </Button>
              </div>
              <Button size="sm" variant="secondary" className="w-full" onClick={snapshot}><Camera className="h-4 w-4 mr-1" /> {L("Save image", "ছবি সংরক্ষণ")}</Button>
            </Card>
            <Card id="bim-canvas" className="relative h-[60vh] lg:h-[calc(100vh-8rem)] overflow-hidden bg-muted/40">
              <Canvas shadows camera={{ fov: 45, position: [size, size, size] }} gl={{ preserveDrawingBuffer: true }}>
                <ambientLight intensity={0.6} />
                <directionalLight position={[10, 20, 10]} intensity={1.1} castShadow />
                <Suspense fallback={null}>
                  <CameraRig view={view} size={size} />
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, (plan.setbacks.front - plan.setbacks.rear) * FT / 2]} receiveShadow>
                    <planeGeometry args={[inp.plotWidth * FT, inp.plotDepth * FT]} />
                    <meshStandardMaterial color="#86efac" />
                  </mesh>
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, oz + plan.setbacks.front * FT + 1.5]}>
                    <planeGeometry args={[inp.plotWidth * FT * 1.4, 3]} />
                    <meshStandardMaterial color="#334155" />
                  </mesh>
                  {Array.from({ length: shown }).map((_, f) =>
                    plan.rooms.map((r) => (
                      <RoomMesh key={`${f}-${r.name}`} r={r} ox={ox} oz={oz} y={f * FLOOR_H} fin={fin} showFurniture={furniture && f === shown - 1} bn={bn && f === shown - 1} cutaway={cutaway} showOpenings={showOpenings} />
                    )),
                  )}
                  {showStructure && <StructuralFrame width={plan.buildW} depth={plan.buildD} floors={shown} />}
                  {showDimensions && <ModelDimensions width={plan.buildW} depth={plan.buildD} floors={shown} />}
                  {showRoof && (
                    <mesh position={[0, shown * FLOOR_H + 0.08, 0]} castShadow receiveShadow>
                      <boxGeometry args={[plan.buildW * FT + 0.2, 0.16, plan.buildD * FT + 0.2]} />
                      <meshStandardMaterial color={fin === "wood" ? "#a16207" : fin === "brick" ? "#9f4a32" : "#94a3b8"} roughness={0.78} />
                      <Edges color="#334155" />
                    </mesh>
                  )}
                </Suspense>
                <OrbitControls makeDefault target={[0, 0, 0]} />
              </Canvas>
              <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 rounded-lg border border-amber-300/70 bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {L("Conceptual 3D visualization — not construction documentation", "ধারণাভিত্তিক 3D মডেল — নির্মাণের নকশা নয়")}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {L("Openings, furniture and the structural frame are illustrative. Verify dimensions, loads, reinforcement and code compliance with a qualified engineer before construction.", "দরজা-জানালা, ফার্নিচার ও স্ট্রাকচারাল ফ্রেম শুধু প্রদর্শনের জন্য। নির্মাণের আগে যোগ্য প্রকৌশলীর মাধ্যমে মাপ, লোড, রডের নকশা ও বিধিমালা যাচাই করুন।")}
                </p>
              </div>
            </Card>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
