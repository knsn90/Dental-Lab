"use client";

import { motion } from "framer-motion";
import { Beaker, Clock, Plus } from "lucide-react";
import { labOrders, labStatusMeta } from "@/lib/mock";

const order: (keyof typeof labStatusMeta)[] = ["design", "production", "qc", "ready"];

export function LabOrders() {
  return (
    <div className="rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow)]">
      <div className="grid gap-2.5">
        {labOrders.map((o, idx) => {
          const meta = labStatusMeta[o.status];
          const stepIndex = order.indexOf(o.status);
          return (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, x: -14 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.06 }}
              className="rounded-2xl border border-border bg-surface-2 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{ background: `${meta.color}1f`, color: meta.color }}
                  >
                    <Beaker size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-text">{o.item}</p>
                    <p className="truncate text-[12px] text-muted">
                      {o.code} · {o.patient} · Renk {o.shade}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: `${meta.color}1f`, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted">
                    <Clock size={11} /> {o.due}
                  </p>
                </div>
              </div>

              {/* pipeline */}
              <div className="mt-3 flex items-center gap-1">
                {order.map((step, sIdx) => (
                  <div
                    key={step}
                    className="h-1.5 flex-1 rounded-full"
                    style={{
                      background: sIdx <= stepIndex ? meta.color : "var(--surface-3)",
                      opacity: sIdx <= stepIndex ? 1 : 1,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      <button
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-3 text-[13.5px] font-medium text-text-2 transition-colors hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] active:scale-[0.99]"
      >
        <Plus size={16} /> Yeni lab siparişi
      </button>
    </div>
  );
}
