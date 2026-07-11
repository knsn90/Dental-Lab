"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mic, Sparkles } from "lucide-react";
import { TopBar } from "@/components/denty/top-bar";
import { AIOrb } from "@/components/denty/ai-orb";
import { Waveform } from "@/components/denty/waveform";
import { Section } from "@/components/denty/section";
import { ChatInterface } from "@/components/denty/chat-interface";
import { PatientCards } from "@/components/denty/patient-cards";
import { TreatmentCards } from "@/components/denty/treatment-cards";
import { WhatsAppPanel } from "@/components/denty/whatsapp-panel";
import { LabOrders } from "@/components/denty/lab-orders";
import { FloatingMic } from "@/components/denty/floating-mic";
import { VoiceMode } from "@/components/denty/voice-mode";

export default function Home() {
  const [voiceOpen, setVoiceOpen] = useState(false);

  return (
    <>
      <div className="app-aurora" />

      <div className="relative z-10">
        <TopBar />

        <main className="mx-auto max-w-md px-4 pb-32">
          {/* ── Hero: AI Orb ── */}
          <section className="flex flex-col items-center pt-8 text-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 180, damping: 16 }}
            >
              <AIOrb size={188} state="idle" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mt-2"
            >
              <p className="flex items-center justify-center gap-1.5 text-[12.5px] font-medium uppercase tracking-[0.18em] text-accent">
                <Sparkles size={13} /> Pazar, 14 Haziran
              </p>
              <h1 className="mt-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em]">
                Merhaba Dr. Esen,
                <br />
                <span className="text-gradient">bugün nasıl yardımcı olayım?</span>
              </h1>
              <p className="mx-auto mt-3 max-w-[300px] text-[14px] leading-relaxed text-muted">
                Sesle konuş, hasta planla, lab siparişlerini ve WhatsApp&apos;ı tek yerden yönet.
              </p>
            </motion.div>

            <motion.button
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.5 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setVoiceOpen(true)}
              className="mt-6 flex items-center gap-3 rounded-full border border-border bg-surface/70 py-2 pl-2 pr-5 shadow-[var(--shadow)] backdrop-blur"
            >
              <span
                className="grid h-10 w-10 place-items-center rounded-full text-white"
                style={{ background: "linear-gradient(135deg, var(--primary-deep), var(--accent))" }}
              >
                <Mic size={18} />
              </span>
              <Waveform bars={18} active={false} height={22} color="var(--muted)" />
              <span className="text-[14px] font-medium text-text-2">Konuşmak için dokun</span>
            </motion.button>
          </section>

          {/* ── Sections ── */}
          <div className="mt-12 space-y-11">
            <Section title="Sohbet" caption="DENTY ile yaz ya da komut ver">
              <ChatInterface />
            </Section>

            <Section title="Hastalar" caption="Son etkileşimler">
              <PatientCards />
            </Section>

            <Section title="Tedavi Planları" caption="AI destekli adım takibi">
              <TreatmentCards />
            </Section>

            <Section title="WhatsApp Asistanı" caption="Otomatik hasta iletişimi">
              <WhatsAppPanel />
            </Section>

            <Section title="Lab Siparişleri" caption="Üretim hattı takibi">
              <LabOrders />
            </Section>
          </div>

          <p className="mt-14 text-center text-[12px] text-muted">
            DENTY · Apple-quality AI for dental clinics
          </p>
        </main>
      </div>

      <FloatingMic onOpen={() => setVoiceOpen(true)} hidden={voiceOpen} />
      <VoiceMode open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </>
  );
}
