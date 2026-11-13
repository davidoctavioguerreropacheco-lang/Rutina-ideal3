# Tracker de Entrenamiento

Página web para celular que guarda cada serie de la rutina en Supabase.

## Estructura
- `supabase/01_tablas.sql` — crea las tablas `sessions` y `set_logs`, permisos y políticas. Se pega en el SQL Editor de Supabase.
- `supabase/99_borrar_prueba.sql` — borra los datos de prueba de la Etapa 1.
- `js/config.js` — URL del proyecto y clave **pública** (publishable/anon). Nunca la secret/service_role.
- `prueba-db.html` — página para probar guardar, corregir y leer una serie.
- `js/rutina.js` — la rutina fija (4 días, ejercicios, series, rangos, tipo de carga). Se cambia aquí, no en la base.
- `prueba-rutina.html` — muestra la rutina para compararla contra el documento.
- `index.html` — la app. Pantallas Hoy y Sesión del día.
- `css/estilos.css` — colores y tamaños (oscuro, una columna, botones de 48 px o más).
- `js/db.js` — conexión a Supabase y guardado seguro con cola (Guardado / Pendiente).
- `js/app.js` — las pantallas.

## Avance
- [x] Etapa 1: base de datos (probada por David en Chrome y Edge, 13 nov 2026)
- [x] Etapa 2: rutina fija (revisada por David)
- [x] Etapa 3: sesión del día (pendiente de prueba de David)
- [ ] Etapa 4: progresión
- [ ] Etapa 5: comparar, historial, resumen y ajustes
- [ ] Etapa 6: publicar en GitHub Pages
