// modules/orders/materialConsumption.ts
// Material consumption engine — pure helpers (data-driven, no side effects).
//
// Used by:
//   • MaterialConsumptionModal (prefill quantities)
//   • Forecast & audit views

export type ConsumptionType = 'fixed' | 'per_tooth' | 'manual';

export interface MaterialLite {
  id:                string;
  name:              string;
  type:              string | null;
  unit:              string | null;
  consumption_type:  ConsumptionType;
  units_per_tooth:   number | null;
  consume_at_stage:  string;
  current_stock?:    number;       // optional, for sufficiency display
}

export interface OrderLite {
  id:           string;
  case_type:    string | null;
  tooth_count:  number;
}

export interface ConsumptionResult {
  quantity:        number;          // prefilled quantity (0 if manual)
  requires_input:  boolean;         // true → user must type a value
  editable:        boolean;         // true → input allowed (volume_based / manual)
  prefilled:       boolean;         // true if we had a sensible default
  basis:           string;          // human-readable formula for UI hint
}

/**
 * Compute required consumption for a single material on a given order.
 * Pure: no DB calls, deterministic.
 */
export function getConsumption(order: OrderLite, material: MaterialLite): ConsumptionResult {
  switch (material.consumption_type) {
    case 'fixed': {
      // 1 unit per order, regardless of teeth count
      return {
        quantity:       1,
        requires_input: false,
        editable:       false,
        prefilled:      true,
        basis:          'Sabit: 1 birim/sipariş',
      };
    }

    case 'per_tooth': {
      const upt = material.units_per_tooth ?? 0;
      const qty = order.tooth_count * upt;
      return {
        quantity:       qty,
        requires_input: false,
        editable:       false,
        prefilled:      qty > 0,
        basis:          `${order.tooth_count} diş × ${upt}`,
      };
    }

    case 'manual':
    default: {
      return {
        quantity:       0,
        requires_input: true,
        editable:       true,
        prefilled:      false,
        basis:          'Manuel girin',
      };
    }
  }
}

/**
 * Validate user-edited consumption row before submit.
 *  - quantity must be a positive number
 *  - manual rows must have a value
 */
export function isValidConsumption(
  row: { quantity: number },
  material: MaterialLite,
): boolean {
  if (!Number.isFinite(row.quantity)) return false;
  if (row.quantity <= 0) return false;
  return true;
}

export const CONSUMPTION_TYPE_OPTIONS: { key: ConsumptionType; label: string; hint: string }[] = [
  { key: 'per_tooth', label: 'Diş Başı', hint: 'Tooth count × units_per_tooth' },
  { key: 'fixed',     label: 'Sabit',    hint: 'Sipariş başına 1 birim'         },
  { key: 'manual',    label: 'Manuel',   hint: 'Her seferinde elle girilir'     },
];
