"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Sparkles } from "lucide-react";
import { initialMessages, quickPrompts, type ChatMessage } from "@/lib/mock";
import { cn } from "@/lib/utils";

let counter = 100;
const nextId = () => `c${counter++}`;

const cannedReplies = [
  "Hemen hallediyorum. İlgili kayıtları güncelledim ve takvimini senkronladım.",
  "Tamamdır ✅ — hastaya WhatsApp'tan bilgilendirme gönderdim.",
  "Bunu bir tedavi planına dönüştürdüm; adımları aşağıda kartta görebilirsin.",
  "Lab siparişi oluşturuldu ve teknisyene iletildi. Tahmini teslim 3 gün.",
];

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value) return;
    setInput("");
    setMessages((m) => [...m, { id: nextId(), role: "user", text: value }]);
    setTyping(true);
    const reply = cannedReplies[Math.floor(messages.length) % cannedReplies.length];
    window.setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { id: nextId(), role: "denty", text: reply }]);
    }, 1200);
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-[var(--shadow)]">
      {/* messages */}
      <div ref={scrollRef} className="no-scrollbar max-h-[340px] space-y-3 overflow-y-auto p-4">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed",
                  m.role === "user"
                    ? "rounded-br-md text-white"
                    : "rounded-bl-md border border-border bg-surface-2 text-text-2",
                )}
                style={
                  m.role === "user"
                    ? { background: "linear-gradient(135deg, var(--primary-deep), var(--primary))" }
                    : undefined
                }
              >
                {m.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {typing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-surface-2 px-3.5 py-3">
              {[0, 1, 2].map((d) => (
                <motion.span
                  key={d}
                  className="h-1.5 w-1.5 rounded-full bg-muted"
                  animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* quick prompts */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-border px-4 py-3">
        {quickPrompts.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-text-2 transition-colors hover:border-border-strong active:scale-95"
          >
            <Sparkles size={13} className="text-accent" />
            {q}
          </button>
        ))}
      </div>

      {/* composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="DENTY'ye sor…"
          className="h-11 flex-1 rounded-full border border-border bg-surface-2 px-4 text-[14px] text-text outline-none transition-colors placeholder:text-muted focus:border-[color:var(--primary)]"
        />
        <motion.button
          type="submit"
          whileTap={{ scale: 0.9 }}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white shadow-[var(--shadow)] disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, var(--primary-deep), var(--accent))" }}
          disabled={!input.trim()}
        >
          <ArrowUp size={18} strokeWidth={2.4} />
        </motion.button>
      </form>
    </div>
  );
}
