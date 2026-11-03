import { useCallback, useEffect, useState } from "react";
import AnimatedLogo from "@/components/AnimatedLogo";

const SESSION_KEY = "civilos-animated-splash-seen";

const AnimatedLogoIntro = () => {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Storage may be unavailable; the intro should never block the app.
    }
    setVisible(true);
  }, []);

  const handleComplete = useCallback(() => {
    setExiting(true);
    window.setTimeout(() => setVisible(false), 460);
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`civilos-animated-splash${exiting ? " is-exiting" : ""}`}
      role="status"
      aria-label="Opening CivilOS AI"
    >
      <style>{`
        .civilos-animated-splash{position:fixed;inset:0;z-index:9999;isolation:isolate;display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(ellipse at 50% 42%,#102b61 0%,#07152f 46%,#02050d 100%);opacity:1;transform:scale(1);transition:opacity 460ms ease,transform 460ms cubic-bezier(.2,.7,.2,1);contain:paint}
        .civilos-animated-splash:before{content:"";position:absolute;width:min(82vw,520px);aspect-ratio:1;border:1px solid rgba(34,224,255,.18);border-radius:50%;box-shadow:0 0 65px rgba(34,224,255,.1),inset 0 0 65px rgba(34,224,255,.06);animation:civilos-splash-orbit 22s linear infinite}
        .civilos-animated-splash:after{content:"";position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.62) 1px,transparent 1.8px),radial-gradient(circle,rgba(34,224,255,.42) 1px,transparent 2px);background-size:97px 97px,137px 137px;background-position:13px 21px,57px 83px;opacity:.18;mask-image:radial-gradient(ellipse at center,#000,transparent 76%);animation:civilos-splash-stars 14s linear infinite}
        .civilos-animated-splash.is-exiting{opacity:0;transform:scale(1.035);pointer-events:none}
        .civilos-splash-content{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:18px;padding:24px;text-align:center}
        .civilos-splash-wordmark{color:#f8fbff;font-size:clamp(25px,5vw,38px);font-weight:850;letter-spacing:-.045em;text-shadow:0 0 28px rgba(34,224,255,.24);animation:civilos-splash-title .8s ease .35s both}
        .civilos-splash-tagline{margin-top:8px;color:#a5eefa;font-size:clamp(9px,1.8vw,11px);letter-spacing:.16em}
        @keyframes civilos-splash-orbit{to{transform:rotate(360deg)}}
        @keyframes civilos-splash-stars{to{background-position:110px 118px,194px 220px}}
        @keyframes civilos-splash-title{from{opacity:0;transform:translateY(10px);filter:blur(5px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}
        @media(max-width:600px){.civilos-splash-content{gap:16px}.civilos-splash-tagline{letter-spacing:.1em}}
        @media(prefers-reduced-motion:reduce){.civilos-animated-splash,.civilos-animated-splash *{animation:none!important;transition:none!important}}
      `}</style>
      <div className="civilos-splash-content">
        <AnimatedLogo size={260} mode="intro" onComplete={handleComplete} />
        <div>
          <div className="civilos-splash-wordmark">CivilOS <span style={{ color: "#22e0ff" }}>AI</span></div>
          <div className="civilos-splash-tagline">Build Smarter • Engineer Better</div>
        </div>
      </div>
    </div>
  );
};

export default AnimatedLogoIntro;
