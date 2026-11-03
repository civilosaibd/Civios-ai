import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bounds, Center, ContactShadows, OrbitControls, RoundedBox, useGLTF } from "@react-three/drei";
import type { Group } from "three";
import { supabase } from "@/integrations/supabase/client";

type Vec3 = [number, number, number];

function Solid({
  position, size, color, roughness = 0.78, metalness = 0, radius = 0.018,
}: {
  position: Vec3; size: Vec3; color: string; roughness?: number; metalness?: number; radius?: number;
}) {
  return (
    <RoundedBox position={position} args={size} radius={Math.min(radius, ...size.map((v) => Math.max(0.002, v * 0.18)))} smoothness={3} castShadow receiveShadow>
      <meshPhysicalMaterial color={color} roughness={roughness} metalness={metalness} clearcoat={0.12} clearcoatRoughness={0.55} />
    </RoundedBox>
  );
}

function Glass({ position, size, tint = "#7899a0", opacity = 0.52 }: { position: Vec3; size: Vec3; tint?: string; opacity?: number }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshPhysicalMaterial
        color={tint} roughness={0.12} metalness={0.22} transparent opacity={opacity}
        transmission={0.24} thickness={0.22} ior={1.46} clearcoat={1} clearcoatRoughness={0.08}
        envMapIntensity={1.4} depthWrite={false}
      />
    </mesh>
  );
}

function WindowWall({ x, y, z, width, height, front = true }: {
  x: number; y: number; z: number; width: number; height: number; front?: boolean;
}) {
  const frame = "#252e31";
  const mullions = useMemo(() => Array.from({ length: Math.max(2, Math.floor(width / 0.82)) }, (_, i) => -width / 2 + (i + 1) * width / (Math.max(2, Math.floor(width / 0.82)) + 1)), [width]);
  return (
    <group position={[x, y, z]}>
      <Glass position={[0, 0, 0]} size={front ? [width, height, 0.045] : [0.045, height, width]} />
      {front ? (
        <>
          <Solid position={[0, height / 2, 0.035]} size={[width + 0.08, 0.055, 0.085]} color={frame} radius={0.01} />
          <Solid position={[0, -height / 2, 0.035]} size={[width + 0.08, 0.055, 0.085]} color={frame} radius={0.01} />
          <Solid position={[-width / 2, 0, 0.035]} size={[0.055, height, 0.085]} color={frame} radius={0.01} />
          <Solid position={[width / 2, 0, 0.035]} size={[0.055, height, 0.085]} color={frame} radius={0.01} />
          {mullions.map((m) => <Solid key={m} position={[m, 0, 0.045]} size={[0.025, height, 0.065]} color="#465256" radius={0.005} />)}
        </>
      ) : (
        <>
          <Solid position={[0.035, height / 2, 0]} size={[0.085, 0.055, width + 0.08]} color={frame} radius={0.01} />
          <Solid position={[0.035, -height / 2, 0]} size={[0.085, 0.055, width + 0.08]} color={frame} radius={0.01} />
          <Solid position={[0.035, 0, -width / 2]} size={[0.085, height, 0.055]} color={frame} radius={0.01} />
          <Solid position={[0.035, 0, width / 2]} size={[0.085, height, 0.055]} color={frame} radius={0.01} />
          {mullions.map((m) => <Solid key={m} position={[0.045, 0, m]} size={[0.065, height, 0.025]} color="#465256" radius={0.005} />)}
        </>
      )}
    </group>
  );
}

function Balcony({ y, width = 3.25, z = 2.28 }: { y: number; width?: number; z?: number }) {
  return (
    <group>
      <Solid position={[0, y, z]} size={[width, 0.13, 0.86]} color="#c7c4bc" roughness={0.52} />
      <Glass position={[0, y + 0.48, z + 0.39]} size={[width - 0.12, 0.88, 0.035]} tint="#a8c4c8" opacity={0.3} />
      <Solid position={[0, y + 0.91, z + 0.39]} size={[width, 0.045, 0.055]} color="#353e40" metalness={0.72} roughness={0.25} radius={0.01} />
      {Array.from({ length: 9 }, (_, i) => (
        <Solid key={i} position={[-width / 2 + 0.2 + i * (width - 0.4) / 8, y + 0.46, z + 0.4]} size={[0.018, 0.84, 0.025]} color="#b6c5c5" metalness={0.5} roughness={0.22} radius={0.004} />
      ))}
      <Solid position={[0, y + 0.075, z - 0.02]} size={[width + 0.08, 0.035, 0.92]} color="#eee9de" roughness={0.48} />
    </group>
  );
}

