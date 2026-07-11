"use client";

import { motion } from "framer-motion";
import { useId } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

const STATE_SCALE: Record<OrbState, number[]> = {
  idle: [1, 1.03, 1],
  listening: [1, 1.06, 1],
  thinking: [1, 1.04, 1.01],
  speaking: [1, 1.07, 0.98, 1.05, 1],
};

const STATE_DUR: Record<OrbState, number> = {
  idle: 5,
  listening: 1.6,
  thinking: 2.4,
  speaking: 0.9,
};

export function AIOrb({
  size = 200,
  state = "idle",
  showRings = true,
}: {
  size?: number;
  state?: OrbState;
  showRings?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const i = (k: string) => `${uid}-${k}`;
  const active = state !== "idle";

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      {/* Pulsing rings */}
      {showRings && active && (
        <>
          {[0, 0.8].map((delay) => (
            <span
              key={delay}
              className="absolute rounded-full animate-pulse-ring"
              style={{
                width: size * 0.78,
                height: size * 0.78,
                border: "1.5px solid color-mix(in srgb, var(--primary) 60%, transparent)",
                animationDelay: `${delay}s`,
              }}
            />
          ))}
        </>
      )}

      {/* Ambient glow */}
      <motion.div
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: size * 0.92,
          height: size * 0.92,
          background:
            "radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--primary) 55%, transparent), transparent 70%)",
          filter: "blur(26px)",
        }}
        animate={{ opacity: active ? [0.55, 0.9, 0.55] : [0.35, 0.5, 0.35] }}
        transition={{ duration: STATE_DUR[state], repeat: Infinity, ease: "easeInOut" }}
      />

      {/* The orb */}
      <motion.div
        animate={{ scale: STATE_SCALE[state] }}
        transition={{ duration: STATE_DUR[state], repeat: Infinity, ease: "easeInOut" }}
        style={{ width: size * 0.7, height: size * 0.7 }}
        className="relative"
      >
        <svg width="100%" height="100%" viewBox="0 0 100 100">
          <defs>
            <radialGradient id={i("base")} cx="38%" cy="32%" r="75%">
              <stop offset="0%" stopColor="#8fc0ff" />
              <stop offset="100%" stopColor="#3f63c8" />
            </radialGradient>
            {(
              [
                ["b1", "#6ea8fe"],
                ["b2", "#00c2a8"],
                ["b3", "#a78bfa"],
                ["b4", "#5ee0d0"],
              ] as const
            ).map(([k, c]) => (
              <radialGradient key={k} id={i(k)} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={c} stopOpacity="1" />
                <stop offset="60%" stopColor={c} stopOpacity="0.5" />
                <stop offset="100%" stopColor={c} stopOpacity="0" />
              </radialGradient>
            ))}
            <radialGradient id={i("shade")} cx="40%" cy="34%" r="72%">
              <stop offset="0%" stopColor="#0a0a20" stopOpacity="0" />
              <stop offset="62%" stopColor="#0a0a20" stopOpacity="0" />
              <stop offset="100%" stopColor="#06061a" stopOpacity="0.45" />
            </radialGradient>
            <radialGradient id={i("gloss")} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="55%" stopColor="#fff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <filter id={i("soft")} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
            <clipPath id={i("clip")}>
              <circle cx="50" cy="50" r="50" />
            </clipPath>
          </defs>

          <circle cx="50" cy="50" r="50" fill={`url(#${i("base")})`} />
          <g clipPath={`url(#${i("clip")})`}>
            <g filter={`url(#${i("soft")})`}>
              <g
                className="animate-orb"
                style={{ transformOrigin: "50px 50px", transformBox: "fill-box" }}
              >
                <circle cx="34" cy="30" r="30" fill={`url(#${i("b1")})`} />
                <circle cx="70" cy="42" r="27" fill={`url(#${i("b2")})`} />
              </g>
              <g
                className="animate-orb-rev"
                style={{ transformOrigin: "50px 50px", transformBox: "fill-box" }}
              >
                <circle cx="60" cy="70" r="29" fill={`url(#${i("b3")})`} />
                <circle cx="28" cy="64" r="25" fill={`url(#${i("b4")})`} />
              </g>
            </g>
          </g>
          <circle cx="50" cy="50" r="50" fill={`url(#${i("shade")})`} />
          <ellipse
            cx="37"
            cy="30"
            rx="23"
            ry="15"
            fill={`url(#${i("gloss")})`}
            transform="rotate(-22 37 30)"
          />
          <circle cx="32" cy="26" r="3.2" fill="#fff" fillOpacity="0.85" />
          <circle
            cx="50"
            cy="50"
            r="49"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.18"
            strokeWidth="1"
          />
        </svg>
      </motion.div>
    </div>
  );
}
