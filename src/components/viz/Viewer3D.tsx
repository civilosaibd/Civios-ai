import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { Camera, Download, Maximize2, Minimize2, Ruler, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildScene, type Kind } from "@/lib/viz/geometry";
import { formatLength } from "@/lib/viz/units";
import type { BuildingModel } from "@/lib/viz/types";
import { Disclaimer, useL } from "./bits";

type Layer = Kind | "labels" | "ground";
const LAYERS: { key: Layer; en: string; bn: string }[] = [
  { key: "wall", en: "Walls", bn: "দেয়াল" }, { key: "slab", en: "Slabs", bn: "স্ল্যাব" }, { key: "column", en: "Columns", bn: "কলাম" },
  { key: "beam", en: "Beams", bn: "বিম" }, { key: "door", en: "Doors", bn: "দরজা" }, { key: "window", en: "Windows", bn: "জানালা" },
  { key: "stair", en: "Stairs", bn: "সিঁড়ি" }, { key: "balcony", en: "Balcony", bn: "বারান্দা" }, { key: "roof", en: "Roof", bn: "ছাদ" },
  { key: "parapet", en: "Parapet", bn: "প্যারাপেট" }, { key: "footing", en: "Footings", bn: "ফুটিং" }, { key: "plinth", en: "Plinth", bn: "প্লিন্থ" },
  { key: "labels", en: "Room labels", bn: "রুমের নাম" }, { key: "ground", en: "Ground", bn: "মাটি" },
];
const STRUCTURAL = new Set<string>(["column", "beam", "slab", "footing", "plinth", "stair"]);
type Preset = "iso" | "top" | "front" | "back" | "left" | "right";
const PRESETS: Preset[] = ["iso", "top", "front", "back", "left", "right"];

interface Opts {
  layers: Record<Layer, boolean>; wireframe: boolean; transparent: boolean; night: boolean; structural: boolean; exploded: boolean;
  floorIso: number | null; section: boolean; axis: "y" | "x" | "z"; sectionPos: number; measure: boolean;
}
const initialOpts = (): Opts => ({
  layers: Object.fromEntries(LAYERS.map((l) => [l.key, true])) as Record<Layer, boolean>,
  wireframe: false, transparent: false, night: false, structural: false, exploded: false, floorIso: null, section: false, axis: "y", sectionPos: 0.6, measure: false,
});
interface Measurement { a: THREE.Vector3; b: THREE.Vector3; d: number; derived: boolean }

type MatState = { opacity: number; transparent: boolean; depthWrite: boolean };

