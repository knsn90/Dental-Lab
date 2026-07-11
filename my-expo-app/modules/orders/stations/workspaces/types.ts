// modules/orders/stations/workspaces/types.ts
// İstasyon-spesifik workspace bileşenlerine geçirilen ortak prop seti.
// Slim — workspace gerekirse kendisi ek veri çeker (photos, history, vs).

export interface StageWorkspaceProps {
  stageId:      string;
  workOrderId:  string;
  stationName:  string | null;
  toothNumbers: number[];
  shade:        string | null;
  workType:     string | null;
  /** Hekim notu (doctor-visible). */
  notes:        string | null;
  /** Lab iç notu. */
  labNotes:     string | null;
  patientName:  string | null;
  /** Bu workspace'in kullanması için işaretlenmiş validation key'leri. */
  checkedKeys:  Set<string>;
  /** Aşama "aktif" mi yoksa "bekliyor" mu — UI'ı ona göre disable etmek için. */
  isActive:     boolean;
}
