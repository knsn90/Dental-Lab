# DENTY — AI Dental Assistant UI

Apple-quality, mobile-first AI assistant interface for dental clinics.
Inspired by **Apple Intelligence · OpenAI Voice · Linear · Arc**.

## Stack

- **Next.js 16** (App Router, Turbopack) · React 19 · TypeScript
- **Tailwind CSS v4** (CSS-first `@theme`, class-based dark mode)
- **Framer Motion** (springs, layout & scroll-reveal animations)
- **lucide-react** icons

> Spec asked for Next 15; `create-next-app@latest` now ships Next 16 (App Router
> is identical). Pin to 15 with `npx create-next-app@15` if strictly required.

## Run

```bash
npm install
npm run dev      # http://localhost:3000  (or: npm run dev -- --port 4800)
npm run build    # production build
```

## Features

| # | Feature | Component |
|---|---------|-----------|
| 1 | AI Orb center animation | `components/denty/ai-orb.tsx` |
| 2 | Voice assistant mode | `components/denty/voice-mode.tsx` |
| 3 | Chat interface | `components/denty/chat-interface.tsx` |
| 4 | Patient cards | `components/denty/patient-cards.tsx` |
| 5 | Treatment planning cards | `components/denty/treatment-cards.tsx` |
| 6 | WhatsApp assistant panel | `components/denty/whatsapp-panel.tsx` |
| 7 | Lab order management | `components/denty/lab-orders.tsx` |
| 8 | Floating microphone | `components/denty/floating-mic.tsx` |
| 9 | Realtime waveform | `components/denty/waveform.tsx` |
| 10 | Dark mode | `components/denty/theme-toggle.tsx` + `lib/use-theme.ts` |

## Architecture

```
app/
  layout.tsx        # fonts, metadata, no-flash dark-mode bootstrap
  page.tsx          # single-screen composition
  globals.css       # design tokens (light/dark), keyframes, utilities
components/denty/    # feature components (each self-contained)
lib/
  mock.ts           # demo data
  use-theme.ts      # dark-mode hook (localStorage + system)
  utils.ts          # cn()
```

## Design system

Tokens live in `app/globals.css` as CSS variables, exposed to Tailwind via
`@theme inline` (`bg-bg`, `text-text`, `bg-surface`, `text-primary`,
`text-accent`, …). Dark mode flips the variables on `.dark`.

- Background `#FCFCFD` · Primary `#6EA8FE` · Accent `#00C2A8`
- All motion is `transform`/`opacity` based for a 120fps feel.

The chat & voice flows use simulated responses (no backend). Wire them to the
**Vercel AI SDK** (`useChat`) and a Realtime/WebSpeech API for live behaviour.
