import { lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Play, ArrowRight, Sparkles, Zap, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import LiveUsers from "@/components/LiveUsers";

const HeroBuilding3D = lazy(() => import("@/components/HeroBuilding3D"));

const BRAND_ICON = "/branding/civilos-ai-icon-512.png";
const BRAND_ICON_LARGE = "/branding/civilos-ai-icon-1024.png";

const BuildingShowcase = () => (
  <Suspense
    fallback={
      <div className="flex h-[310px] w-full items-center justify-center rounded-[28px] border border-white/10 bg-slate-950/30 text-sm text-white/70 sm:h-[390px] lg:h-[500px]">
        Preparing architectural 3D preview…
      </div>
    }
  >
    <HeroBuilding3D />
  </Suspense>
);

const HeroSection = () => {
  const { t } = useI18n();
  return (
    <section className="bg-hero relative overflow-hidden min-h-[calc(100svh-4rem)] flex items-center">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-10 -left-20 w-[28rem] h-[28rem] bg-accent/30 rounded-full blur-3xl animate-blob" />
        <div className="absolute bottom-0 -right-20 w-[32rem] h-[32rem] bg-primary-glow/40 rounded-full blur-3xl animate-blob" style={{ animationDelay: "4s" }} />
        <div className="absolute top-1/3 left-1/2 w-[20rem] h-[20rem] bg-accent-glow/20 rounded-full blur-3xl animate-blob" style={{ animationDelay: "8s" }} />
      </div>

      <div className="container relative py-10 sm:py-14 lg:py-16 w-full">
        <div className="grid items-center gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-4">
          <div className="relative z-10 max-w-2xl mx-auto text-center lg:text-left space-y-5 sm:space-y-6">
            <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7 }} className="flex justify-center lg:justify-start">
              <img src={BRAND_ICON} srcSet={`${BRAND_ICON} 512w, ${BRAND_ICON_LARGE} 1024w`} sizes="(max-width: 640px) 112px, (max-width: 1024px) 132px, 150px" width={512} height={512} alt="CivilOS AI — AI operating system for civil engineers" fetchPriority="high" decoding="async" className="brand-hero-logo h-auto w-28 sm:w-32 lg:w-36" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.08 }} className="flex justify-center lg:justify-start">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-white/10 text-white border border-white/20 backdrop-blur-md"><Sparkles className="h-3.5 w-3.5 text-accent" />{t("hero.badge")}</span>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.16 }} className="text-gradient-hero text-4xl sm:text-5xl md:text-6xl lg:text-6xl xl:text-7xl font-heading font-bold leading-[1.05]">
              {t("hero.title")}
            </motion.h1>
            <motion.p className="text-primary-foreground/75 text-lg md:text-xl max-w-2xl mx-auto lg:mx-0 leading-relaxed" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.24 }}>{t("hero.subtitle")}</motion.p>
            <motion.div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.34 }}>
              <Button variant="hero" size="lg" asChild className="shadow-glow-accent animate-pulse-glow"><Link to="/upload"><Upload className="h-5 w-5 mr-1" />{t("hero.upload")}<ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
              <Button variant="heroOutline" size="lg" asChild><Link to="/estimate/demo"><Play className="h-5 w-5 mr-1" />{t("hero.tryDemo")}</Link></Button>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.45 }} className="flex justify-center lg:justify-start pt-1"><LiveUsers /></motion.div>
            <motion.div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 pt-5 text-sm text-primary-foreground/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.55 }}>
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" />{t("hero.free")}</span>
              <span className="inline-flex items-center gap-2"><Zap className="h-4 w-4 text-accent" />{t("hero.instant")}</span>
              <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" />{t("hero.pdf")}</span>
            </motion.div>
          </div>
          <motion.div className="relative w-full max-w-[620px] mx-auto lg:max-w-none" initial={{ opacity: 0, x: 24, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 1, delay: 0.2 }}>
            <BuildingShowcase />
          </motion.div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-background pointer-events-none" />
    </section>
  );
};

export default HeroSection;
