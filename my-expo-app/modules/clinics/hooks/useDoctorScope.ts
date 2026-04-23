// ─────────────────────────────────────────────────────────────────────────
//  Doctor scope hook
//  Giriş yapmış hekim kullanıcısının bağlı olduğu `clinics` ve `doctors`
//  kayıtlarını sağlar. Migration 033 ile eklenen
//  profiles.clinic_id / profiles.doctor_id üzerinden çalışır.
//
//  Eski profiller (kolon yokken kaydolmuş) için geriye dönük eşleştirme
//  mantığı da dener: clinic_name → clinics.name ve full_name → doctors.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import type { Clinic, Doctor } from '../../../lib/types';

export interface DoctorScope {
  clinic: Clinic | null;
  doctor: Doctor | null;
  clinicId: string | null;
  doctorId: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDoctorScope(): DoctorScope {
  const { profile } = useAuthStore();

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) { setLoading(false); return; }
    if (profile.user_type !== 'doctor') { setLoading(false); return; }

    setLoading(true);
    setError(null);

    try {
      // 1) Klinik
      let clinicId: string | null = profile.clinic_id ?? null;
      if (!clinicId && profile.clinic_name) {
        const { data } = await supabase
          .from('clinics')
          .select('*')
          .ilike('name', profile.clinic_name)
          .maybeSingle();
        if (data) clinicId = (data as Clinic).id;
      }

      let clinicRow: Clinic | null = null;
      if (clinicId) {
        const { data } = await supabase
          .from('clinics')
          .select('*')
          .eq('id', clinicId)
          .maybeSingle();
        clinicRow = (data as Clinic) ?? null;
      }

      // 2) Doktor
      let doctorId: string | null = profile.doctor_id ?? null;
      if (!doctorId && clinicId) {
        // Profildeki isim ile eşleşen ilk doktor kaydını al
        const { data } = await supabase
          .from('doctors')
          .select('*')
          .eq('clinic_id', clinicId)
          .eq('full_name', profile.full_name)
          .limit(1)
          .maybeSingle();
        if (data) doctorId = (data as Doctor).id;
      }

      let doctorRow: Doctor | null = null;
      if (doctorId) {
        const { data } = await supabase
          .from('doctors')
          .select('*, clinic:clinics(*)')
          .eq('id', doctorId)
          .maybeSingle();
        doctorRow = (data as Doctor) ?? null;
      }

      setClinic(clinicRow);
      setDoctor(doctorRow);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.clinic_id, profile?.doctor_id, profile?.clinic_name, profile?.full_name]);

  useEffect(() => { void load(); }, [load]);

  return {
    clinic,
    doctor,
    clinicId: clinic?.id ?? profile?.clinic_id ?? null,
    doctorId: doctor?.id ?? profile?.doctor_id ?? null,
    loading,
    error,
    refetch: load,
  };
}