function Controller({ built, model, opts, preset, measures, onPoint, glRef }: {
  built: ReturnType<typeof buildScene>; model: BuildingModel; opts: Opts; preset: { p: Preset; n: number };
  measures: Measurement[]; onPoint: (e: ThreeEvent<MouseEvent>) => void; glRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
}) {
  const { gl, camera, scene } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), []);
  const H = model.floorHeight.value;
  const box = useMemo(() => new THREE.Box3().setFromObject(built.root), [built]);

  useEffect(() => { glRef.current = gl; gl.localClippingEnabled = true; }, [gl, glRef]);

  // layer / structural / floor isolation / explode
  useEffect(() => {
    built.root.traverse((o) => {
      const k = (o as THREE.Mesh).isMesh ? (o.userData.kind as Layer | undefined) : undefined;
      if (k) o.visible = opts.structural ? STRUCTURAL.has(k) : opts.layers[k] !== false;
    });
    built.floorGroups.forEach((g, i) => {
      g.visible = opts.floorIso === null || i === opts.floorIso;
      g.position.y = opts.exploded ? (i + 1) * H * 0.9 : 0;
    });
    built.foundation.visible = opts.floorIso === null || opts.floorIso === 0;
    built.foundation.position.y = opts.exploded ? 0 : 0;
  }, [built, opts.layers, opts.structural, opts.floorIso, opts.exploded, H]);

  // wireframe / transparency
  useEffect(() => {
    const seen = new Set<THREE.Material>();
    built.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m || seen.has(m)) return; seen.add(m);
      const s = (m.userData.orig ??= { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite }) as MatState;
      m.wireframe = opts.wireframe;
      m.transparent = opts.transparent || s.transparent;
      m.opacity = opts.transparent ? Math.min(s.opacity, 0.28) : s.opacity;
      m.depthWrite = opts.transparent ? false : s.depthWrite;
      m.needsUpdate = true;
    });
  }, [built, opts.wireframe, opts.transparent]);

  // section / cut-away (clipping plane through the whole model)
  useEffect(() => {
    const n = opts.axis === "y" ? new THREE.Vector3(0, -1, 0) : opts.axis === "x" ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, -1);
    const lo = box.min[opts.axis], hi = box.max[opts.axis];
    plane.normal.copy(n); plane.constant = lo + (hi - lo) * opts.sectionPos;
    const seen = new Set<THREE.Material>();
    built.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m || seen.has(m)) return; seen.add(m);
      m.clippingPlanes = opts.section ? [plane] : []; m.side = opts.section ? THREE.DoubleSide : (m.userData.side ??= m.side); m.needsUpdate = true;
    });
  }, [built, box, plane, opts.section, opts.axis, opts.sectionPos]);

  // camera presets
  useEffect(() => {
    const c = built.center.clone(), r = Math.max(built.size.w, built.size.d, built.size.h) * 2.3 + 4;
    const dir: Record<Preset, [number, number, number]> = { iso: [1, 0.75, 1], top: [0.001, 1.9, 0.001], front: [0, 0.35, 1.5], back: [0, 0.35, -1.5], left: [-1.5, 0.35, 0], right: [1.5, 0.35, 0] };
    const d = new THREE.Vector3(...dir[preset.p]).normalize().multiplyScalar(r);
    camera.position.copy(c.clone().add(d)); camera.near = 0.1; camera.far = r * 20; camera.updateProjectionMatrix();
    if (controls.current) { controls.current.target.copy(c); controls.current.update(); } else camera.lookAt(c);
  }, [preset, built, camera]);

  useEffect(() => { scene.background = new THREE.Color(opts.night ? "#0b1220" : "#e8eef7"); }, [scene, opts.night]);

  return (
    <>
      <ambientLight intensity={opts.night ? 0.18 : 0.55} />
      <hemisphereLight args={[opts.night ? "#1e3a8a" : "#ffffff", "#6b7280", opts.night ? 0.25 : 0.45]} />
      <directionalLight position={[20, 30, 15]} intensity={opts.night ? 0.25 : 1.15} castShadow shadow-mapSize={[2048, 2048]} color={opts.night ? "#93c5fd" : "#fff7ed"} />
      {opts.night && <pointLight position={[built.center.x, built.size.h * 0.6, built.center.z]} intensity={20} distance={built.size.w * 3} color="#fde68a" />}
      <primitive object={built.root} onClick={onPoint} />
      {opts.layers.ground && !opts.structural && (
        <mesh rotation-x={-Math.PI / 2} position={[built.center.x, -model.slabThickness - 0.01, built.center.z]} receiveShadow>
          <planeGeometry args={[Math.max(built.size.w, built.size.d) * 6, Math.max(built.size.w, built.size.d) * 6]} />
          <meshStandardMaterial color={opts.night ? "#111827" : "#cfd8c4"} roughness={1} />
        </mesh>
      )}
      <gridHelper args={[Math.max(built.size.w, built.size.d) * 6, 60, "#94a3b8", "#cbd5e1"]} position={[built.center.x, -model.slabThickness - 0.02, built.center.z]} />
      {opts.layers.labels && !opts.structural && opts.floorIso !== 1 && built.labels.map((l, i) => (
        <Html key={i} position={l.position} center distanceFactor={14} zIndexRange={[5, 0]}>
          <span className="px-1.5 py-0.5 rounded bg-background/80 text-[10px] font-medium text-foreground shadow whitespace-nowrap pointer-events-none">{l.text}</span>
        </Html>
      ))}
      {measures.map((m, i) => (
        <group key={i}>
          <Line points={[m.a, m.b]} color="#ef4444" lineWidth={2} />
          {[m.a, m.b].map((p, j) => <mesh key={j} position={p}><sphereGeometry args={[0.12, 12, 12]} /><meshBasicMaterial color="#ef4444" /></mesh>)}
          <Html position={m.a.clone().lerp(m.b, 0.5)} center zIndexRange={[6, 0]}>
            <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-semibold whitespace-nowrap pointer-events-none">
              {formatLength(m.d, model.unitSystem === "imperial" ? "ft" : "m")} · {m.derived ? "ref" : "est."}
            </span>
          </Html>
        </group>
      ))}
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.499} />
    </>
  );
}

