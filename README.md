# Tracker de Entrenamiento

Página web para celular que guarda cada serie de la rutina en Supabase.

## Estructura
- `supabase/01_tablas.sql` — crea las tablas `sessions` y `set_logs`, permisos y políticas. Se pega en el SQL Editor de Supabase.
- `js/config.js` — URL del proyecto y clave **pública** (publishable/anon). Nunca la secret/service_role.
- `js/rutina.js` — la rutina fija (4 días, ejercicios, series, rangos, tipo de carga) y la tabla de pesos y discos. Se cambia aquí, no en la base.
- `prueba-rutina.html` — muestra la rutina para compararla contra el documento.
- `index.html` — la app. Pantallas Hoy y Sesión del día.
- `css/estilos.css` — colores y tamaños (oscuro, una columna, botones de 48 px o más).
- `js/progresion.js` — regla de progresión: meta de hoy, aviso de subir de peso, siguiente peso y discos por lado.
- `js/db.js` — conexión a Supabase y guardado seguro con cola (Guardado / Pendiente).
- `js/app.js` — pantallas Hoy y Sesión.
- `manifest.webmanifest` e `img/` — nombre e ícono para "Agregar a pantalla de inicio".
- `js/pantallas.js` — Resumen de sesión, Comparar, Historial y Ajustes (respaldo en .csv).

## Avance
- [x] Etapa 1: base de datos (probada por David en Chrome y Edge, 13 nov 2026)
- [x] Etapa 2: rutina fija (revisada por David)
- [x] Etapa 3: sesión del día (probada por David)
- [x] Etapa 4: progresión (probada por David)
- [x] Etapa 5: comparar, historial, resumen y ajustes (probada por David)
- [ ] Etapa 6: publicar en GitHub Pages (archivos listos; falta activar Pages)
