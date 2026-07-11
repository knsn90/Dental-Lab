"use client";

import { motion } from "framer-motion";
import { Check, MessageCircle, Bot } from "lucide-react";
import { whatsappThread } from "@/lib/mock";

export function WhatsAppPanel() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-[var(--shadow)]">
      {/* header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: "linear-gradient(135deg, #1faa59, #0e8a6e)" }}
      >
        <div className="flex items-center gap-2.5 text-white">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20">
            <MessageCircle size={18} />
          </span>
          <div>
            <p className="text-[14px] font-semibold leading-tight">WhatsApp Asistanı</p>
            <p className="flex items-center gap-1 text-[11px] text-white/80">
              <Bot size={11} /> DENTY otomatik yanıtlıyor
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Çevrimiçi
        </span>
      </div>

      {/* thread */}
      <div
        className="space-y-2.5 p-4"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in srgb, var(--muted) 18%, transparent) 0.6px, transparent 0.6px)",
          backgroundSize: "14px 14px",
        }}
      >
        {whatsappThread.map((m, idx) => {
          const mine = m.from === "denty";
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: idx * 0.08 }}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13.5px] shadow-sm ${
                  mine ? "rounded-br-sm" : "rounded-bl-sm border border-border bg-surface text-text-2"
                }`}
                style={mine ? { background: "#d9fdd3", color: "#0b2e1f" } : undefined}
              >
                <p>{m.text}</p>
                <span
                  className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                    mine ? "text-emerald-700/70" : "text-muted"
                  }`}
                >
                  {m.time}
                  {mine && <Check size={11} className="text-sky-600" />}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="border-t border-border px-4 py-2.5 text-center text-[12px] text-muted">
        DENTY 3 mesajı otomatik yanıtladı · 1 randevu güncellendi
      </div>
    </div>
  );
}