export default function Viewer3D({ model, name }: { model: BuildingModel; name?: string }) {
  const L = useL();
  const mobile = useIsMobile();
  const [opts, setOpts] = useState<Opts>(initialOpts);
  const [preset, setPreset] = useState<{ p: Preset; n: number }>({ p: "iso", n: 0 });
  const [measures, setMeasures] = useState<Measurement[]>([]);
  const pending = useRef<THREE.Vector3 | null>(null);
  const [hasFirst, setHasFirst] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const [fs, setFs] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const built = useMemo(() => buildScene(model), [model]);
  useEffect(() => () => { built.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); } }); }, [built]);
  useEffect(() => { const f = () => setFs(!!document.fullscreenElement); document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  useEffect(() => { setMeasures([]); pending.current = null; setHasFirst(false); }, [model]);

  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const setLayer = (k: Layer, v: boolean) => setOpts((o) => ({ ...o, layers: { ...o.layers, [k]: v } }));

  const referenceScale = !model.conceptual && ["dxf", "dimensions", "manual"].includes(model.scale.source);
  const onPoint = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!opts.measure || opts.exploded || e.delta > 4) return;
    e.stopPropagation();
    const p = e.point.clone();
    if (!pending.current) { pending.current = p; setHasFirst(true); return; }
    const a = pending.current; pending.current = null; setHasFirst(false);
    const d = a.distanceTo(p), vertical = Math.abs(p.y - a.y) > d * 0.3;
    const derived = referenceScale && (!vertical || model.floorHeight.basis !== "estimated");
    setMeasures((m) => [...m.slice(-4), { a, b: p, d, derived }]);
  }, [opts.measure, opts.exploded, referenceScale, model.floorHeight.basis]);

  const fullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void wrap.current?.requestFullscreen?.().catch(() => setErr(L("Fullscreen is not available in this browser.", "এই ব্রাউজারে ফুলস্ক্রিন সম্ভব নয়।"))); };
  const download = (blob: Blob, file: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const base = (name || model.name || "model").replace(/[^\w-]+/g, "_");
  const shot = (type: "png" | "jpeg") => {
    const gl = glRef.current; if (!gl) return;
    gl.domElement.toBlob((b) => b && download(b, `${base}.${type === "png" ? "png" : "jpg"}`), `image/${type}`, 0.92);
  };
  const exportAs = async (fmt: "glb" | "obj" | "stl") => {
    try {
      setErr(null);
      if (fmt === "glb") {
        const buf = await new Promise<ArrayBuffer>((res, rej) => new GLTFExporter().parse(built.root, (r) => res(r as ArrayBuffer), rej, { binary: true, onlyVisible: true }));
        download(new Blob([buf], { type: "model/gltf-binary" }), `${base}.glb`);
      } else if (fmt === "obj") download(new Blob([new OBJExporter().parse(built.root)], { type: "text/plain" }), `${base}.obj`);
      else download(new Blob([new STLExporter().parse(built.root, { binary: false }) as string], { type: "model/stl" }), `${base}.stl`);
    } catch (e) { setErr(L("Export failed: ", "এক্সপোর্ট ব্যর্থ: ") + (e instanceof Error ? e.message : "")); }
  };

  const Panel = (
    <div className="space-y-4 text-sm">
      <section className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">{L("View", "ভিউ")}</Label>
        <div className="grid grid-cols-3 gap-1">
          {PRESETS.map((p) => <Button key={p} size="sm" variant={preset.p === p ? "default" : "outline"} className="text-xs px-1 capitalize" onClick={() => setPreset((x) => ({ p, n: x.n + 1 }))}>{p === "iso" ? "3D" : p}</Button>)}
        </div>
      </section>
      <section className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">{L("Display", "ডিসপ্লে")}</Label>
        {([["wireframe", L("Wireframe", "ওয়্যারফ্রেম")], ["transparent", L("Transparent", "স্বচ্ছ")], ["night", L("Night mode", "রাত")], ["structural", L("Structural view", "স্ট্রাকচারাল ভিউ")], ["exploded", L("Exploded floors", "এক্সপ্লোডেড")]] as const).map(([k, label]) => (
          <div key={k} className="flex items-center justify-between"><span>{label}</span><Switch checked={opts[k]} onCheckedChange={(v) => { set(k, v); if (k === "exploded" && v) set("measure", false); }} /></div>
        ))}
      </section>
      <section className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">{L("Floor isolation", "তলা আলাদা")}</Label>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant={opts.floorIso === null ? "default" : "outline"} className="text-xs h-7 px-2" onClick={() => set("floorIso", null)}>{L("All", "সব")}</Button>
          {Array.from({ length: model.floors }, (_, i) => <Button key={i} size="sm" variant={opts.floorIso === i ? "default" : "outline"} className="text-xs h-7 px-2" onClick={() => set("floorIso", i)}>{i === 0 ? L("Ground", "নিচতলা") : `F${i}`}</Button>)}
        </div>
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between"><Label className="text-xs uppercase text-muted-foreground">{L("Section / cut-away", "সেকশন / কাটা")}</Label><Switch checked={opts.section} onCheckedChange={(v) => set("section", v)} /></div>
        {opts.section && (<>
          <div className="grid grid-cols-3 gap-1">{([["y", L("Plan", "প্ল্যান")], ["x", "X"], ["z", "Z"]] as const).map(([a, l]) => <Button key={a} size="sm" variant={opts.axis === a ? "default" : "outline"} className="text-xs h-7" onClick={() => set("axis", a)}>{l}</Button>)}</div>
          <Slider min={0} max={1} step={0.01} value={[opts.sectionPos]} onValueChange={([v]) => set("sectionPos", v)} />
        </>)}
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between"><Label className="text-xs uppercase text-muted-foreground flex items-center gap-1"><Ruler className="h-3 w-3" />{L("Measure", "মাপুন")}</Label><Switch checked={opts.measure} disabled={opts.exploded} onCheckedChange={(v) => { set("measure", v); pending.current = null; setHasFirst(false); }} /></div>
        {opts.measure && <p className="text-[11px] text-muted-foreground">{L("Click two points on the model.", "মডেলের দুটি বিন্দুতে ক্লিক করুন।")}</p>}
        {measures.map((m, i) => (
          <div key={i} className="flex items-center justify-between text-xs rounded border px-2 py-1">
            <span><b>{formatLength(m.d, model.unitSystem === "imperial" ? "ft" : "m")}</b> <span className={m.derived ? "text-emerald-600" : "text-amber-600"}>{m.derived ? L("reference-derived", "রেফারেন্স-ভিত্তিক") : L("AI-estimated", "AI-অনুমান")}</span></span>
          </div>
        ))}
        {measures.length > 0 && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setMeasures([]); pending.current = null; setHasFirst(false); }}><Trash2 className="h-3 w-3 mr-1" />{L("Clear", "মুছুন")}</Button>}
      </section>
      <section className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">{L("Layers", "লেয়ার")}</Label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {LAYERS.map((l) => <label key={l.key} className="flex items-center justify-between gap-2 text-xs"><span>{L(l.en, l.bn)}</span><Switch checked={opts.layers[l.key]} disabled={opts.structural && l.key !== "labels" && l.key !== "ground"} onCheckedChange={(v) => setLayer(l.key, v)} /></label>)}
        </div>
      </section>
    </div>
  );

  return (
    <div ref={wrap} className="flex flex-col lg:flex-row gap-3 bg-background rounded-lg" data-testid="viewer3d">
      {!mobile && <aside className="w-64 shrink-0 border rounded-lg p-3 overflow-y-auto max-h-[78vh]">{Panel}</aside>}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="relative rounded-lg border overflow-hidden h-[58vh] md:h-[68vh] min-h-[320px]">
          <Canvas shadows camera={{ fov: 45, position: [20, 15, 20] }} gl={{ preserveDrawingBuffer: true, antialias: true }} dpr={[1, 2]}>
            <Suspense fallback={null}><Controller built={built} model={model} opts={opts} preset={preset} measures={measures} onPoint={onPoint} glRef={glRef} /></Suspense>
          </Canvas>
          <div className="absolute top-2 right-2 flex gap-1.5">
            {mobile && (
              <Sheet open={sheet} onOpenChange={setSheet}>
                <SheetTrigger asChild><Button size="icon" variant="secondary" aria-label="Controls"><SlidersHorizontal className="h-4 w-4" /></Button></SheetTrigger>
                <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto"><SheetHeader><SheetTitle>{L("Viewer controls", "ভিউয়ার কন্ট্রোল")}</SheetTitle></SheetHeader><div className="mt-3">{Panel}</div></SheetContent>
              </Sheet>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="secondary" aria-label="Screenshot"><Camera className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => shot("png")}>PNG</DropdownMenuItem><DropdownMenuItem onClick={() => shot("jpeg")}>JPG</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="secondary" aria-label="Export 3D"><Download className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void exportAs("glb")}>GLB (glTF)</DropdownMenuItem><DropdownMenuItem onClick={() => void exportAs("obj")}>OBJ</DropdownMenuItem><DropdownMenuItem onClick={() => void exportAs("stl")}>STL</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
            <Button size="icon" variant="secondary" onClick={fullscreen} aria-label="Fullscreen">{fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
          </div>
          {model.conceptual && <div className="absolute top-2 left-2 rounded bg-amber-500 text-black text-[11px] font-semibold px-2 py-1">{L("CONCEPTUAL 3D RECONSTRUCTION", "কনসেপ্টুয়াল ৩ডি পুনর্গঠন")}</div>}
          {opts.measure && <div className="absolute bottom-2 left-2 rounded bg-background/90 text-xs px-2 py-1 border">{hasFirst ? L("Pick the 2nd point", "২য় বিন্দু বাছুন") : L("Measure: pick the 1st point", "মাপ: ১ম বিন্দু বাছুন")}</div>}
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <Disclaimer conceptual={model.conceptual} />
      </div>
    </div>
  );
}
