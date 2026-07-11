-- Eski admin-create-user / signUpClinic akışları clinic_admin'leri
-- user_type='doctor' + role='clinic_admin' olarak yazıyordu.
-- Bu kayıtları kullanıcı listesinde Klinik filtresine düşmesi için yükselt.
UPDATE public.profiles
   SET user_type = 'clinic_admin'
 WHERE role = 'clinic_admin'
   AND user_type = 'doctor';
