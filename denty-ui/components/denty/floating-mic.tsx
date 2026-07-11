"use client";

import { motion } from "framer-motion";
import { Mic } from "lucide-react";

export function FloatingMic({ onOpen, hidden }: { onOpen: () => void; hidden?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.8 }}
      animate={{ opacity: hidden ? 0 : 1, y: hidden ? 30 : 0, scale: hidden ? 0.8 : 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <motion.button
        onClick={onOpen}
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.04 }}
        className="pointer-events-auto relative grid h-16 w-16 place-items-center rounded-full text-white"
        style={{
          background: "linear-gradient(135deg, var(--primary-deep), var(--accent))",
          boxShadow: "0 12px 36px color-mix(in srgb, var(--primary) 55%, transparent)",
        }}
        aria-label="Sesli asistanı aç"
      >
        {/* breathing ring */}
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ border: "2px solid color-mix(in srgb, var(--primary) 60%, transparent)" }}
          animate={{ scale: [1, 1.45], opacity: [0.7, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
        />
        <Mic size={24} strokeWidth={2.2} />
      </motion.button>
    </motion.div>
  );
}
