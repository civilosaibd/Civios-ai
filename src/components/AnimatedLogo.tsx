import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import "./AnimatedLogo.css";

export interface AnimatedLogoProps {
  size?: number;
  mode?: "loop" | "intro";
  onComplete?: () => void;
}

/**
 * The front artwork is the exact official icon used by the homepage navbar.
 * 3D depth is added behind it; the source artwork itself is never redrawn.
 */
function OfficialLogoBadge({ mode, onComplete }: { mode: "loop" | "intro"; onComplete?: () => void }) {
  const badge = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  const completed = useRef(false);
  const callback = useRef(onComplete);
  const reducedMotion = useRef(false);
  const logoTexture = useLoader(THREE.TextureLoader, "/branding/civilos-ai-icon-512.png");

  useEffect(() => { callback.current = onComplete; }, [onComplete]);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    logoTexture.colorSpace = THREE.SRGBColorSpace;
    logoTexture.anisotropy = 8;
    logoTexture.needsUpdate = true;
  }, [logoTexture]);

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (!badge.current) return;

    if (mode === "loop") {
      badge.current.rotation.y = reducedMotion.current ? 0 : Math.sin(elapsed.current * 0.52) * 0.13;
      badge.current.rotation.x = reducedMotion.current ? 0 : Math.sin(elapsed.current * 0.7) * 0.018;
      return;
    }

    const duration = 3.8;
    const progress = reducedMotion.current ? 1 : Math.min(elapsed.current / duration, 1);
    const spinProgress = Math.min(progress / 0.78, 1);
    const spin = THREE.MathUtils.easeOutCubic(spinProgress) * Math.PI * 4;
    const settleProgress = Math.max(0, (progress - 0.78) / 0.22);
    const settle = THREE.MathUtils.easeOutCubic(settleProgress) * Math.PI * 2;
    badge.current.rotation.y = spin + settle;
    badge.current.position.y = progress < 0.78 ? Math.sin(progress * Math.PI * 2) * 0.07 : 0;

    if (progress >= 1 && !completed.current) {
      completed.current = true;
      callback.current?.();
    }
  });

  return (
    <>
      <ambientLight intensity={0.9} />
      <hemisphereLight args={["#e8faff", "#07152f", 1.05]} />
      <directionalLight position={[3, 4, 6]} intensity={2.8} color="#ffffff" />
      <directionalLight position={[-4, 1, -3]} intensity={1.8} color="#168cff" />
      <pointLight position={[2, -2, 3]} intensity={8} distance={7} color="#16dfff" />
      <pointLight position={[-2, 2, -2]} intensity={6} distance={6} color="#ff922e" />

      <group ref={badge}>
        <RoundedBox args={[2.08, 2.08, 0.34]} radius={0.3} smoothness={10} position={[0, 0, -0.12]} castShadow receiveShadow>
          <meshPhysicalMaterial
            color="#071b42"
            metalness={0.86}
            roughness={0.2}
            clearcoat={1}
            clearcoatRoughness={0.12}
          />
        </RoundedBox>

        <RoundedBox args={[1.98, 1.98, 0.07]} radius={0.26} smoothness={10} position={[0, 0, 0.065]}>
          <meshPhysicalMaterial
            color="#0a2b61"
            metalness={0.68}
            roughness={0.23}
            clearcoat={1}
            emissive="#063b83"
            emissiveIntensity={0.18}
          />
        </RoundedBox>

        {/* Exact homepage icon artwork, used as the badge's front-face texture. */}
        <mesh position={[0, 0, 0.112]}>
          <planeGeometry args={[1.78, 1.78]} />
          <meshBasicMaterial map={logoTexture} transparent toneMapped={false} />
        </mesh>

        <mesh position={[0, 0, 0.105]}>
          <torusGeometry args={[1.015, 0.012, 8, 120]} />
          <meshBasicMaterial color="#28dfff" transparent opacity={0.78} />
        </mesh>
      </group>
    </>
  );
}

export default function AnimatedLogo({ size = 260, mode = "loop", onComplete }: AnimatedLogoProps) {
  const style = { width: size, height: size, "--logo-size": `${size}px` } as CSSProperties;
  return (
    <div
      className={`animated-logo-scene animated-logo-scene--${mode}`}
      style={style}
      role="img"
      aria-label="Official CivilOS AI logo in a three-dimensional animated badge"
    >
      <div className="animated-logo-glow" aria-hidden="true" />
      <div className="animated-logo-shadow" aria-hidden="true" />
      <Canvas
        dpr={size <= 64 ? [1, 1.25] : [1, 1.5]}
        camera={{ position: [0, 0, 5.35], fov: 34 }}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        style={{ background: "transparent" }}
      >
        <OfficialLogoBadge mode={mode} onComplete={onComplete} />
      </Canvas>
    </div>
  );
}
