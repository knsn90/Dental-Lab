"use client";

import { motion } from "framer-motion";
import { Calendar, ChevronRight } from "lucide-react";
import { patients, type Patient } from "@/lib/mock";

const statusMeta: Record<Patient["status"], { label: string; color: string }> = {
  active: { label: "Aktif", color: "#00c2a8" },
  review: { label: "Kontrol", color: "#f59e0b" },
  new: { label: "Yeni", color: "#6ea8fe" },
};

export function PatientCards() {
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
      {patients.map((p, idx) => {
        const s = statusMeta[p.status];
        return (
          <motion.button
            key={p.id}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: idx * 0.06 }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
            className="group relative w-[200px] shrink-0 overflow-hidden rounded-3xl border border-border bg-surface p-4 text-left shadow-[var(--shadow)]"
          >
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-25 blur-xl transition-opacity group-hover:opacity-40"
              style={{ background: `hsl(${p.hue} 90% 60%)` }}
            />
            <div className="flex items-center justify-between">
              <div
                className="grid h-11 w-11 place-items-center rounded-2xl text-[15px] font-semibold text-white"
                style={{ background: `linear-gradient(135deg, hsl(${p.hue} 80% 62%), hsl(${p.hue + 28} 75% 52%))` }}
              >
                {p.initials}
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: `${s.color}1f`, color: s.color }}
              >
                {s.label}
              </span>
            </div>
            <div className="mt-3">
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-text">{p.name}</p>
              <p className="text-[12.5px] text-muted">{p.age} yaş</p>
            </div>
            <div className="mt-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
              <p className="text-[13px] font-medium text-text-2">{p.treatment}</p>
            </div>
            <div className="mt-3 flex items-center justify-between text-[12px] text-muted">
              <span className="flex items-center gap-1.5">
                <Calendar size={13} />
                {p.lastVisit}
              </span>
              <ChevronRight size={15} className="text-muted transition-transform group-hover:translate-x-0.5" />
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