function Planter({ position, width = 0.9, height = 0.42 }: { position: Vec3; width?: number; height?: number }) {
  return (
    <group position={position}>
      <Solid position={[0, height / 2, 0]} size={[width, height, 0.55]} color="#aaa69c" roughness={0.92} />
      <Solid position={[0, height + 0.018, 0]} size={[width - 0.1, 0.045, 0.45]} color="#3f493e" roughness={1} />
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[-width * 0.34 + i * width * 0.17, height + 0.2 + (i % 2) * 0.07, (i % 2) * 0.08]} castShadow>
          <dodecahedronGeometry args={[0.17 + (i % 3) * 0.025, 1]} />
          <meshStandardMaterial color={["#466b4d", "#5d8059", "#78906a"][i % 3]} roughness={0.96} />
        </mesh>
      ))}
    </group>
  );
}

function Tree({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.105, 1.6, 9]} />
        <meshStandardMaterial color="#6f513b" roughness={1} />
      </mesh>
      {[
        [0, 1.85, 0, 0.48], [-0.26, 1.62, 0.08, 0.35], [0.25, 1.68, -0.06, 0.38],
        [0.08, 2.12, -0.12, 0.34], [-0.18, 2.05, -0.12, 0.29],
      ].map(([x, y, z, radius], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <icosahedronGeometry args={[radius, 2]} />
          <meshStandardMaterial color={["#476b4c", "#587b55", "#66845d", "#3f6247", "#78906a"][i]} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function GroundScene() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.13, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#253a35" roughness={1} />
      </mesh>
      <Solid position={[0, -0.02, 0]} size={[8.6, 0.2, 7.5]} color="#a9a79d" roughness={0.9} radius={0.04} />
      <Solid position={[0, 0.1, 0]} size={[7.9, 0.12, 6.9]} color="#d0ccc1" roughness={0.85} radius={0.025} />
      <Solid position={[0, 0.17, 3.12]} size={[7.3, 0.035, 0.55]} color="#737a77" roughness={0.9} radius={0.01} />
      {[-2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7].map((x) => (
        <Solid key={x} position={[x, 0.195, 3.12]} size={[0.62, 0.012, 0.025]} color="#d9d4c5" roughness={0.9} radius={0.004} />
      ))}
      <Solid position={[0, 0.19, 2.18]} size={[2.05, 0.045, 1.5]} color="#b8b4a9" roughness={0.86} radius={0.015} />
      {[-2.8, 2.8].map((x) => <Planter key={x} position={[x, 0.2, 1.95]} width={0.95} />)}
      <Tree position={[-3.25, 0.2, -1.9]} scale={0.95} />
      <Tree position={[3.25, 0.2, -1.75]} scale={0.88} />
      <Tree position={[-3.25, 0.2, 2.65]} scale={0.62} />
      <Tree position={[3.25, 0.2, 2.65]} scale={0.66} />
      <Planter position={[-2.2, 0.2, -2.9]} width={1.2} />
      <Planter position={[2.2, 0.2, -2.9]} width={1.2} />
    </group>
  );
}

function ModernResidence({ motionEnabled }: { motionEnabled: boolean }) {
  const root = useRef<Group>(null);
  useFrame((_, delta) => {
    if (motionEnabled && root.current) root.current.rotation.y += delta * (Math.PI * 2 / 72);
  });

  const floors = [0.96, 2.38, 3.8, 5.22];
  return (
    <group ref={root} rotation={[0, -0.35, 0]}>
      <GroundScene />

      {/* Lower stone-clad podium and recessed double-height entrance */}
      <Solid position={[0, 0.48, -1.58]} size={[4.9, 0.65, 0.18]} color="#b7b1a5" roughness={0.92} />
      <Solid position={[-2.35, 0.66, 0]} size={[0.2, 1.15, 3.35]} color="#c5bfb2" roughness={0.9} />
      <Solid position={[2.35, 0.66, 0]} size={[0.2, 1.15, 3.35]} color="#c5bfb2" roughness={0.9} />
      <WindowWall x={-1.35} y={0.98} z={1.7} width={1.55} height={1.45} />
      <WindowWall x={1.35} y={0.98} z={1.7} width={1.55} height={1.45} />
      <Glass position={[0, 1.04, 1.72]} size={[0.92, 1.58, 0.055]} tint="#344e55" opacity={0.65} />
      <Solid position={[0.37, 0.99, 1.78]} size={[0.035, 1.46, 0.07]} color="#b99b70" metalness={0.62} roughness={0.28} radius={0.004} />

      {/* Four floating floor plates, warm concrete and glass curtain wall */}
      {floors.map((y, index) => {
        const width = index === 3 ? 4.65 : index === 2 ? 4.92 : 4.75;
        const offset = index === 2 ? 0.18 : index === 3 ? -0.08 : 0;
        return (
          <group key={y} position={[offset, 0, 0]}>
            <Solid position={[0, y - 0.72, 0]} size={[width + 0.24, 0.14, 3.85]} color={index % 2 ? "#d7d2c7" : "#c8c2b6"} roughness={0.72} />
            <Solid position={[0, y + 0.68, -1.78]} size={[width, 0.1, 0.16]} color="#e0dbd0" roughness={0.82} />
            <Solid position={[-width / 2 + 0.08, y, -0.04]} size={[0.16, 1.32, 3.5]} color={index === 2 ? "#9d8064" : "#c9c4b9"} roughness={0.8} />
            <Solid position={[width / 2 - 0.08, y, -0.04]} size={[0.16, 1.32, 3.5]} color="#c9c4b9" roughness={0.8} />
            <WindowWall x={0} y={y} z={1.77} width={width - 0.36} height={1.22} />
            <WindowWall x={width / 2 - 0.06} y={y} z={-0.02} width={3.25} height={1.16} front={false} />
            <Solid position={[-width / 2 + 0.22, y, 1.83]} size={[0.14, 1.32, 0.16]} color="#d0c9bd" />
            <Solid position={[width / 2 - 0.22, y, 1.83]} size={[0.14, 1.32, 0.16]} color="#d0c9bd" />
            {index === 1 || index === 2 ? <Balcony y={y - 0.64} width={index === 2 ? 3.55 : 3.15} z={2.22} /> : null}
          </group>
        );
      })}

      {/* Strong architectural frame, vertical fins and warm timber accent volume */}
      <Solid position={[-2.18, 3.38, 1.92]} size={[0.2, 5.05, 0.22]} color="#343b3b" roughness={0.38} metalness={0.28} />
      <Solid position={[2.18, 3.38, 1.92]} size={[0.2, 5.05, 0.22]} color="#343b3b" roughness={0.38} metalness={0.28} />
      <Solid position={[1.55, 3.75, 1.89]} size={[0.88, 2.62, 0.13]} color="#8d684b" roughness={0.76} />
      {Array.from({ length: 11 }, (_, i) => (
        <Solid key={i} position={[1.16 + i * 0.078, 3.75, 1.98]} size={[0.025, 2.56, 0.045]} color="#b58a61" roughness={0.7} radius={0.004} />
      ))}
      {[-1.92, -1.68, -1.44].map((x) => (
        <Solid key={x} position={[x, 3.55, 1.94]} size={[0.055, 4.55, 0.1]} color="#4a5554" metalness={0.4} roughness={0.36} radius={0.006} />
      ))}

      {/* Rooftop penthouse, terrace and slim metal pergola */}
      <Solid position={[-0.42, 6.0, -0.78]} size={[2.05, 1.28, 1.75]} color="#d6d0c4" roughness={0.82} />
      <WindowWall x={-0.42} y={6.0} z={0.12} width={1.7} height={1.02} />
      <Solid position={[0, 5.92, 0]} size={[4.95, 0.16, 4.05]} color="#d0cabe" roughness={0.76} />
      <Solid position={[0, 6.12, -1.9]} size={[4.9, 0.32, 0.1]} color="#e1dbcf" />
      <Solid position={[-2.38, 6.12, 0]} size={[0.1, 0.32, 3.9]} color="#e1dbcf" />
      <Solid position={[2.38, 6.12, 0]} size={[0.1, 0.32, 3.9]} color="#e1dbcf" />
      {[-1.75, 1.75].map((x) => <Solid key={x} position={[x, 6.72, -0.35]} size={[0.075, 1.1, 0.075]} color="#343c3b" metalness={0.68} roughness={0.26} radius={0.008} />)}
      {[-1.75, -0.58, 0.58, 1.75].map((x) => <Solid key={x} position={[x, 7.28, -0.35]} size={[0.075, 0.075, 2.75]} color="#343c3b" metalness={0.68} roughness={0.26} radius={0.008} />)}
      {[-1.42, -0.72, 0, 0.72, 1.42].map((z) => <Solid key={z} position={[0, 7.28, z - 0.35]} size={[3.55, 0.06, 0.06]} color="#454d49" metalness={0.62} roughness={0.3} radius={0.006} />)}
      <Planter position={[-1.72, 6.02, 1.18]} width={1.15} />
      <Planter position={[1.72, 6.02, 1.18]} width={1.15} />

      {/* Entry canopy, soffit and architectural approach */}
      <Solid position={[0, 1.86, 2.38]} size={[2.55, 0.16, 1.12]} color="#353c3b" roughness={0.34} metalness={0.32} />
      <Solid position={[0, 1.77, 2.38]} size={[2.62, 0.045, 1.16]} color="#d4c6ad" roughness={0.55} />
      {[-0.9, 0.9].map((x) => <Solid key={x} position={[x, 1.1, 2.32]} size={[0.08, 1.42, 0.08]} color="#343b3b" metalness={0.45} roughness={0.34} radius={0.008} />)}
      {[0, 1, 2].map((step) => <Solid key={step} position={[0, 0.23 + step * 0.13, 2.9 + step * 0.34]} size={[2.3, 0.12, 0.38]} color="#b8b4aa" roughness={0.85} />)}
      <Planter position={[-2.55, 0.2, 1.8]} width={0.85} />
      <Planter position={[2.55, 0.2, 1.8]} width={0.85} />
    </group>
  );
}

function UploadedHeroModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return (
    <Bounds fit clip observe margin={1.35}>
      <Center><primitive object={scene.clone()} /></Center>
    </Bounds>
  );
}

