import { useState, useEffect } from 'react';
import { fetchClinics, fetchAllDoctors } from '../api';
import { Clinic, Doctor } from '../types';

export function useClinics() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [clinicRes, doctorRes] = await Promise.all([fetchClinics(), fetchAllDoctors()]);
    setClinics((clinicRes.data as Clinic[]) ?? []);
    setDoctors((doctorRes.data as Doctor[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return { clinics, doctors, loading, refetch: load };
}
