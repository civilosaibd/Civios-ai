import { useCallback, useEffect, useRef } from "react";
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
  const start = -0.92;
  const end = 0.92;
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const angle = start + (Math.PI * 2 - start - end) * (i / steps);
    const x = Math.cos(angle) * outerRadius;
    const y = Math.sin(angle) * outerRadius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const angle = start + (Math.PI * 2 - start - end) * (i / steps);
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

function Building({ position, scale, color }: { position: [number, number, number]; scale: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={scale} />
        <meshStandardMaterial color={color} metalness={0.72} roughness={0.27} emissive={color} emissiveIntensity={0.16} />
      </mesh>
      {Array.from({ length: 3 }, (_, i) => (
        <mesh key={i} position={[0, -scale[1] / 2 + 0.18 + i * 0.24, scale[2] / 2 + 0.008]}>
          <boxGeometry args={[scale[0] * 0.55, 0.035, 0.012]} />
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
      rotatingGroup.current.rotation.y = reducedMotion.current ? -0.18 : elapsed.current * (Math.PI * 2 / 6);
      rotatingGroup.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.7) * 0.035;
      return;
    }

    const duration = 4.5;
    const progress = reducedMotion.current ? 1 : Math.min(elapsed.current / duration, 1);
    const eased = progress < 0.82
      ? progress / 0.82
      : 1 - Math.pow(1 - (progress - 0.82) / 0.18, 3) * 0.04;
    rotatingGroup.current.rotation.y = eased * Math.PI * 5;
    rotatingGroup.current.rotation.x = Math.sin(progress * Math.PI) * 0.035;
    if (progress >= 1 && !completed.current) {
      completed.current = true;
      callback.current?.();
    }
  });

  const cGeometry = useRef(new THREE.ExtrudeGeometry(makeCShape(), extrudeSettings));
  const aGeometry = useRef(new THREE.ExtrudeGeometry(makeAShape(), extrudeSettings));

  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[3, 4, 5]} intensity={2.4} color="#d9f8ff" />
      <pointLight position={[-2, 1, 2]} intensity={18} distance={7} color="#08cfff" />
      <pointLight position={[2, -1, -2]} intensity={12} distance={6} color="#ff8b32" />

      <group ref={orbitGroup}>
        <mesh rotation={[Math.PI / 2.45, 0, 0]}>
          <torusGeometry args={[1.48, 0.012, 8, 120]} />
          <meshBasicMaterial color="#22e0ff" />
        </mesh>
        <mesh rotation={[Math.PI / 2.45, 0, Math.PI / 2]}>
          <torusGeometry args={[1.62, 0.012, 8, 120]} />
          <meshBasicMaterial color="#ff9a3c" />
        </mesh>
      </group>

      <group ref={rotatingGroup} scale={1.04}>
        <RoundedBox args={[2.22, 2.22, 0.3]} radius={0.34} smoothness={8} position={[0, 0, -0.12]} castShadow receiveShadow>
          <meshPhysicalMaterial color="#061b55" metalness={0.82} roughness={0.2} clearcoat={1} clearcoatRoughness={0.12} />
        </RoundedBox>
        <RoundedBox args={[2.16, 2.16, 0.045]} radius={0.31} smoothness={8} position={[0, 0, 0.055]}>
          <meshPhysicalMaterial color="#082d83" metalness={0.55} roughness={0.24} clearcoat={1} emissive="#063caa" emissiveIntensity={0.35} />
        </RoundedBox>
        <mesh position={[0, 0, 0.09]}>
          <torusGeometry args={[1.04, 0.025, 10, 100]} />
          <meshBasicMaterial color="#22e0ff" />
        </mesh>
        <mesh position={[0, 0, 0.095]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[1.04, 0.018, 10, 100]} />
          <meshBasicMaterial color="#ff9a3c" />
        </mesh>

        <group position={[0, 0.32, 0.12]}>
          <Building position={[-0.69, 0.2, -0.03]} scale={[0.24, 0.9, 0.16]} color="#0878db" />
          <Building position={[-0.37, 0.36, -0.02]} scale={[0.28, 1.2, 0.17]} color="#12b9ed" />
          <Building position={[0.0, 0.24, -0.04]} scale={[0.32, 0.98, 0.16]} color="#1455c6" />
          <Building position={[0.45, 0.38, -0.03]} scale={[0.28, 1.24, 0.17]} color="#ff8a25" />
          <Building position={[0.76, 0.12, -0.04]} scale={[0.2, 0.72, 0.15]} color="#0878db" />
        </group>

        <mesh geometry={cGeometry.current} position={[-0.28, -0.13, 0.31]} rotation={[0, 0, 0]}>
          <meshPhysicalMaterial color="#18dfff" metalness={0.72} roughness={0.18} clearcoat={1} emissive="#007ba9" emissiveIntensity={0.48} />
        </mesh>
        <mesh geometry={aGeometry.current} position={[0.43, -0.17, 0.42]} scale={[0.9, 1, 1]}>
          <meshPhysicalMaterial color="#f4fbff" metalness={0.78} roughness={0.18} clearcoat={1} emissive="#0a7fc0" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0.43, -0.17, 0.61]}>
          <boxGeometry args={[0.34, 0.075, 0.035]} />
          <meshBasicMaterial color="#22e0ff" />
        </mesh>
        <mesh position={[0.43, 0.22, 0.62]}>
          <sphereGeometry args={[0.075, 16, 16]} />
          <meshBasicMaterial color="#22e0ff" />
        </mesh>
        <mesh position={[0.43, 0.22, 0.62]}>
          <torusGeometry args={[0.11, 0.014, 8, 24]} />
          <meshBasicMaterial color="#22e0ff" />
        </mesh>

        <mesh position={[0, -0.86, 0.16]} rotation={[0, 0, -0.04]}>
          <boxGeometry args={[1.7, 0.035, 0.035]} />
          <meshBasicMaterial color="#ff9a3c" />
        </mesh>
        <mesh position={[0, -0.99, 0.16]}>
          <boxGeometry args={[1.4, 0.028, 0.028]} />
          <meshBasicMaterial color="#22e0ff" />
        </mesh>
      </group>
    </>
  );
}

export default function AnimatedLogo({ size = 260, mode = "loop", onComplete }: AnimatedLogoProps) {
  const style = { width: size, height: size, "--logo-size": `${size}px` } as CSSProperties;
  const handleCreated = useCallback(() => undefined, []);

  return (
    <div className={`animated-logo-scene animated-logo-scene--${mode}`} style={style} role="img" aria-label="CivilOS AI three-dimensional animated emblem">
      <div className="animated-logo-glow" aria-hidden="true" />
      <div className="animated-logo-shadow" aria-hidden="true" />
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 5.25], fov: 34 }}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        onCreated={handleCreated}
        style={{ background: "transparent" }}
      >
        <CivilOSMark mode={mode} onComplete={onComplete} />
      </Canvas>
    </div>
  );
}
