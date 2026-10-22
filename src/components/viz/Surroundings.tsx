import type { Env } from "@/lib/viz/environment";

/** Generic procedural context (ground, road, neighbours, trees, a car). Not part of exports; not the real site. */
export default function Surroundings({ env, night }: { env: Env; night: boolean }) {
  const dim = (c: string) => (night ? "#" + [1, 3, 5].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * 0.4).toString(16).padStart(2, "0")).join("") : c);
  return (
    <group name="surroundings">
      {env.items.map((it, i) => {
        if (it.type === "tree") return (
          <group key={i} position={[it.x, 0, it.z]}>
            <mesh position={[0, it.h * 0.2, 0]} castShadow><cylinderGeometry args={[0.15, 0.2, it.h * 0.4, 8]} /><meshStandardMaterial color={dim("#6b4f2a")} /></mesh>
            <mesh position={[0, it.h * 0.65, 0]} castShadow><coneGeometry args={[it.w / 2, it.h * 0.7, 10]} /><meshStandardMaterial color={dim(it.color)} roughness={1} /></mesh>
          </group>
        );
        if (it.type === "road") return <mesh key={i} position={[it.x, 0.01, it.z]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[it.w, it.d]} /><meshStandardMaterial color={dim(it.color)} roughness={1} /></mesh>;
        return <mesh key={i} position={[it.x, it.h / 2, it.z]} castShadow receiveShadow><boxGeometry args={[it.w, it.h, it.d]} /><meshStandardMaterial color={dim(it.color)} roughness={0.9} /></mesh>;
      })}
    </group>
  );
}
