/**
 * Minimal, removable third-party 3D city embed.
 * Only the interactive 3D model is rendered—no title, description,
 * attribution link, external navigation button, or promotional copy.
 */
const SmartCity3DShowcase = () => (
  <section
    aria-label="Interactive 3D smart city model"
    className="w-full bg-slate-950 py-6 sm:py-10"
    data-testid="smart-city-3d-showcase"
  >
    <div className="container mx-auto">
      <div className="relative mx-auto aspect-video min-h-[260px] w-full max-w-7xl overflow-hidden rounded-xl bg-slate-900 sm:min-h-[380px] sm:rounded-2xl lg:min-h-[520px]">
        <iframe
          title="Interactive 3D smart city model"
          src="https://sketchfab.com/models/3771e0bb8e7f49c5bbad3ec91e978d19/embed"
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; fullscreen; xr-spatial-tracking"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>
  </section>
);

export default SmartCity3DShowcase;
