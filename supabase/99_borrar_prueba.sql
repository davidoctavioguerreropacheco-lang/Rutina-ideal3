-- Borra los datos de la prueba de la Etapa 1 (ejercicio 'prueba_etapa1').
-- Córrelo en Supabase > SQL Editor cuando ya veas que la prueba funcionó.
delete from public.sessions
where id in (select session_id from public.set_logs where exercise_id = 'prueba_etapa1');
