import { useEffect, useState } from "react";
import CivilOSLogo from "@/components/CivilOSLogo";

/**
 * Lightweight, session-scoped brand intro. Uses the existing logo asset and
 * CSS only so it does not add a large animation dependency.
 */
const SESSION_KEY = "civilos-logo-intro-seen";

const AnimatedLogoIntro = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;
      window.sessionStorage.setItem(SESSION_KEY, "1");
      setVisible(true);
      const timer = window.setTimeout(() => setVisible(false), 2600);
      return () => window.clearTimeout(timer);
    } catch {
      // Storage can be unavailable in privacy modes; never block the app.
      return;
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="civilos-intro" role="status" aria-label="Opening CivilOS AI">
      <style>{`
        .civilos-intro{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
          background:radial-gradient(ellipse at center,#08265e 0%,#06132f 48%,#020817 100%);
          animation:civilos-intro-out .55s ease 2.05s forwards;overflow:hidden}
        .civilos-intro:before{content:"";position:absolute;width:min(72vw,430px);aspect-ratio:1;border-radius:28%;
          border:2px solid rgba(34,211,238,.65);box-shadow:0 0 24px #06b6d4, inset 0 0 26px rgba(37,99,235,.5);
          animation:civilos-ring 2.4s ease-in-out both}
        .civilos-intro-content{position:relative;display:flex;flex-direction:column;align-items:center;gap:18px;
          animation:civilos-reveal .65s ease both}
        .civilos-intro-logo{filter:drop-shadow(0 0 18px rgba(6,182,212,.7));animation:civilos-spin 1.15s cubic-bezier(.2,.75,.25,1) both}
        .civilos-intro-wordmark{color:white;text-align:center;font-weight:800;font-size:clamp(24px,5vw,38px);letter-spacing:-.04em}
        .civilos-intro-tagline{margin-top:7px;color:#a5f3fc;font-size:10px;letter-spacing:.22em;text-transform:uppercase;text-align:center}
        .civilos-intro-light{position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 35%,rgba(103,232,249,.16) 48%,transparent 60%);
          transform:translateX(-100%);animation:civilos-sweep 1.2s ease .65s both}
        @keyframes civilos-spin{0%{transform:perspective(700px) rotateY(0) scale(.72);opacity:0}15%{opacity:1}100%{transform:perspective(700px) rotateY(360deg) scale(1);opacity:1}}
        @keyframes civilos-ring{0%{transform:scale(.72) rotate(-18deg);opacity:0}25%{opacity:1}100%{transform:scale(1) rotate(0);opacity:.85}}
        @keyframes civilos-reveal{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes civilos-sweep{to{transform:translateX(100%)}}
        @keyframes civilos-intro-out{to{opacity:0;visibility:hidden;pointer-events:none}}
        @media(max-width:600px){.civilos-intro:before{width:78vw}.civilos-intro-logo img{width:136px;height:136px}}
        @media(prefers-reduced-motion:reduce){.civilos-intro,.civilos-intro *{animation:none!important;transition:none!important}}
      `}</style>
      <div className="civilos-intro-light" />
      <div className="civilos-intro-content">
        <div className="civilos-intro-logo"><CivilOSLogo variant="icon" size="xl" /></div>
        <div>
          <div className="civilos-intro-wordmark">CivilOS <span style={{ color: "#22d3ee" }}>AI</span></div>
          <div className="civilos-intro-tagline">Build Smarter • Engineer Better</div>
        </div>
      </div>
    </div>
  );
};

export default AnimatedLogoIntro;
