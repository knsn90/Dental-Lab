-- GERİ ALMA: 20261025102000_salary_columns_blank.sql
-- Tetikleyiciyi kaldırır, personel kartındaki maaş/TC değerlerini 2026-10-25 öncesi hâline döndürür
-- (tam kopya, 8 satır), v_user_salary_summary görünümünü canlı tanımıyla yeniden kurar.

drop trigger if exists trg_employees_comp_zblank on public.employees;
drop function if exists public.employees_comp_blank();

alter table public.employees disable trigger trg_employees_comp_guard;
alter table public.employees disable trigger trg_employees_comp_sync;
update public.employees e set base_salary = v.s, tc_no = v.t
  from (values
    ('238212ad-9b7a-4bff-b480-f7210753dcde'::uuid, '40000'::numeric, null::text),
    ('5a719855-ba60-4a5d-99cb-1cd1b65da95e'::uuid, '35000'::numeric, null::text),
    ('8b71cca2-3b10-4f11-8384-4e79a87363be'::uuid, '0'::numeric, null::text),
    ('8cb83089-11ac-4cb0-8209-d6d6ef3a3cde'::uuid, '0'::numeric, null::text),
    ('9d960b02-da4b-4443-80be-1397a372aa79'::uuid, '110000'::numeric, null::text),
    ('cec76390-2f4c-4b7d-9a87-874d58457883'::uuid, '0'::numeric, null::text),
    ('e2a611dd-e3d5-4cac-ad45-15772b84fffb'::uuid, '80000'::numeric, null::text),
    ('ed538d76-8194-4075-9070-d0b70e31f939'::uuid, '0'::numeric, null::text)
  ) v(id, s, t)
 where e.id = v.id;
update public.employees set base_salary = 0 where base_salary is null;   -- C sonrası açılan kayıtlar
alter table public.employees alter column base_salary set default 0;
alter table public.employees alter column base_salary set not null;
alter table public.employees enable trigger trg_employees_comp_guard;
alter table public.employees enable trigger trg_employees_comp_sync;

create or replace view public.v_user_salary_summary with (security_invoker=on) as
 SELECT p.id AS user_id,
    to_char(now(), 'YYYY-MM'::text) AS period_month,
    COALESCE(p.monthly_salary, (0)::numeric) AS base_salary,
    COALESCE(sum(
        CASE
            WHEN (sa.type = ANY (ARRAY['bonus_auto'::text, 'bonus_manual'::text])) THEN sa.amount
            ELSE (0)::numeric
        END), (0)::numeric) AS total_bonus,
    COALESCE(sum(
        CASE
            WHEN (sa.type = ANY (ARRAY['penalty_rework'::text, 'penalty_manual'::text])) THEN sa.amount
            ELSE (0)::numeric
        END), (0)::numeric) AS total_penalty,
    ((COALESCE(p.monthly_salary, (0)::numeric) + COALESCE(sum(
        CASE
            WHEN (sa.type = ANY (ARRAY['bonus_auto'::text, 'bonus_manual'::text])) THEN sa.amount
            ELSE (0)::numeric
        END), (0)::numeric)) - COALESCE(sum(
        CASE
            WHEN (sa.type = ANY (ARRAY['penalty_rework'::text, 'penalty_manual'::text])) THEN sa.amount
            ELSE (0)::numeric
        END), (0)::numeric)) AS net_salary
   FROM (profiles p
     LEFT JOIN salary_adjustments sa ON (((sa.user_id = p.id) AND (sa.period_month = to_char(now(), 'YYYY-MM'::text)))))
  GROUP BY p.id, p.monthly_salary;
