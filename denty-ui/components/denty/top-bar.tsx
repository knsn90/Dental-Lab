"use client";

import { motion } from "framer-motion";
import { ThemeToggle } from "./theme-toggle";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40">
      <div className="glass mx-auto flex h-14 max-w-md items-center justify-between px-4 sm:rounded-b-2xl">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2.5"
        >
          <span className="relative grid h-7 w-7 place-items-center">
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}
            />
            <span className="absolute inset-[3px] rounded-full bg-surface/85" />
            <span
              className="relative h-2.5 w-2.5 rounded-full"
              style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}
            />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">
            DENTY
          </span>
          <span className="ml-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted">
            AI
          </span>
        </motion.div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div
            className="grid h-9 w-9 place-items-center rounded-full text-[12px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg, var(--primary-deep), var(--accent))" }}
          >
            DR
          </div>
        </div>
      </div>
    </header>
  );
}