function Scene({ motionEnabled, modelUrl }: { motionEnabled: boolean; modelUrl: string | null }) {
  return (
    <>
      <color attach="background" args={["#10202a"]} />
      <fog attach="fog" args={["#10202a", 13, 27]} />
      <hemisphereLight args={["#dce9f1", "#465348", 1.25]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[8, 12, 9]} intensity={2.5} color="#fff1dc" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-10} shadow-camera-right={10}
        shadow-camera-top={10} shadow-camera-bottom={-10}
        shadow-bias={-0.00015}
      />
      <directionalLight position={[-7, 6, -5]} intensity={1.1} color="#a8d6e6" />
      <pointLight position={[0, 3.8, 3.1]} intensity={18} distance={10} color="#ffd39a" />
      {modelUrl ? <UploadedHeroModel url={modelUrl} /> : <ModernResidence motionEnabled={motionEnabled} />}
      <ContactShadows position={[0, 0.22, 0]} opacity={0.34} scale={11} blur={2.8} far={5} />
      <OrbitControls
        target={[0, 3.2, 0]} enableDamping dampingFactor={0.055}
        enablePan={false} enableZoom={false}
        minPolarAngle={Math.PI / 3.35} maxPolarAngle={Math.PI / 2.12}
      />
    </>
  );
}

