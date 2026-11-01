import { useEffect, useRef } from "react";
import "./AnimatedLogo.css";

export interface AnimatedLogoProps {
  /** Rendered width and height in CSS pixels. */
  size?: number;
  /** Continuous navbar motion or a finite splash-screen intro. */
  mode?: "loop" | "intro";
  onComplete?: () => void;
}

const PRIMARY_LOGO = "/civilos-logo.jpg";
const FALLBACK_LOGO = "/branding/civilos-ai-icon-512.png";

const AnimatedLogo = ({
  size = 260,
  mode = "loop",
  onComplete,
}: AnimatedLogoProps) => {
  const completed = useRef(false);

  useEffect(() => {
    if (mode !== "intro") return;

    completed.current = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 0 : 4500;
    const timer = window.setTimeout(() => {
      if (completed.current) return;
      completed.current = true;
      onComplete?.();
    }, duration);

    return () => window.clearTimeout(timer);
  }, [mode, onComplete]);

  const handleLogoError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.src.endsWith(FALLBACK_LOGO)) return;
    image.onerror = null;
    image.src = FALLBACK_LOGO;
  };

  return (
    <div
      className={`animated-logo-scene animated-logo-scene--${mode}`}
      style={{ width: size, height: size, "--logo-size": `${size}px` } as React.CSSProperties}
      role="img"
      aria-label="CivilOS AI animated logo"
    >
      <div className="animated-logo-glow" aria-hidden="true" />
      <div className="animated-logo-shadow" aria-hidden="true" />
      <div className="animated-logo-ring animated-logo-ring--cyan" aria-hidden="true" />
      <div className="animated-logo-ring animated-logo-ring--orange" aria-hidden="true" />

      <div className="animated-logo-card" aria-hidden="true">
        <div className="animated-logo-face animated-logo-face--front">
          <img src={PRIMARY_LOGO} alt="" draggable={false} onError={handleLogoError} />
        </div>
        <div className="animated-logo-face animated-logo-face--back">
          <img src={PRIMARY_LOGO} alt="" draggable={false} onError={handleLogoError} />
        </div>
      </div>

      <svg className="animated-logo-particles" viewBox="0 0 260 220" fill="none" aria-hidden="true">
        <defs>
          <filter id="animated-logo-cyan-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g filter="url(#animated-logo-cyan-glow)">
          <path className="animated-logo-particle-line line-one" d="M4 72 C42 72 49 92 88 92" />
          <path className="animated-logo-particle-line line-two" d="M-4 116 C36 116 49 108 91 108" />
          <path className="animated-logo-particle-line line-three" d="M8 158 C42 158 54 132 94 132" />
          <circle className="animated-logo-particle-dot dot-one" cx="24" cy="64" r="2.4" />
          <circle className="animated-logo-particle-dot dot-two" cx="43" cy="145" r="2.1" />
          <circle className="animated-logo-particle-dot dot-three" cx="12" cy="126" r="1.8" />
        </g>
      </svg>
    </div>
  );
};

export default AnimatedLogo;
