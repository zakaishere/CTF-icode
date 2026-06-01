"use client";

import { useEffect, useState } from "react";

/* Hex/binary glyph drift — sprinkled cyber-themed glyphs that slowly float up.
   Positions are generated client-side to avoid SSR hydration mismatch. */
const GLYPHS = [
  "0x4F", "0xA1", "0x7E", "1010", "0110", "ff:01", "0x3C",
  "SYN", "ACK", "CTF", "0xDE", "0xAD", "0xBE", "0xEF",
  "01001", "11010", "0x5A", "root@", "$_", ">>>", "//42",
  "0x90", "0xCC", "10:1F", "::1", "0xC0", "FLAG{", "}",
];

type Particle = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  text: string;
  size: number;
  opacity: number;
};

function genParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * -30,
    duration: 22 + Math.random() * 24,
    text: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    size: 10 + Math.random() * 4,
    opacity: 0.18 + Math.random() * 0.22,
  }));
}

/* Shared ambient background: animated glow blobs + circuit traces +
   drifting hex/binary glyphs + scanline. Cyber/terminal theme.
   Used by the root splash and the post-login hub. */
export function AmbientBackdrop() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    setParticles(genParticles(22));
  }, []);

  return (
    <div className="ict-ambient" aria-hidden>
      <div className="ict-ambient-grid" />

      <div className="ict-ambient-blob ict-ambient-blob-1" />
      <div className="ict-ambient-blob ict-ambient-blob-2" />
      <div className="ict-ambient-blob ict-ambient-blob-3" />

      <svg
        className="ict-ambient-circuit"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="ict-amb-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%"   stopColor="rgba(96,165,255,0)" />
            <stop offset="50%"  stopColor="rgba(96,165,255,0.40)" />
            <stop offset="100%" stopColor="rgba(96,165,255,0)" />
          </linearGradient>
          <linearGradient id="ict-amb-pulse" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%"  stopColor="rgba(96,165,255,0)" />
            <stop offset="50%" stopColor="rgba(150,200,255,0.95)" />
            <stop offset="100%" stopColor="rgba(96,165,255,0)" />
          </linearGradient>
        </defs>

        {/* Static circuit traces */}
        <g stroke="url(#ict-amb-line)" strokeWidth="1" fill="none">
          <path d="M0 140 L160 140 L200 100 L320 100" />
          <path d="M0 220 L120 220 L160 260 L240 260 L280 220 L420 220" />
          <path d="M0 360 L80 360 L120 320 L260 320" />
          <path d="M0 480 L200 480 L240 520 L380 520" />
          <path d="M0 620 L100 620 L140 580 L300 580" />
          <path d="M0 760 L180 760 L220 720 L360 720" />
        </g>
        <g stroke="url(#ict-amb-line)" strokeWidth="1" fill="none" transform="translate(1440,0) scale(-1,1)">
          <path d="M0 160 L140 160 L180 200 L300 200" />
          <path d="M0 280 L220 280" />
          <path d="M0 440 L80 440 L120 480 L240 480 L280 440 L400 440" />
          <path d="M0 560 L160 560" />
          <path d="M0 700 L120 700 L160 660 L300 660" />
        </g>

        {/* Pulse beams traveling along traces */}
        <g fill="none" stroke="url(#ict-amb-pulse)" strokeWidth="2" strokeLinecap="round">
          <path
            d="M0 220 L120 220 L160 260 L240 260 L280 220 L420 220"
            className="ict-amb-pulse-path"
            style={{ animationDelay: "0s" }}
          />
          <path
            d="M0 480 L200 480 L240 520 L380 520"
            className="ict-amb-pulse-path"
            style={{ animationDelay: "2.4s" }}
          />
          <path
            d="M0 760 L180 760 L220 720 L360 720"
            className="ict-amb-pulse-path"
            style={{ animationDelay: "4.6s" }}
          />
        </g>

        {/* Node dots */}
        <g fill="rgba(96,165,255,0.6)">
          <circle cx="160"  cy="140" r="2.5" className="ict-amb-node" />
          <circle cx="280"  cy="220" r="2.5" className="ict-amb-node" style={{ animationDelay: "0.6s" }} />
          <circle cx="120"  cy="320" r="2.5" className="ict-amb-node" style={{ animationDelay: "1.2s" }} />
          <circle cx="240"  cy="520" r="2.5" className="ict-amb-node" style={{ animationDelay: "1.8s" }} />
          <circle cx="1260" cy="160" r="2.5" className="ict-amb-node" style={{ animationDelay: "2.4s" }} />
          <circle cx="1320" cy="440" r="2.5" className="ict-amb-node" style={{ animationDelay: "3.0s" }} />
          <circle cx="1340" cy="700" r="2.5" className="ict-amb-node" style={{ animationDelay: "3.6s" }} />
        </g>
      </svg>

      {/* Drifting cyber glyphs */}
      <div className="ict-ambient-glyphs">
        {particles.map(p => (
          <span
            key={p.id}
            className="ict-amb-glyph"
            style={{
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              fontSize: `${p.size}px`,
              opacity: p.opacity,
            }}
          >
            {p.text}
          </span>
        ))}
      </div>

      {/* Subtle scanline sweep */}
      <div className="ict-ambient-scan" />
    </div>
  );
}

export default AmbientBackdrop;
