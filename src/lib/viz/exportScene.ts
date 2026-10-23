import * as THREE from "three";

/**
 * A copy of `root` containing only what the viewer currently SHOWS (layers, floor isolation, construction stage).
 * three's OBJ/STL exporters ignore `visible`, so every export format goes through this.
 * Geometry is shared with the original (do not dispose the clone's geometries).
 */
export function visibleClone(root: THREE.Object3D): THREE.Group {
  root.updateWorldMatrix(true, true);
  const out = new THREE.Group(); out.name = `${root.name || "model"}-export`;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
    const c = new THREE.Mesh(m.geometry, m.material);
    c.name = m.name; c.userData = { ...m.userData };
    m.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    out.add(c);
  });
  out.updateMatrixWorld(true);
  return out;
}
