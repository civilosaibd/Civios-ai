import { useEffect } from "react";

/** Lightweight site-wide engineering atmosphere; avoids a permanent WebGL canvas on low-end phones. */
const ImmersiveEngineeringBackground = () => {
  useEffect(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        root.style.setProperty("--site-scroll-progress", String(window.scrollY / maxScroll));
      });
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || reduceMotion.matches) return;
      root.style.setProperty("--site-pointer-x", String((event.clientX / window.innerWidth - 0.5) * 2));
      root.style.setProperty("--site-pointer-y", String((event.clientY / window.innerHeight - 0.5) * 2));
    };
    if (!reduceMotion.matches) {
      window.addEventListener("scroll", update, { passive: true });
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      update();
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);
  return (
    <div className="site-engineering-atmosphere" aria-hidden="true">
      <div className="site-atmosphere-glow site-atmosphere-glow--blue" />
      <div className="site-atmosphere-glow site-atmosphere-glow--cyan" />
      <div className="site-engineering-grid" />
      <div className="site-wireframe site-wireframe--one"><span /></div>
      <div className="site-wireframe site-wireframe--two"><span /></div>
      <div className="site-orbit site-orbit--one"><i /><i /><i /></div>
      <div className="site-orbit site-orbit--two"><i /><i /></div>
      <div className="site-depth-line site-depth-line--one" />
      <div className="site-depth-line site-depth-line--two" />
    </div>
  );
};
export default ImmersiveEngineeringBackground;
