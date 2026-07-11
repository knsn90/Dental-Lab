"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mic } from "lucide-react";
import { AIOrb, type OrbState } from "./ai-orb";
import { Waveform } from "./waveform";

const script = [
  { state: "listening" as OrbState, caption: "Dinliyorum…", transcript: "" },
  {
    state: "thinking" as OrbState,
    caption: "Düşünüyorum…",
    transcript: "“Yarın sabah implant hastalarını listele”",
  },
  {
    state: "speaking" as OrbState,
    caption: "DENTY",
    transcript: "Yarın sabah 3 implant hastan var: Ayşe Yılmaz 09:00, Can Öztürk 10:30 ve Mehmet Demir 11:15. Hatırlatma göndereyim mi?",
  },
];

export function VoiceMode({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep(0);
      return;
    }
    const timers = [
      window.setTimeout(() => setStep(1), 1800),
      window.setTimeout(() => setStep(2), 3600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [open]);

  const current = script[step];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[70] grid place-items-center"
        >
          {/* backdrop */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 35%, color-mix(in srgb, var(--primary) 22%, var(--bg)), var(--bg))",
              backdropFilter: "blur(8px)",
            }}
          />

          <div className="relative flex h-full w-full max-w-md flex-col items-center justify-between px-6 py-10">
            {/* top */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={onClose}
              className="self-end grid h-10 w-10 place-items-center rounded-full border border-border bg-surface/70 text-text-2 backdrop-blur active:scale-95"
            >
              <X size={18} />
            </motion.button>

            {/* center orb */}
            <div className="flex flex-1 flex-col items-center justify-center gap-8">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 18 }}
              >
                <AIOrb size={260} state={current.state} />
              </motion.div>

              <div className="min-h-[120px] text-center">
                <motion.p
                  key={current.caption}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[13px] font-medium uppercase tracking-[0.18em] text-accent"
                >
                  {current.caption}
                </motion.p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={current.transcript}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.4 }}
                    className="mx-auto mt-3 max-w-[300px] text-[17px] font-medium leading-snug tracking-[-0.01em] text-text"
                  >
                    {current.transcript}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {/* bottom: waveform + stop */}
            <div className="flex w-full flex-col items-center gap-6">
              <Waveform bars={48} active height={56} color="var(--primary)" />
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onClose}
                className="grid h-16 w-16 place-items-center rounded-full text-white shadow-[var(--shadow-lg)]"
                style={{ background: "linear-gradient(135deg, var(--primary-deep), var(--accent))" }}
              >
                <Mic size={24} />
              </motion.button>
              <p className="text-[12px] text-muted">Bitirmek için dokun</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
