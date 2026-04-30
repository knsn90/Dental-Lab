// modules/orders/stationMapping.ts
// SINGLE SOURCE OF TRUTH for station_name → Stage mapping.
// Do NOT scatter substring logic across components.
//
// Short term: client-side substring match (fast, no migration).
// Later: replace with a `current_stage` column on v_active_orders_kanban.

import { STAGE_ORDER, type Stage } from './stages';

/** All Stage tokens we'll match against, ordered most-specific first. */
const STAGE_TOKENS: Stage[] = [
  'MANAGER_REVIEW',
  'DOCTOR_APPROVAL',
  'TRIAGE',
  'DESIGN',
  'CAM',
  'MILLING',
  'SINTER',
  'FINISH',
  'QC',
  'SHIPPED',
];

/**
 * Map a station_name → Stage. Falls back to 'TRIAGE' when nothing matches.
 *
 * @param stationName  Raw station label (case-insensitive).
 * @param fallback     Override default fallback if needed.
 */
export function mapStationToStage(
  stationName: string | null | undefined,
  fallback: Stage = 'TRIAGE',
): Stage {
  if (!stationName) return fallback;
  const upper = stationName.toUpperCase();
  const match = STAGE_TOKENS.find(s => upper.includes(s));
  if (!match) {
    if (typeof console !== 'undefined') {
      console.warn(`[mapStationToStage] no Stage matched for "${stationName}", falling back to ${fallback}`);
    }
    return fallback;
  }
  return match;
}

/** Production stages used in the Kanban (TRIAGE → SHIPPED, DOCTOR_APPROVAL excluded as bench column). */
export const KANBAN_STAGES: Stage[] = [
  'TRIAGE', 'DESIGN', 'CAM', 'MILLING', 'SINTER', 'FINISH', 'QC',
];
