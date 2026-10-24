import { useEffect, useState } from "react";
import CivilOSLogo from "@/components/CivilOSLogo";

const SESSION_KEY = "civilos-logo-intro-seen";

const AnimatedLogoIntro = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;
      window.sessionStorage.setItem(SESSION_KEY, "1");
      setVisible(true);
      const timer = window.setTimeout(() => setVisible(false), 3200);
      return () => window.clearTimeout(timer);
    } catch {
      // Storage may be disabled in private browsing; never block the application.
      return;
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="civilos-intro" role="status" aria-label="Opening CivilOS AI">
      <style>{`
        .civilos-intro{position:fixed;inset:0;z-index:9999;isolation:isolate;display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(ellipse at 50% 42%,#0a347b 0%,#071a40 42%,#020713 100%);animation:civilos-intro-out .65s cubic-bezier(.4,0,.2,1) 2.55s forwards}
        .civilos-intro:before,.civilos-intro:after{content:"";position:absolute;left:50%;top:43%;width:min(74vw,440px);aspect-ratio:1;border-radius:29%;pointer-events:none;transform:translate(-50%,-50%) rotate(-12deg)}
        .civilos-intro:before{border:1px solid rgba(34,211,238,.82);box-shadow:0 0 16px rgba(6,182,212,.65),0 0 48px rgba(37,99,235,.35),inset 0 0 34px rgba(6,182,212,.12);animation:civilos-halo 2.6s ease-out both}
        .civilos-intro:after{width:min(80vw,474px);border:1px solid rgba(59,130,246,.32);filter:blur(.3px);box-shadow:0 0 34px rgba(37,99,235,.3);animation:civilos-halo-outer 2.6s ease-out both}
        .civilos-intro-content{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:17px;padding:24px;text-align:center;animation:civilos-reveal .65s cubic-bezier(.2,.75,.25,1) both}
        .civilos-intro-stage{position:relative;display:grid;place-items:center;width:min(64vw,300px);aspect-ratio:1;perspective:1100px;perspective-origin:50% 45%}
        .civilos-intro-stage:before{content:"";position:absolute;inset:12%;border-radius:50%;background:rgba(6,182,212,.2);filter:blur(38px);animation:civilos-pulse 1.6s ease-in-out infinite alternate}
        .civilos-intro-logo{position:relative;z-index:1;transform-style:preserve-3d;will-change:transform,filter;filter:drop-shadow(0 18px 15px rgba(0,0,0,.42)) drop-shadow(0 0 18px rgba(6,182,212,.48));animation:civilos-3d-rotation 1.65s cubic-bezier(.18,.72,.2,1) both}
        .civilos-intro-logo:after{content:"";position:absolute;inset:4%;border-radius:24%;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(165,243,252,.4),0 0 26px rgba(34,211,238,.18)}
        .civilos-intro-logo img{display:block!important;width:clamp(170px,42vw,270px)!important;height:auto!important;max-width:100%;border-radius:22%;object-fit:contain;backface-visibility:visible}
        .civilos-intro-wordmark{color:#fff;font-weight:850;font-size:clamp(28px,5.2vw,42px);letter-spacing:-.045em;text-shadow:0 0 24px rgba(34,211,238,.2);animation:civilos-brand-reveal .7s ease .8s both}
        .civilos-intro-tagline{margin-top:8px;color:#a5f3fc;font-size:clamp(9px,1.8vw,11px);letter-spacing:.24em;text-transform:uppercase;animation:civilos-brand-reveal .7s ease 1s both}
        .civilos-intro-light{position:absolute;inset:-30%;z-index:2;pointer-events:none;background:linear-gradient(112deg,transparent 40%,rgba(103,232,249,.2) 48%,rgba(255,255,255,.36) 50%,rgba(103,232,249,.12) 52%,transparent 60%);transform:translateX(-75%) rotate(-8deg);animation:civilos-sweep 1.15s ease .9s both}
        .civilos-intro-grid{position:absolute;inset:0;opacity:.12;pointer-events:none;background-image:linear-gradient(rgba(96,165,250,.22) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,.22) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse at center,#000,transparent 72%)}
        @keyframes civilos-3d-rotation{0%{opacity:0;transform:rotateX(-18deg) rotateY(0deg) rotateZ(-5deg) translateY(22px) scale(.68)}12%{opacity:1}55%{transform:rotateX(10deg) rotateY(205deg) rotateZ(2deg) translateY(-5px) scale(1.04)}78%{transform:rotateX(-4deg) rotateY(305deg) rotateZ(-1deg) translateY(0) scale(1)}100%{opacity:1;transform:rotateX(0deg) rotateY(360deg) rotateZ(0deg) translateY(0) scale(1)}}
        @keyframes civilos-halo{0%{opacity:0;transform:translate(-50%,-50%) rotate(-25deg) scale(.65)}35%{opacity:1}100%{opacity:.8;transform:translate(-50%,-50%) rotate(0) scale(1)}}
        @keyframes civilos-halo-outer{0%{opacity:0;transform:translate(-50%,-50%) rotate(18deg) scale(.72)}45%{opacity:.8}100%{opacity:.45;transform:translate(-50%,-50%) rotate(-8deg) scale(1.02)}}
        @keyframes civilos-pulse{from{opacity:.45;transform:scale(.88)}to{opacity:1;transform:scale(1.08)}}
        @keyframes civilos-reveal{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes civilos-brand-reveal{from{opacity:0;transform:translateY(10px);filter:blur(5px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}
        @keyframes civilos-sweep{to{transform:translateX(75%) rotate(-8deg)}}
        @keyframes civilos-intro-out{to{opacity:0;visibility:hidden;pointer-events:none}}
        @media(max-width:600px){.civilos-intro:before{width:78vw}.civilos-intro:after{width:84vw}.civilos-intro-stage{width:82vw;max-width:300px}.civilos-intro-logo img{width:min(56vw,220px)!important}.civilos-intro-tagline{letter-spacing:.16em}}
        @media(prefers-reduced-motion:reduce){.civilos-intro,.civilos-intro *{animation:none!important;transition:none!important}}
      `}</style>
      <div className="civilos-intro-grid" />
      <div className="civilos-intro-light" />
      <div className="civilos-intro-content">
        <div className="civilos-intro-stage"><div className="civilos-intro-logo"><CivilOSLogo variant="icon" size="xl" /></div></div>
        <div><div className="civilos-intro-wordmark">CivilOS <span style={{ color: "#22d3ee" }}>AI</span></div><div className="civilos-intro-tagline">Build Smarter • Engineer Better</div></div>
      </div>
    </div>
  );
};

export default AnimatedLogoIntro;
