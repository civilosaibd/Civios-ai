/**
 * Full-width interactive 3D city viewer.
 * No surrounding heading, description, caption, attribution block, or promo content.
 */
const SmartCity3DShowcase = () => (
  <section
    aria-label="Interactive 3D city"
    className="w-full"
    data-testid="smart-city-3d-showcase"
  >
    <div className="relative h-[72vh] min-h-[520px] max-h-[980px] w-full overflow-hidden bg-black sm:h-[78vh] sm:min-h-[620px] lg:h-[82vh]">
      <iframe
        title="Interactive 3D city"
        src="https://sketchfab.com/models/3771e0bb8e7f49c5bbad3ec91e978d19/embed?autostart=1&preload=1&ui_infos=0&ui_hint=0&ui_watermark_link=0&ui_controls=1&ui_fullscreen=1"
        className="absolute inset-0 h-full w-full border-0"
        allow="autoplay; fullscreen; xr-spatial-tracking"
        allowFullScreen
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  </section>
);

export default SmartCity3DShowcase;
