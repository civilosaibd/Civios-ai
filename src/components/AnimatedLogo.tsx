import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import "./AnimatedLogo.css";

export interface AnimatedLogoProps {
  size?: number;
  mode?: "loop" | "intro";
  onComplete?: () => void;
}

function makeCShape() {
  const shape = new THREE.Shape();
  const outerRadius = 0.78;
  const innerRadius = 0.43;
  // Opening faces right, angled slightly down-right for a dynamic feel.
  const gapStart = -0.75;
  const gapEnd = 0.75;
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const angle = gapStart + (Math.PI * 2 - gapStart - gapEnd) * (i / steps);
    const x = Math.cos(angle) * outerRadius;
    const y = Math.sin(angle) * outerRadius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const angle = gapStart + (Math.PI * 2 - gapStart - gapEnd) * (i / steps);
    shape.lineTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
  }
  shape.closePath();
  return shape;
}

function makeAShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.58, -0.66);
  shape.lineTo(-0.12, 0.68);
  shape.lineTo(0.12, 0.68);
  shape.lineTo(0.62, -0.66);
  shape.lineTo(0.34, -0.66);
  shape.lineTo(0.22, -0.28);
  shape.lineTo(-0.22, -0.28);
  shape.lineTo(-0.34, -0.66);
  shape.closePath();
  return shape;
}

const extrudeSettings: THREE.ExtrudeGeometryOptions = {
  depth: 0.16,
  bevelEnabled: true,
  bevelSegments: 3,
  steps: 1,
  bevelSize: 0.035,
  bevelThickness: 0.035,
  curveSegments: 24,
};

interface BuildingSpec {
  x: number;
  h: number;
  w: number;
  color: string;
}

// Skyline strip sits at the bottom of the badge face, behind the letters.
const buildings: BuildingSpec[] = [
  { x: -0.66, h: 0.56, w: 0.17, color: "#0a5fd8" },
  { x: -0.32, h: 0.88, w: 0.2, color: "#12b9ed" },
  { x: 0.64, h: 0.72, w: 0.17, color: "#ff8a25" },
  { x: 0.94, h: 0.52, w: 0.14, color: "#0a5fd8" },
];

const BASELINE = -0.64;

function Building({ spec }: { spec: BuildingSpec }) {
  const { x, h, w, color } = spec;
  return (
    <group position={[x, BASELINE + h / 2, 0]}>
      <mesh>
        <boxGeometry args={[w, h, 0.1]} />
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      {Array.from({ length: Math.max(2, Math.round(h / 0.28)) }, (_, i) => (
        <mesh key={i} position={[0, -h / 2 + 0.14 + i * 0.26, 0.052]}>
          <boxGeometry args={[w * 0.5, 0.03, 0.01]} />
          <meshBasicMaterial color="#8beeff" />
        </mesh>
      ))}
    </group>
  );
}

