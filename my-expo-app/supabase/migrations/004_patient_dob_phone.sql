-- Add patient date-of-birth and contact phone to work_orders
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS patient_dob   DATE,
  ADD COLUMN IF NOT EXISTS patient_phone TEXT;
