import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { Camera, Download, FileText, Film, Maximize2, Minimize2, Ruler, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildScene, countByKind, DEFAULT_MATERIAL_SETTINGS, type Kind, type MaterialSettings } from "@/lib/viz/geometry";
import { posToStage, stageVisible, advance, initialSim, type Sim } from "@/lib/viz/stages";
import { buildEnvironment, DEFAULT_CUSTOM, type CustomEnv, type Env, type EnvPreset } from "@/lib/viz/environment";
import { bounds } from "@/lib/viz/model";
import { visibleClone } from "@/lib/viz/exportScene";
import { buildReportData, renderReportPdf } from "@/lib/viz/report";
import StagePlayer from "./StagePlayer";
import Surroundings from "./Surroundings";
import EnvironmentPanel from "./EnvironmentPanel";
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

function Controller({ built, model, opts, preset, measures, onPoint, glRef, sim, env }: {
  built: ReturnType<typeof buildScene>; model: BuildingModel; opts: Opts; preset: { p: Preset; n: number }; sim: Sim; env: Env;
  measures: Measurement[]; onPoint: (e: ThreeEvent<MouseEvent>) => void; glRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
}) {
  const { gl, camera, scene } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), []);
  const H = model.floorHeight.value;
  const box = useMemo(() => new THREE.Box3().setFromObject(built.root), [built]);
  const simKey = Math.round(sim.pos * 100);
  const simPos = useMemo(() => posToStage(simKey / 100), [simKey]);

  useEffect(() => { glRef.current = gl; gl.localClippingEnabled = true; }, [gl, glRef]);

  // layer / structural / floor isolation / explode
  useEffect(() => {
    built.root.traverse((o) => {
      const k = (o as THREE.Mesh).isMesh ? (o.userData.kind as Layer | undefined) : undefined;
      if (k) {
        const layerOn = opts.structural ? STRUCTURAL.has(k) : opts.layers[k] !== false;
        o.visible = layerOn && (!sim.on || stageVisible(k as Kind, (o.userData.floor as number) ?? 0, model.floors, simPos));
      }
    });
    built.floorGroups.forEach((g, i) => {
      g.visible = opts.floorIso === null || i === opts.floorIso;
      g.position.y = opts.exploded ? (i + 1) * H * 0.9 : 0;
    });
    built.foundation.visible = opts.floorIso === null || opts.floorIso === 0;
    built.foundation.position.y = opts.exploded ? 0 : 0;
  }, [built, opts.layers, opts.structural, opts.floorIso, opts.exploded, H, sim.on, simPos, model.floors]);

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
          <meshStandardMaterial color={opts.night ? "#111827" : env.ground} roughness={1} />
        </mesh>
      )}
      {!opts.structural && <Surroundings env={env} night={opts.night} />}
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
      <OrbitControls ref={controls} makeDefault autoRotate={sim.on && sim.playing && sim.cinematic} autoRotateSpeed={1.6 * sim.speed} enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.499} />
    </>
  );
}

