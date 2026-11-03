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

// A continuous extruded C-ring keeps the mark legible even at navbar size.
function createCGeometry() {
  const shape = new THREE.Shape();
  const outer = 0.79;
  const inner = 0.48;
  const start = -0.82;
  const end = Math.PI * 2 + 0.82;
  const segments = 72;

  for (let i = 0; i <= segments; i++) {
    const a = start + ((end - start) * i) / segments;
    const x = Math.cos(a) * outer;
    const y = Math.sin(a) * outer;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (let i = segments; i >= 0; i--) {
    const a = start + ((end - start) * i) / segments;
    shape.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.16, bevelEnabled: true, bevelSegments: 4,
    steps: 1, bevelSize: 0.035, bevelThickness: 0.035, curveSegments: 32,
  });
}

function createAGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.43, -0.59);
  shape.lineTo(-0.08, 0.57);
  shape.quadraticCurveTo(0, 0.69, 0.08, 0.57);
  shape.lineTo(0.46, -0.59);
  shape.lineTo(0.20, -0.59);
  shape.lineTo(0.11, -0.29);
  shape.lineTo(-0.14, -0.29);
  shape.lineTo(-0.23, -0.59);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.15, bevelEnabled: true, bevelSegments: 4,
    steps: 1, bevelSize: 0.025, bevelThickness: 0.025, curveSegments: 24,
  });
}

function Emblem({ mode, onComplete }: { mode: "loop" | "intro"; onComplete?: () => void }) {
  const emblem = useRef<THREE.Group>(null);
  const orbit = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  const completed = useRef(false);
  const callback = useRef(onComplete);
  const reducedMotion = useRef(false);
  const cGeometry = useMemo(createCGeometry, []);
  const aGeometry = useMemo(createAGeometry, []);

  useEffect(() => { callback.current = onComplete; }, [onComplete]);
  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => { cGeometry.dispose(); aGeometry.dispose(); };
  }, [cGeometry, aGeometry]);

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (orbit.current && !reducedMotion.current) {
      orbit.current.rotation.z += delta * (mode === "intro" ? 0.78 : 0.24);
    }
    if (!emblem.current) return;

    if (mode === "loop") {
      emblem.current.rotation.y = reducedMotion.current ? -0.12 : Math.sin(elapsed.current * 0.52) * 0.18;
      emblem.current.rotation.x = Math.sin(elapsed.current * 0.7) * 0.025;
      return;
    }

    const duration = 4.6;
    const p = reducedMotion.current ? 1 : Math.min(elapsed.current / duration, 1);
    // 2.5 fast revolutions, then a short front-facing settle.
    const spinP = Math.min(p / 0.82, 1);
    const spin = THREE.MathUtils.easeOutCubic(spinP) * Math.PI * 5;
    const settleP = Math.max(0, (p - 0.82) / 0.18);
    const settle = THREE.MathUtils.easeOutCubic(settleP) * Math.PI;
    emblem.current.rotation.y = spin + settle;
    emblem.current.rotation.x = Math.sin(p * Math.PI) * 0.045;
    emblem.current.position.y = p < 0.82 ? Math.sin(p * Math.PI * 2) * 0.08 : 0;
    if (p >= 1 && !completed.current) {
      completed.current = true;
      callback.current?.();
    }
  });

  return (
    <>
      <ambientLight intensity={0.8} />
      <hemisphereLight args={["#dff8ff", "#07152f", 1.1]} />
      <directionalLight position={[3, 4, 6]} intensity={3.2} color="#f2fbff" />
      <directionalLight position={[-4, 1, -3]} intensity={2.4} color="#087dff" />
      <pointLight position={[2, -2, 3]} intensity={12} distance={7} color="#16dfff" />
      <pointLight position={[-2, 2, -2]} intensity={9} distance={6} color="#ff922e" />

      <group ref={orbit}>
        <mesh rotation={[Math.PI / 2.25, 0.12, 0.2]}>
          <torusGeometry args={[1.42, 0.009, 8, 144]} />
          <meshBasicMaterial color="#22dfff" transparent opacity={0.82} />
        </mesh>
        <mesh rotation={[Math.PI / 2.7, 0.6, 1.1]}>
          <torusGeometry args={[1.55, 0.008, 8, 144]} />
          <meshBasicMaterial color="#ff9a3c" transparent opacity={0.72} />
        </mesh>
      </group>

      <group ref={emblem}>
        <RoundedBox args={[2.12, 2.12, 0.32]} radius={0.34} smoothness={10} position={[0, 0, -0.13]} castShadow receiveShadow>
          <meshPhysicalMaterial color="#071b42" metalness={0.88} roughness={0.2} clearcoat={1} clearcoatRoughness={0.12} />
        </RoundedBox>
        <RoundedBox args={[2.02, 2.02, 0.075]} radius={0.29} smoothness={10} position={[0, 0, 0.065]}>
          <meshPhysicalMaterial color="#0a2b61" metalness={0.72} roughness={0.24} clearcoat={1} emissive="#063b83" emissiveIntensity={0.22} />
        </RoundedBox>
        <mesh position={[0, 0, 0.112]}>
          <torusGeometry args={[0.91, 0.018, 10, 120]} />
          <meshBasicMaterial color="#27dfff" />
        </mesh>
        <mesh geometry={cGeometry} position={[-0.24, 0.015, 0.19]}>
          <meshPhysicalMaterial color="#18dfff" metalness={0.78} roughness={0.16} clearcoat={1} emissive="#007b9d" emissiveIntensity={0.22} />
        </mesh>
        <mesh geometry={aGeometry} position={[0.38, -0.04, 0.34]} scale={[0.88, 0.92, 1]}>
          <meshPhysicalMaterial color="#f4fbff" metalness={0.78} roughness={0.17} clearcoat={1} emissive="#0c74a8" emissiveIntensity={0.16} />
        </mesh>
        <mesh position={[0.38, -0.04, 0.53]}>
          <boxGeometry args={[0.25, 0.065, 0.035]} />
          <meshBasicMaterial color="#ff9a3c" />
        </mesh>
        <mesh position={[0.38, 0.24, 0.52]}>
          <sphereGeometry args={[0.045, 20, 20]} />
          <meshBasicMaterial color="#ffad57" />
        </mesh>
        <mesh position={[0, -0.82, 0.13]}>
          <boxGeometry args={[1.35, 0.018, 0.018]} />
          <meshBasicMaterial color="#ff9a3c" />
        </mesh>
      </group>
    </>
  );
}

export default function AnimatedLogo({ size = 260, mode = "loop", onComplete }: AnimatedLogoProps) {
  const style = { width: size, height: size, "--logo-size": `${size}px` } as CSSProperties;
  return (
    <div className={`animated-logo-scene animated-logo-scene--${mode}`} style={style} role="img" aria-label="CivilOS AI three-dimensional emblem">
      <div className="animated-logo-glow" aria-hidden="true" />
      <div className="animated-logo-shadow" aria-hidden="true" />
      <Canvas
        dpr={size <= 64 ? [1, 1.25] : [1, 1.5]}
        camera={{ position: [0, 0, 5.35], fov: 34 }}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        style={{ background: "transparent" }}
      >
        <Emblem mode={mode} onComplete={onComplete} />
      </Canvas>
    </div>
  );
}
