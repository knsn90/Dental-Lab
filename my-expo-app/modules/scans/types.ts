// Tarama randevuları — istemci veri tipleri (tablolar: supabase/migrations/20261028140000_tarama_sema.sql).
import type { ApptStatus, Decision, ScanKind, ScanSource, ScanIntent } from './scanModel';

export interface ScanChargeRow {
  id: string;
  service_id: string;
  status: 'beklemede' | 'ucretsiz' | 'ucretli';
  bill_with_order: boolean | null;
  price: number | null;
  currency: string | null;
  invoice_item_id: string | null;
}

export interface ScanPatientRow {
  id: string;
  appointment_id: string;
  patient_name: string | null;
  note: string | null;
  work_order_id: string | null;
  status: 'karar_bekliyor' | 'kapandi';
  decision: Decision | null;
  decided_at: string | null;
  charges: ScanChargeRow[];
}

export interface ScanServiceRef {
  service_id: string;
  equipment_id: string | null;
  name: string;
  scan_kind: ScanKind | null;
}

export interface ScanClinicRef {
  id: string;
  name: string;
  address: string | null;
  geo: { lat: number; lng: number; addr_hash: string | null } | null;
}

export interface ScanAppointmentRow {
  id: string;
  lab_id: string;
  clinic_id: string;
  doctor_id: string | null;
  starts_at: string;
  duration_min: number;
  technician_id: string;
  status: ApptStatus;
  source: ScanSource;
  note: string | null;
  cancel_reason: string | null;
  done_at: string | null;
  done_note: string | null;
  created_by: string | null;
  created_at: string;
  intent: ScanIntent;
  intended_order_id: string | null;
  intended_order: { id: string; order_number: string | null } | null;
  clinic: ScanClinicRef | null;
  technician: { id: string; full_name: string | null } | null;
  services: ScanServiceRef[];
  patients: ScanPatientRow[];
}

export interface ScanServiceOption { id: string; name: string; scan_kind: ScanKind; scan_free_if_order: boolean; currency: string | null }
export interface ScanDeviceOption { id: string; name: string; kind: ScanKind }
export interface ScanTechnicianOption { id: string; name: string }

export interface SaveAppointmentInput {
  id: string | null;
  clinicId: string;
  doctorId: string | null;
  startsAt: string;
  minutes: number;
  technicianId: string;
  source: ScanSource;
  note: string | null;
  services: { service_id: string; equipment_id: string | null }[];
  intent: ScanIntent;
  orderId: string | null;
}

export interface SavePatientInput {
  id: string | null;
  appointmentId: string;
  patientName: string;
  serviceIds: string[];
  note: string | null;
  workOrderId: string | null;
}

export type ScanResult = { ok: boolean; id?: string; error?: string };