export default function HeroBuilding3D() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await (supabase.from("homepage_hero_models" as any) as any)
        .select("file_path").eq("is_active", true).limit(1).maybeSingle();
      if (!alive || error || !data?.file_path) return;
      const { data: publicAsset } = supabase.storage
        .from("homepage-hero-models").getPublicUrl(data.file_path);
      if (alive && publicAsset?.publicUrl) setModelUrl(publicAsset.publicUrl);
    })();
    return () => { alive = false; };
  }, []);

  const motionEnabled = typeof window === "undefined"
    ? true
    : !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      className="relative isolate h-[310px] w-full overflow-hidden rounded-[28px] sm:h-[390px] lg:h-[500px]"
      role="img"
      aria-label="A photorealistic modern four-storey architectural residence with glass curtain walls, stone and timber facade, cantilevered balconies, rooftop pergola and landscaped grounds, rotating slowly in interactive 3D."
      style={{
        background: "radial-gradient(ellipse at 50% 42%, rgba(108, 151, 164, .28), transparent 58%), linear-gradient(145deg, #0b1a25, #1b3037)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[28px] border border-white/10" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[76%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/10 [transform:translate(-50%,-50%)_rotateX(68deg)]" />
      <Canvas
        shadows dpr={[1, 1.5]}
        camera={{ position: [9.6, 7.1, 10.6], fov: 33, near: 0.1, far: 100 }}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        fallback={<div className="flex h-full items-center justify-center text-sm text-white/70">3D preview is not available in this browser.</div>}
      >
        <Scene motionEnabled={motionEnabled} modelUrl={modelUrl} />
      </Canvas>

      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/55 px-3 py-2 text-[9px] font-bold tracking-[0.2em] text-cyan-100 shadow-lg backdrop-blur-md sm:left-6 sm:top-6 sm:text-[10px]">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.8)]" />
        LIVE ARCHITECTURAL 3D
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 sm:bottom-6 sm:left-6 sm:right-6">
        <div className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-white/90 shadow-lg backdrop-blur-md">
          <p className="text-[9px] font-semibold tracking-[0.18em] text-cyan-100/80">CONTEMPORARY RESIDENCE</p>
          <p className="mt-1 text-xs font-medium text-white/90">4 floors · glass facade · roof terrace</p>
        </div>
        <div className="rounded-xl border border-cyan-100/20 bg-slate-950/60 px-3 py-2.5 text-right text-white/90 shadow-lg backdrop-blur-md">
          <p className="text-sm font-bold tracking-wide text-amber-200">360°</p>
          <p className="text-[9px] tracking-wide text-white/65">DRAG TO EXPLORE</p>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#071727]/35 to-transparent" />
    </div>
  );
}