function CivilOSMark({ mode, onComplete }: { mode: "loop" | "intro"; onComplete?: () => void }) {
  const rotatingGroup = useRef<THREE.Group>(null);
  const orbitGroup = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  const completed = useRef(false);
  const callback = useRef(onComplete);
  const reducedMotion = useRef(false);

  useEffect(() => { callback.current = onComplete; }, [onComplete]);
  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useFrame((state, delta) => {
    elapsed.current += delta;
    if (orbitGroup.current && !reducedMotion.current) {
      orbitGroup.current.rotation.z += delta * (mode === "loop" ? 0.72 : 1.15);
    }
    if (!rotatingGroup.current) return;

    if (mode === "loop") {
      // Gentle oscillation keeps the decorated face visible at all times.
      rotatingGroup.current.rotation.y = reducedMotion.current
        ? -0.18
        : Math.sin(elapsed.current * 0.9) * 0.42;
      rotatingGroup.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.7) * 0.03;
      return;
    }

    // Intro: badge opens from an edge-on pose straight to face-on, so the
    // undecorated back of the slab is never shown to the viewer.
    const duration = 4.5;
    const progress = reducedMotion.current ? 1 : Math.min(elapsed.current / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const startAngle = -1.12 * (Math.PI / 2);
    rotatingGroup.current.rotation.y = (1 - eased) * startAngle;
    rotatingGroup.current.rotation.x = Math.sin(progress * Math.PI) * 0.03;
    const s = 0.94 + 0.08 * eased;
    rotatingGroup.current.scale.setScalar(s);
    if (progress >= 1 && !completed.current) {
      completed.current = true;
      callback.current?.();
    }
  });

  const cGeometry = useMemo(() => new THREE.ExtrudeGeometry(makeCShape(), extrudeSettings), []);
  const aGeometry = useMemo(() => new THREE.ExtrudeGeometry(makeAShape(), extrudeSettings), []);

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} color="#d9f8ff" />
      <pointLight position={[-2.4, 1.6, 2.4]} intensity={16} distance={8} color="#08cfff" />
      <pointLight position={[2.4, -1.4, 1.8]} intensity={10} distance={7} color="#ff8b32" />

      {/* Rings orbit clearly outside the badge — never slicing through the mark */}
      <group ref={orbitGroup}>
        <mesh rotation={[Math.PI / 2.6, 0, 0]}>
          <torusGeometry args={[1.86, 0.014, 8, 120]} />
          <meshBasicMaterial color="#22e0ff" />
        </mesh>
        <mesh rotation={[Math.PI / 2.6, 0, Math.PI / 2]}>
          <torusGeometry args={[2.0, 0.011, 8, 120]} />
          <meshBasicMaterial color="#ff9a3c" />
        </mesh>
      </group>

      <group ref={rotatingGroup} scale={1.02}>
        {/* Badge: deep navy slab with a glossy blue face */}
        <RoundedBox args={[2.14, 2.14, 0.3]} radius={0.34} smoothness={8} position={[0, 0, -0.12]} castShadow receiveShadow>
          <meshPhysicalMaterial color="#061b55" metalness={0.82} roughness={0.2} clearcoat={1} clearcoatRoughness={0.12} />
        </RoundedBox>
        <RoundedBox args={[2.06, 2.06, 0.05]} radius={0.32} smoothness={8} position={[0, 0, 0.05]}>
          <meshPhysicalMaterial color="#082d83" metalness={0.55} roughness={0.24} clearcoat={1} emissive="#063caa" emissiveIntensity={0.32} />
        </RoundedBox>

        {/* Skyline strip, contained inside the badge */}
        {buildings.map((b) => (
          <Building key={b.x} spec={b} />
        ))}

        {/* Letters share one baseline, side by side, centered as a pair */}
        <group position={[-0.05, 0.06, 0.12]}>
          <mesh geometry={cGeometry} position={[-0.34, 0.02, 0.02]} scale={0.66}>
            <meshPhysicalMaterial color="#18dfff" metalness={0.72} roughness={0.18} clearcoat={1} emissive="#007ba9" emissiveIntensity={0.48} />
          </mesh>
          <mesh geometry={aGeometry} position={[0.44, 0.06, 0.02]} scale={0.86}>
            <meshPhysicalMaterial color="#f4fbff" metalness={0.78} roughness={0.18} clearcoat={1} emissive="#0a7fc0" emissiveIntensity={0.3} />
          </mesh>
        </group>

        {/* Crossbar dot above the A */}
        <mesh position={[0.41, 0.62, 0.14]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial color="#22e0ff" />
        </mesh>
        <mesh position={[0.41, 0.62, 0.14]}>
          <torusGeometry args={[0.105, 0.013, 8, 24]} />
          <meshBasicMaterial color="#22e0ff" />
        </mesh>

        {/* Ground lines under the skyline, inside the badge */}
        <mesh position={[0, -0.88, 0.1]} rotation={[0, 0, -0.03]}>
          <boxGeometry args={[1.66, 0.032, 0.032]} />
          <meshBasicMaterial color="#ff9a3c" />
        </mesh>
        <mesh position={[0, -0.97, 0.1]}>
          <boxGeometry args={[1.34, 0.026, 0.026]} />
          <meshBasicMaterial color="#22e0ff" />
        </mesh>
      </group>
    </>
  );
}

export default function AnimatedLogo({ size = 260, mode = "loop", onComplete }: AnimatedLogoProps) {
  const style = { width: size, height: size, "--logo-size": `${size}px` } as CSSProperties;
  return (
    <div className={`animated-logo-scene animated-logo-scene--${mode}`} style={style} role="img" aria-label="CivilOS AI three-dimensional animated emblem">
      <div className="animated-logo-glow" aria-hidden="true" />
      <div className="animated-logo-shadow" aria-hidden="true" />
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 5.25], fov: 34 }}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        style={{ background: "transparent" }}
      >
        <CivilOSMark mode={mode} onComplete={onComplete} />
      </Canvas>
    </div>
  );
}
