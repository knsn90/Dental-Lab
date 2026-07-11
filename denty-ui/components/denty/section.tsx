"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Section({
  title,
  caption,
  action,
  children,
  className,
}: {
  title: string;
  caption?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative", className)}
    >
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-text">{title}</h2>
          {caption && <p className="mt-0.5 text-[13px] text-muted">{caption}</p>}
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  );
}
