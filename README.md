# Tracker de Entrenamiento

Página web para celular que guarda cada serie de la rutina en Supabase.

## Estructura
- `supabase/01_tablas.sql` — crea las tablas `sessions` y `set_logs`, permisos y políticas. Se pega en el SQL Editor de Supabase.
- `supabase/99_borrar_prueba.sql` — borra los datos de prueba de la Etapa 1.
- `js/config.js` — URL del proyecto y clave **pública** (publishable/anon). Nunca la secret/service_role.
- `prueba-db.html` — página para probar guardar, corregir y leer una serie.

## Avance
- [x] Etapa 1: base de datos (probada por David en Chrome y Edge, 13 nov 2026)
- [ ] Etapa 2: rutina fija
- [ ] Etapa 3: sesión del día
- [ ] Etapa 4: progresión
- [ ] Etapa 5: comparar, historial, resumen y ajustes
- [ ] Etapa 6: publicar en GitHub Pages