export default function Viewer3D({ model, name }: { model: BuildingModel; name?: string }) {
  const L = useL();
  const mobile = useIsMobile();
  const [opts, setOpts] = useState<Opts>(initialOpts);
  const [materialSettings, setMaterialSettings] = useState<MaterialSettings>(DEFAULT_MATERIAL_SETTINGS);
  const [preset, setPreset] = useState<{ p: Preset; n: number }>({ p: "iso", n: 0 });
  const [measures, setMeasures] = useState<Measurement[]>([]);
  const pending = useRef<THREE.Vector3 | null>(null);
  const [hasFirst, setHasFirst] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const [fs, setFs] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const built = useMemo(() => buildScene(model, materialSettings), [model, materialSettings]);
  const [sim, setSimState] = useState<Sim>(initialSim);
  const setSim = useCallback((f: (s: Sim) => Sim) => setSimState(f), []);
  const [envPreset, setEnvPreset] = useState<EnvPreset>("residential");
  const [envCustom, setEnvCustom] = useState<CustomEnv>(DEFAULT_CUSTOM);
  const fpBounds = useMemo(() => (model.footprint.points.length ? bounds(model.footprint.points) : { minX: 0, maxX: 10, minY: 0, maxY: 10, w: 10, d: 10 }), [model]);
  const env = useMemo(() => buildEnvironment(envPreset, fpBounds, envCustom), [envPreset, fpBounds, envCustom]);
  const items = useMemo(() => { const a: { kind: Kind; floor: number }[] = []; built.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.kind) a.push({ kind: o.userData.kind as Kind, floor: (o.userData.floor as number) ?? 0 }); }); return a; }, [built]);
  const counts = useMemo(() => { const sp = posToStage(Math.round(sim.pos * 100) / 100); let shown = 0; for (const it of items) if (stageVisible(it.kind, it.floor, model.floors, sp)) shown++; return { shown, total: items.length }; }, [items, sim.pos, model.floors]);
  // playback clock (requestAnimationFrame); state is only touched when the 1/100-stage step changes
  useEffect(() => {
    if (!sim.on || !sim.playing) return;
    let raf = 0, last = performance.now(), pos = sim.pos, shownStep = Math.round(pos * 100);
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const r = advance(pos, dt, sim.speed); pos = r.pos;
      const step = Math.round(pos * 100);
      if (step !== shownStep || r.done) { shownStep = step; setSimState((s) => (s.on && s.playing ? { ...s, pos, playing: !r.done } : s)); }
      if (!r.done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.on, sim.playing, sim.speed]);
  useEffect(() => () => { const disposed = new Set<THREE.Material>(); built.root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.geometry.dispose(); const materials = Array.isArray(m.material) ? m.material : [m.material]; for (const material of materials) { if (disposed.has(material)) continue; disposed.add(material); const standard = material as THREE.MeshStandardMaterial; standard.map?.dispose(); standard.normalMap?.dispose(); standard.roughnessMap?.dispose(); standard.metalnessMap?.dispose(); material.dispose(); } }); }, [built]);
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
        const buf = await new Promise<ArrayBuffer>((res, rej) => new GLTFExporter().parse(visibleClone(built.root), (r) => res(r as ArrayBuffer), rej, { binary: true }));
        download(new Blob([buf], { type: "model/gltf-binary" }), `${base}.glb`);
      } else if (fmt === "obj") download(new Blob([new OBJExporter().parse(visibleClone(built.root))], { type: "text/plain" }), `${base}.obj`);
      else download(new Blob([new STLExporter().parse(visibleClone(built.root), { binary: false }) as string], { type: "model/stl" }), `${base}.stl`);
    } catch (e) { setErr(L("Export failed: ", "এক্সপোর্ট ব্যর্থ: ") + (e instanceof Error ? e.message : "")); }
  };

  const reportPdf = () => {
    try {
      setErr(null);
      const gl = glRef.current;
      const img = gl ? gl.domElement.toDataURL("image/jpeg", 0.88) : null;
      const doc = renderReportPdf(buildReportData(model, countByKind(built.root)), img);
      download(doc.output("blob"), `${base}-report.pdf`);
    } catch (e) { setErr(L("Report failed: ", "রিপোর্ট ব্যর্থ: ") + (e instanceof Error ? e.message : "")); }
  };

  // Video: records the canvas while the construction sequence plays once from the start.
  const [recording, setRecording] = useState(false);
  const recorder = useRef<{ r: MediaRecorder; keep: boolean } | null>(null);
  const stopRecording = useCallback((keep: boolean) => {
    const cur = recorder.current; if (!cur) return;
    cur.keep = keep; if (cur.r.state !== "inactive") cur.r.stop();
    recorder.current = null; setRecording(false);
  }, []);
  const startVideo = () => {
    const gl = glRef.current;
    const canvas = gl?.domElement as (HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }) | undefined;
    if (!canvas || typeof MediaRecorder === "undefined" || !canvas.captureStream) { setErr(L("Video recording is not supported in this browser. Use Chrome, Edge or Firefox on a computer.", "এই ব্রাউজারে ভিডিও রেকর্ডিং সম্ভব নয়। কম্পিউটারে Chrome, Edge বা Firefox ব্যবহার করুন।")); return; }
    const type = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) { setErr(L("No supported video format in this browser.", "এই ব্রাউজারে কোনো সমর্থিত ভিডিও ফরম্যাট নেই।")); return; }
    try {
      setErr(null);
      const stream = canvas.captureStream(30), chunks: Blob[] = [];
      const r = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
      const cur = { r, keep: true };
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cur.keep && chunks.length) download(new Blob(chunks, { type: type.split(";")[0] }), `${base}-construction.${type.startsWith("video/mp4") ? "mp4" : "webm"}`);
      };
      r.start(250); recorder.current = cur; setRecording(true);
      setSimState({ on: true, playing: true, pos: 0, speed: 1, cinematic: true });
    } catch (e) { setErr(L("Could not start recording: ", "রেকর্ডিং শুরু করা যায়নি: ") + (e instanceof Error ? e.message : "")); }
  };
  useEffect(() => { // finished the sequence → stop after a short hold on the final frame
    if (!recording || !sim.on || sim.pos < 8 || sim.playing) return;
    const t = setTimeout(() => stopRecording(true), 1200);
    return () => clearTimeout(t);
  }, [recording, sim.on, sim.pos, sim.playing, stopRecording]);
  useEffect(() => { if (recording && !sim.on) stopRecording(false); }, [recording, sim.on, stopRecording]);
  useEffect(() => () => { const c = recorder.current; if (c) { c.keep = false; if (c.r.state !== "inactive") c.r.stop(); } }, []);

  const Panel = (
    <div className="space-y-4 text-sm">
      <EnvironmentPanel preset={envPreset} setPreset={setEnvPreset} custom={envCustom} setCustom={setEnvCustom} />
      <section className="space-y-3 rounded-lg border p-3 bg-card/60" data-testid="material-studio">
        <div>
          <Label className="text-xs uppercase text-muted-foreground">{L("Professional material studio", "প্রফেশনাল ম্যাটেরিয়াল স্টুডিও")}</Label>
          <p className="text-[11px] text-muted-foreground mt-1">{L("Preview PBR-style finishes directly on the 3D model.", "৩ডি মডেলে সরাসরি ম্যাটেরিয়াল ও টেক্সচার প্রিভিউ করুন।")}</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{L("Exterior finish", "বাইরের ফিনিশ")}</Label>
          <select aria-label="Exterior finish" value={materialSettings.exteriorFinish} onChange={(e) => setMaterialSettings((s) => ({ ...s, exteriorFinish: e.target.value as MaterialSettings["exteriorFinish"] }))} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="paint">{L("Smooth paint", "স্মুথ পেইন্ট")}</option>
            <option value="brick">{L("Brick texture", "ইটের টেক্সচার")}</option>
            <option value="stone">{L("Natural stone", "ন্যাচারাল স্টোন")}</option>
            <option value="wood">{L("Wood cladding", "উড ক্ল্যাডিং")}</option>
            <option value="tile">{L("Exterior tiles", "এক্সটেরিয়র টাইলস")}</option>
            <option value="concrete">{L("Fair-face concrete", "কংক্রিট ফিনিশ")}</option>
          </select>
        </div>
        {materialSettings.exteriorFinish === "paint" && <div className="flex items-center justify-between gap-2"><Label className="text-xs">{L("Paint colour", "পেইন্টের রং")}</Label><input aria-label="Exterior paint colour" type="color" value={materialSettings.exteriorColor} onChange={(e) => setMaterialSettings((s) => ({ ...s, exteriorColor: e.target.value }))} className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0.5" /></div>}
        <div className="space-y-1">
          <div className="flex justify-between gap-2"><Label className="text-xs">{L("Surface roughness", "সারফেস রাফনেস")}</Label><span className="text-xs text-muted-foreground">{materialSettings.roughness.toFixed(2)}</span></div>
          <input aria-label="Surface roughness" type="range" min="0.15" max="1" step="0.05" value={materialSettings.roughness} onChange={(e) => setMaterialSettings((s) => ({ ...s, roughness: Number(e.target.value) }))} className="w-full accent-primary" />
        </div>
        {materialSettings.exteriorFinish !== "paint" && <div className="space-y-1">
          <div className="flex justify-between gap-2"><Label className="text-xs">{L("Texture scale", "টেক্সচার স্কেল")}</Label><span className="text-xs text-muted-foreground">{materialSettings.textureScale.toFixed(1)}×</span></div>
          <input aria-label="Texture scale" type="range" min="0.5" max="4" step="0.25" value={materialSettings.textureScale} onChange={(e) => setMaterialSettings((s) => ({ ...s, textureScale: Number(e.target.value) }))} className="w-full accent-primary" />
        </div>}
        <div className="space-y-1">
          <div className="flex justify-between gap-2"><Label className="text-xs">{L("Glass opacity", "কাচের অস্বচ্ছতা")}</Label><span className="text-xs text-muted-foreground">{Math.round(materialSettings.glassOpacity * 100)}%</span></div>
          <input aria-label="Glass opacity" type="range" min="0.15" max="0.9" step="0.05" value={materialSettings.glassOpacity} onChange={(e) => setMaterialSettings((s) => ({ ...s, glassOpacity: Number(e.target.value) }))} className="w-full accent-primary" />
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={() => setMaterialSettings(DEFAULT_MATERIAL_SETTINGS)}>{L("Reset materials", "ম্যাটেরিয়াল রিসেট")}</Button>
        <p className="text-[10px] leading-relaxed text-muted-foreground">{L("Procedural texture previews are generated locally. This is a real-time WebGL preview, not a path-traced V-Ray/Lumion render.", "প্রসিডিউরাল টেক্সচার লোকালেই তৈরি হয়। এটি রিয়েল-টাইম WebGL প্রিভিউ—পাথ-ট্রেসড V-Ray/Lumion রেন্ডার নয়।")}</p>
      </section>
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
    <div ref={wrap} className="flex flex-col lg:flex-row gap-3 bg-background rounded-lg min-w-0 max-w-full" data-testid="viewer3d">
      {!mobile && <aside className="w-64 shrink-0 border rounded-lg p-3 overflow-y-auto max-h-[78vh]">{Panel}</aside>}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="relative rounded-lg border overflow-hidden h-[58vh] md:h-[68vh] min-h-[320px]">
          <Canvas shadows camera={{ fov: 45, position: [20, 15, 20] }} gl={{ preserveDrawingBuffer: true, antialias: true }} dpr={[1, 2]}>
            <Suspense fallback={null}><Controller built={built} model={model} opts={opts} preset={preset} measures={measures} onPoint={onPoint} glRef={glRef} sim={sim} env={env} /></Suspense>
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
              <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void exportAs("glb")}>GLB (glTF)</DropdownMenuItem><DropdownMenuItem onClick={() => void exportAs("obj")}>OBJ</DropdownMenuItem><DropdownMenuItem onClick={() => void exportAs("stl")}>STL</DropdownMenuItem>
                <DropdownMenuItem onClick={reportPdf}><FileText className="h-3.5 w-3.5 mr-1.5" />{L("PDF report", "PDF রিপোর্ট")}</DropdownMenuItem>
                <DropdownMenuItem onClick={startVideo} disabled={recording}><Film className="h-3.5 w-3.5 mr-1.5" />{L("Video (construction sequence)", "ভিডিও (নির্মাণক্রম)")}</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
            <Button size="icon" variant="secondary" onClick={fullscreen} aria-label="Fullscreen">{fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
          </div>
          {model.conceptual && <div className="absolute top-2 left-2 rounded bg-amber-500 text-black text-[11px] font-semibold px-2 py-1">{L("CONCEPTUAL 3D RECONSTRUCTION", "কনসেপ্টুয়াল ৩ডি পুনর্গঠন")}</div>}
          {recording && <div className="absolute bottom-2 right-2 flex items-center gap-2 rounded bg-red-600 text-white text-xs px-2 py-1" data-testid="recording"><span className="h-2 w-2 rounded-full bg-white animate-pulse" />{L("Recording…", "রেকর্ড হচ্ছে…")}<button className="underline" onClick={() => stopRecording(false)}>{L("Cancel", "বাতিল")}</button></div>}
          {opts.measure && <div className="absolute bottom-2 left-2 rounded bg-background/90 text-xs px-2 py-1 border">{hasFirst ? L("Pick the 2nd point", "২য় বিন্দু বাছুন") : L("Measure: pick the 1st point", "মাপ: ১ম বিন্দু বাছুন")}</div>}
        </div>
        <StagePlayer sim={sim} setSim={setSim} shown={counts.shown} total={counts.total} />
        {err && <p className="text-xs text-destructive">{err}</p>}
        <Disclaimer conceptual={model.conceptual} />
      </div>
    </div>
  );
}
