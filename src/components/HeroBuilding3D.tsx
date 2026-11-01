import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Group } from "three";

type Vec3 = [number, number, number];

type BoxProps = {
  position: Vec3;
  size: Vec3;
  color: string;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
};

function Box({
  position,
  size,
  color,
  roughness = 0.72,
  metalness = 0,
  transparent = false,
  opacity = 1,
}: BoxProps) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        transparent={transparent}
        opacity={opacity}
      />
    </mesh>
  );
}

function FrontWindow({ position, width = 1.04, height = 0.84 }: { position: Vec3; width?: number; height?: number }) {
  return (
    <group position={position}>
      <Box position={[0, 0, 0]} size={[width, height, 0.045]} color="#47717b" roughness={0.18} metalness={0.24} transparent opacity={0.88} />
      <Box position={[-width / 2, 0, 0.045]} size={[0.055, height + 0.08, 0.08]} color="#e5e2d9" />
      <Box position={[width / 2, 0, 0.045]} size={[0.055, height + 0.08, 0.08]} color="#e5e2d9" />
      <Box position={[0, height / 2, 0.045]} size={[width + 0.08, 0.055, 0.08]} color="#f2eee5" />
      <Box position={[0, -height / 2, 0.045]} size={[width + 0.08, 0.055, 0.08]} color="#f2eee5" />
      <Box position={[0, 0, 0.065]} size={[0.035, height, 0.045]} color="#d7d9d5" />
      <Box position={[0, 0, 0.065]} size={[width, 0.028, 0.045]} color="#d7d9d5" />
    </group>
  );
}

function SideWindow({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <Box position={[0, 0, 0]} size={[0.045, 0.78, 0.94]} color="#47717b" roughness={0.18} metalness={0.24} transparent opacity={0.88} />
      <Box position={[0.04, 0, -0.48]} size={[0.075, 0.86, 0.05]} color="#e5e2d9" />
      <Box position={[0.04, 0, 0.48]} size={[0.075, 0.86, 0.05]} color="#e5e2d9" />
      <Box position={[0.04, 0.41, 0]} size={[0.075, 0.05, 1.0]} color="#f2eee5" />
      <Box position={[0.04, -0.41, 0]} size={[0.075, 0.05, 1.0]} color="#f2eee5" />
      <Box position={[0.065, 0, 0]} size={[0.04, 0.78, 0.025]} color="#d7d9d5" />
    </group>
  );
}

function EntranceDoor() {
  return (
    <group position={[0, 0.97, 1.79]}>
      <Box position={[0, 0, 0]} size={[0.96, 1.2, 0.06]} color="#493b30" />
      <Box position={[0, 0.12, 0.045]} size={[0.72, 0.92, 0.035]} color="#34545c" roughness={0.2} metalness={0.2} transparent opacity={0.78} />
      <Box position={[-0.42, 0, 0.07]} size={[0.055, 1.25, 0.08]} color="#d2cbbd" />
      <Box position={[0.42, 0, 0.07]} size={[0.055, 1.25, 0.08]} color="#d2cbbd" />
      <Box position={[0, 0.61, 0.07]} size={[0.9, 0.07, 0.08]} color="#d2cbbd" />
      <Box position={[0.27, 0.02, 0.1]} size={[0.035, 0.035, 0.035]} color="#d5a85f" metalness={0.7} roughness={0.28} />
    </group>
  );
}

function Balcony({ floorBase }: { floorBase: number }) {
  return (
    <group>
      <Box position={[0, floorBase + 0.08, 2.07]} size={[4.92, 0.12, 0.82]} color="#c9c5ba" />
      <Box position={[0, floorBase + 0.59, 2.45]} size={[4.8, 0.055, 0.06]} color="#d6d8d2" metalness={0.32} roughness={0.32} />
      {Array.from({ length: 13 }, (_, index) => (
        <Box
          key={index}
          position={[-2.28 + index * 0.38, floorBase + 0.34, 2.45]}
          size={[0.035, 0.48, 0.04]}
          color="#d6d8d2"
          metalness={0.36}
          roughness={0.3}
        />
      ))}
      <Box position={[-2.4, floorBase + 0.34, 2.06]} size={[0.055, 0.48, 0.78]} color="#d6d8d2" metalness={0.32} roughness={0.32} />
      <Box position={[2.4, floorBase + 0.34, 2.06]} size={[0.055, 0.48, 0.78]} color="#d6d8d2" metalness={0.32} roughness={0.32} />
    </group>
  );
}

function Tree({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.085, 0.86, 8]} />
        <meshStandardMaterial color="#806045" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <sphereGeometry args={[0.38, 12, 10]} />
        <meshStandardMaterial color="#597c61" roughness={0.95} />
      </mesh>
      <mesh position={[-0.2, 0.88, 0.06]} castShadow>
        <sphereGeometry args={[0.24, 10, 8]} />
        <meshStandardMaterial color="#6d8b69" roughness={0.95} />
      </mesh>
      <mesh position={[0.2, 0.9, -0.04]} castShadow>
        <sphereGeometry args={[0.25, 10, 8]} />
        <meshStandardMaterial color="#456e55" roughness={0.95} />
      </mesh>
    </group>
  );
}

