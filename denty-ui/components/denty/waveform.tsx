"use client";

import { motion } from "framer-motion";

export function Waveform({
  bars = 40,
  active = true,
  color = "var(--primary)",
  height = 64,
  className,
}: {
  bars?: number;
  active?: boolean;
  color?: string;
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height }}
    >
      {Array.from({ length: bars }).map((_, idx) => {
        // Bell-shaped base so center bars are tallest (voice signature)
        const center = bars / 2;
        const dist = Math.abs(idx - center) / center;
        const base = 0.16 + (1 - dist) * 0.6;
        const peak = Math.min(1, base + 0.34);
        const dur = 0.52 + (idx % 5) * 0.12;
        return (
          <motion.div
            key={idx}
            style={{
              width: 3,
              height: height * 0.92,
              borderRadius: 999,
              background: color,
              transformOrigin: "center",
            }}
            initial={{ scaleY: base * 0.4 }}
            animate={{ scaleY: active ? [base, peak, base * 0.7, base] : base * 0.35 }}
            transition={{
              duration: dur,
              repeat: active ? Infinity : 0,
              ease: "easeInOut",
              delay: (idx % 7) * 0.04,
            }}
          />
        );
      })}
    </div>
  );
}
