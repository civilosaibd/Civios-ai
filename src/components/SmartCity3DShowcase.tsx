import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, RadioTower, Sparkles } from "lucide-react";

/**
 * Optional third-party 3D showcase.
 * This component is intentionally isolated so the section can be removed
 * without affecting the homepage hero or the native 3D city experience.
 */
const SmartCity3DShowcase = () => {
  const reduceMotion = useReducedMotion();

  return (
    <section
      aria-labelledby="smart-city-showcase-title"
      className="relative overflow-hidden border-y border-slate-200/70 bg-slate-950 py-16 text-white sm:py-20"
      data-testid="smart-city-3d-showcase"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(148,163,184,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.35)_1px,transparent_1px)] [background-size:44px_44px]" />
      </div>

      <div className="container relative mx-auto">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.55 }}
          className="mx-auto mb-9 max-w-3xl text-center"
        >
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-cyan-200">
            <Sparkles className="h-3.5 w-3.5" />
            FUTURE CITY TECHNOLOGY
          </span>
          <h2
            id="smart-city-showcase-title"
            className="font-heading text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
          >
            Explore the connected city of tomorrow
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Take an interactive look at how 5G connectivity can help power
            smarter urban experiences, infrastructure and services.
          </p>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 22, scale: 0.99 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.12 }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="mx-auto max-w-6xl"
        >
          <div className="overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl shadow-black/30 sm:rounded-3xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
                  <RadioTower className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Intel 5G Tech: Powering the cities of the future
                  </p>
                  <p className="text-xs text-slate-400">
                    Interactive 3D model · Hosted by Sketchfab
                  </p>
                </div>
              </div>
              <a
                href="https://sketchfab.com/3d-models/intel-5g-tech-powering-the-cities-of-the-future-3771e0bb8e7f49c5bbad3ec91e978d19"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-300/50 hover:bg-white/5 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                View on Sketchfab
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="relative aspect-video min-h-[260px] w-full bg-slate-900 sm:min-h-[380px] lg:min-h-[520px]">
              <iframe
                title="Intel 5G Tech: Powering the cities of the future — interactive 3D model"
                src="https://sketchfab.com/models/3771e0bb8e7f49c5bbad3ec91e978d19/embed"
                className="absolute inset-0 h-full w-full border-0"
                allow="autoplay; fullscreen; xr-spatial-tracking"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </div>

          <p className="mt-3 text-center text-xs leading-5 text-slate-400">
            Third-party 3D content by Sketchfab. The model is an illustrative
            showcase and is not live CivilOS AI city data.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default SmartCity3DShowcase;