function Planter({ position, width = 0.9 }: { position: Vec3; width?: number }) {
  return (
    <group position={position}>
      <Box position={[0, 0.17, 0]} size={[width, 0.34, 0.55]} color="#b6aa98" />
      <Box position={[0, 0.36, 0]} size={[width - 0.12, 0.055, 0.43]} color="#405b48" />
      {[-0.22, 0, 0.22].map((offset) => (
        <mesh key={offset} position={[offset, 0.57, 0]} castShadow>
          <sphereGeometry args={[0.17, 9, 7]} />
          <meshStandardMaterial color={offset === 0 ? "#64856a" : "#496e54"} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function ResidenceModel({ motionEnabled }: { motionEnabled: boolean }) {
  const model = useRef<Group>(null);

  useFrame((_, delta) => {
    if (motionEnabled && model.current) {
      model.current.rotation.y += delta * (Math.PI * 2 / 58);
    }
  });

  const floorBases = [0.36, 1.82, 3.28];
  const floorCenters = [1.12, 2.77, 4.23];

  return (
    <group ref={model} rotation={[0, -0.28, 0]}>
      {/* Site platform and plinth */}
      <Box position={[0, 0.015, 0]} size={[6.8, 0.16, 6.15]} color="#263b3b" roughness={0.96} />
      <Box position={[0, 0.17, 0]} size={[5.25, 0.22, 4.45]} color="#aaa79e" />
      <Box position={[0, 0.31, 0]} size={[4.92, 0.12, 4.12]} color="#e3dfd5" />

      {/* Three-storey architectural shell */}
      {floorBases.map((base, index) => {
        const center = floorCenters[index];
        return (
          <group key={index}>
            <Box position={[0, center, -1.72]} size={[4.42, 1.42, 0.16]} color="#e8e4da" />
            <Box position={[-2.15, center, 0]} size={[0.16, 1.42, 3.58]} color="#e6e1d7" />
            <Box position={[2.15, center, 0]} size={[0.16, 1.42, 3.58]} color="#d8d5cc" />
            <Box position={[-2.08, center, 1.72]} size={[0.16, 1.42, 0.18]} color="#f0ede5" />
            <Box position={[2.08, center, 1.72]} size={[0.16, 1.42, 0.18]} color="#f0ede5" />
            <Box position={[0, center + 0.68, 1.72]} size={[4.0, 0.12, 0.18]} color="#f1eee6" />
            <Box position={[0, center - 0.68, 1.72]} size={[4.0, 0.12, 0.18]} color="#d8d3c8" />
            <Box position={[-0.68, center, 1.73]} size={[0.16, 1.18, 0.18]} color="#e3dfd5" />
            <Box position={[0.68, center, 1.73]} size={[0.16, 1.18, 0.18]} color="#e3dfd5" />

            {index === 0 ? (
              <>
                <FrontWindow position={[-1.36, center + 0.04, 1.83]} width={1.02} height={0.82} />
                <EntranceDoor />
                <FrontWindow position={[1.36, center + 0.04, 1.83]} width={1.02} height={0.82} />
              </>
            ) : (
              <>
                <FrontWindow position={[-1.36, center + 0.02, 1.83]} width={1.02} height={0.9} />
                <FrontWindow position={[0, center + 0.02, 1.83]} width={1.02} height={0.9} />
                <FrontWindow position={[1.36, center + 0.02, 1.83]} width={1.02} height={0.9} />
                <Balcony floorBase={base} />
              </>
            )}

            <SideWindow position={[2.24, center + 0.06, -0.65]} />
            <SideWindow position={[2.24, center + 0.06, 0.72]} />
            <Box position={[1.92, center, 1.82]} size={[0.16, 1.42, 0.18]} color="#9b8064" />
          </group>
        );
      })}

      {/* Floor plates, vertical fins and structural columns */}
      {[0.31, 1.78, 3.24, 4.7].map((y) => (
        <Box key={y} position={[0, y, 0]} size={[4.88, 0.15, 4.0]} color="#c8c3b8" />
      ))}
      {[-2.06, 2.06].map((x) => (
        <Box key={x} position={[x, 2.48, 1.76]} size={[0.18, 4.35, 0.2]} color="#d9d5ca" />
      ))}
      {[-1.88, -1.7, -1.52].map((x) => (
        <Box key={x} position={[x, 2.55, 1.86]} size={[0.055, 4.15, 0.09]} color="#8d7054" />
      ))}

      {/* Entry canopy and broad approach steps */}
      <Box position={[0, 1.75, 2.23]} size={[2.0, 0.14, 1.0]} color="#6f6456" />
      <Box position={[0, 1.68, 2.23]} size={[2.12, 0.055, 1.06]} color="#e0d9cb" />
      {[0, 1, 2].map((step) => (
        <Box
          key={step}
          position={[0, 0.11 + step * 0.12, 2.9 + step * 0.3]}
          size={[2.15, 0.12, 0.34]}
          color="#c7c1b6"
        />
      ))}

      {/* Roof terrace, parapet and light pergola */}
      <Box position={[0, 4.82, 0]} size={[5.08, 0.18, 4.25]} color="#d7d2c7" />
      <Box position={[0, 5.08, -2.02]} size={[5.08, 0.36, 0.12]} color="#e8e3d8" />
      <Box position={[-2.48, 5.08, 0]} size={[0.12, 0.36, 4.05]} color="#e8e3d8" />
      <Box position={[2.48, 5.08, 0]} size={[0.12, 0.36, 4.05]} color="#e8e3d8" />
      {[-1.9, 1.9].map((x) => (
        <Box key={x} position={[x, 5.55, -0.45]} size={[0.12, 0.9, 0.12]} color="#80664d" />
      ))}
      {[-1.9, 0, 1.9].map((x) => (
        <Box key={x} position={[x, 6.02, -0.45]} size={[0.12, 0.12, 2.8]} color="#80664d" />
      ))}
      {[-1.25, -0.4, 0.45, 1.3].map((z) => (
        <Box key={z} position={[0, 6.02, z - 0.45]} size={[4.0, 0.1, 0.1]} color="#9a7d5e" />
      ))}
      <Planter position={[-1.8, 5.0, 1.3]} width={1.1} />
      <Planter position={[1.75, 5.0, 1.3]} width={1.1} />

      {/* Landscaped forecourt */}
      <Planter position={[-2.65, 0.18, 2.0]} width={0.95} />
      <Planter position={[2.65, 0.18, 2.0]} width={0.95} />
      <Tree position={[-2.75, 0.12, -1.75]} scale={0.92} />
      <Tree position={[2.8, 0.12, -1.72]} scale={0.82} />
      <Tree position={[-2.75, 0.12, 2.55]} scale={0.72} />
      <Tree position={[2.8, 0.12, 2.55]} scale={0.78} />

      {/* Low landscape edging and paving strips */}
      <Box position={[-2.85, 0.22, 0]} size={[0.28, 0.35, 5.4]} color="#b7b3a8" />
      <Box position={[2.85, 0.22, 0]} size={[0.28, 0.35, 5.4]} color="#b7b3a8" />
      <Box position={[0, 0.12, -2.78]} size={[5.7, 0.12, 0.24]} color="#9a9a8d" />
    </group>
  );
}

function ArchitectureScene({ motionEnabled }: { motionEnabled: boolean }) {
  return (
    <>
      <ambientLight intensity={1.2} />
      <hemisphereLight args={["#e9f3ff", "#77816e", 0.8]} />
      <directionalLight
        position={[7, 10, 8]}
        intensity={2.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-6, 5, -4]} intensity={0.7} color="#9dc5d7" />
      <pointLight position={[0, 5.5, 5]} intensity={28} distance={18} color="#f3c78e" />
      <ResidenceModel motionEnabled={motionEnabled} />
      <OrbitControls
        target={[0, 2.55, 0]}
        enableDamping
        dampingFactor={0.055}
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI / 3.25}
        maxPolarAngle={Math.PI / 2.08}
      />
    </>
  );
}

export default function HeroBuilding3D() {
  const motionEnabled = typeof window === "undefined"
    ? true
    : !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      className="relative isolate h-[310px] w-full overflow-hidden rounded-[28px] sm:h-[390px] lg:h-[500px]"
      role="img"
      aria-label="A detailed modern three-storey residence rendered in real-time 3D, rotating slowly through a full 360-degree view. Drag to orbit."
      style={{
        background:
          "radial-gradient(ellipse at 50% 42%, rgba(73, 120, 143, .28), transparent 55%), linear-gradient(145deg, rgba(7, 19, 35, .45), rgba(11, 33, 49, .12))",
      }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[28px] border border-white/10" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[76%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/10 [transform:translate(-50%,-50%)_rotateX(68deg)]" />
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [8.7, 6.4, 9.2], fov: 34, near: 0.1, far: 80 }}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        fallback={<div className="flex h-full items-center justify-center text-sm text-white/70">3D preview is not available in this browser.</div>}
      >
        <ArchitectureScene motionEnabled={motionEnabled} />
      </Canvas>

      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/55 px-3 py-2 text-[9px] font-bold tracking-[0.2em] text-cyan-100 shadow-lg backdrop-blur-md sm:left-6 sm:top-6 sm:text-[10px]">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.8)]" />
        LIVE 3D ARCHITECTURE
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 sm:bottom-6 sm:left-6 sm:right-6">
        <div className="rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2.5 text-white/90 shadow-lg backdrop-blur-md">
          <p className="text-[9px] font-semibold tracking-[0.18em] text-cyan-100/80">MODERN RESIDENCE</p>
          <p className="mt-1 text-xs font-medium text-white/90">3 floors · terrace · balconies</p>
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
