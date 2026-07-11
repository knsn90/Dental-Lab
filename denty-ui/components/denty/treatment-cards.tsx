"use client";

import { motion } from "framer-motion";
import { Check, Activity } from "lucide-react";
import { treatmentPlans } from "@/lib/mock";

export function TreatmentCards() {
  return (
    <div className="grid gap-3">
      {treatmentPlans.map((t, idx) => (
        <motion.div
          key={t.id}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: idx * 0.08 }}
          className="rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="grid h-8 w-8 place-items-center rounded-xl text-white"
                  style={{ background: "linear-gradient(135deg, var(--primary-deep), var(--accent))" }}
                >
                  <Activity size={16} />
                </span>
                <div>
                  <p className="text-[15px] font-semibold tracking-[-0.01em] text-text">{t.title}</p>
                  <p className="text-[12.5px] text-muted">
                    {t.patient} · Diş {t.tooth}
                  </p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[15px] font-semibold text-text">{t.cost}</p>
              <p className="text-[11px] text-muted">tahmini</p>
            </div>
          </div>

          {/* progress */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[12px]">
              <span className="text-muted">İlerleme</span>
              <span className="font-semibold text-accent">%{t.progress}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, var(--primary), var(--accent))" }}
                initial={{ width: 0 }}
                whileInView={{ width: `${t.progress}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              />
            </div>
          </div>

          {/* steps */}
          <div className="mt-4 grid gap-2">
            {t.steps.map((step) => (
              <div key={step.label} className="flex items-center gap-2.5">
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full border"
                  style={
                    step.done
                      ? { background: "var(--accent)", borderColor: "var(--accent)" }
                      : { borderColor: "var(--border-strong)" }
                  }
                >
                  {step.done && <Check size={12} strokeWidth={3} className="text-white" />}
                </span>
                <span
                  className={`text-[13.5px] ${step.done ? "text-muted line-through" : "text-text-2"}`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
