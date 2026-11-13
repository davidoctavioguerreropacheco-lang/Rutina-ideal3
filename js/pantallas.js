// =====================================================================
// pantallas.js: Etapa 5. Resumen de sesión, Comparar, Historial y Ajustes.
// Usa las herramientas de app.js (window.APP) cuando se abre cada pantalla.
// =====================================================================
(function () {
  const R = window.RUTINA;
  const DB = window.DB;
  const P = window.PROGRESION;
  const CLAVE_EJERCICIO = 'tracker.ejercicio.v1'; // último ejercicio que elegiste (comodidad)
  const CLAVE_RESPALDO = 'tracker.respaldo.v1';   // fecha del último respaldo (comodidad)
  const A = () => window.APP;

  // ---------------------------------------------------------------
  // Ayudantes de texto
  // ---------------------------------------------------------------
  // Datos "de catálogo" de un ejercicio (sin el rango del día)
  function infoGeneral(id) {
    for (const d of R.ORDEN_DIAS) {
      const e = R.ejerciciosDeDia(d).find(x => x.id === id);
      if (e) return e;
    }
    return null;
  }
  // En qué días aparece: "Mié y Sáb"
  function diasDe(id) {
    const cortos = { miercoles: 'Mié', jueves: 'Jue', sabado: 'Sáb', domingo: 'Dom' };
    const dias = R.ORDEN_DIAS.filter(d => R.ejerciciosDeDia(d).some(x => x.id === id)).map(d => cortos[d]);
    return dias.join(' y ');
  }
  // Ejercicios en el orden de la rutina, sin repetir
  function ejerciciosUnicos() {
    const vistos = new Set();
    const lista = [];
    for (const d of R.ORDEN_DIAS) for (const e of R.ejerciciosDeDia(d)) {
      if (!vistos.has(e.id)) { vistos.add(e.id); lista.push(e); }
    }
    return lista;
  }

  const valor = (e, s) => (e.unidad === 's' ? s.seconds : s.reps);
  const mejor = (e, series) => Math.max(...series.map(s => valor(e, s) || 0));
  // "10-10-11" (o "40-45-50 s")
  function valores(e, series) {
    return series.map(s => valor(e, s)).join('-') + (e.unidad === 's' ? ' s' : '');
  }
  // Kilos o bandas con que se hizo (de la última serie)
  function carga(e, series) {
    const u = series[series.length - 1];
    if (!u) return null;
    if (e.carga === 'mancuerna' || e.carga === 'tiempo') {
      if (u.weight_kg != null) return { n: Number(u.weight_kg), texto: Number(u.weight_kg) + ' kg' };
    }
    if (e.carga === 'banda' || e.carga === 'tiempo') {
      if (u.bands != null) return { n: Number(u.bands), texto: A().plural(Number(u.bands), 'banda', 'bandas') };
    }
    return null;
  }
  // '2026-11-11' -> 'mié 11 nov' (corta, para la tabla)
  function fechaCorta(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const partes = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
      .formatToParts(new Date(Date.UTC(y, m - 1, d)));
    const v = t => (partes.find(x => x.type === t) || {}).value || '';
    return v('weekday').replace('.', '') + ' ' + v('day') + ' ' + v('month').replace('.', '');
  }
  function conSigno(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'; }

  // Selector de ejercicio (se acuerda del último que elegiste)
  function selectorEjercicio(alElegir) {
    const { el } = A();
    const guardado = DB.leerLocal(CLAVE_EJERCICIO, '');
    const sel = el('select', {
      class: 'selector', 'aria-label': 'Ejercicio',
      onchange: ev => { DB.escribirLocal(CLAVE_EJERCICIO, ev.target.value); alElegir(ev.target.value); },
    },
      el('option', { value: '' }, 'Elige un ejercicio…'),
      ejerciciosUnicos().map(e => el('option', { value: e.id, selected: e.id === guardado }, e.nombre + ' · ' + diasDe(e.id))));
    if (guardado && R.EJERCICIOS[guardado]) setTimeout(() => alElegir(guardado), 0);
    return sel;
  }

  // Traduce errores técnicos a algo entendible
  function mensajeError(err) {
    const m = (err && err.message) || '';
    if (!m || /fetch|network|Failed|Load failed|conexión/i.test(m)) return 'no hay conexión a internet';
    return m;
  }

  function cargando(texto) { return A().el('div', { class: 'tarjeta' }, A().el('span', { class: 'gris' }, texto || 'Cargando…')); }
  function sinConexion(err) {
    return A().el('div', { class: 'tarjeta' }, A().el('span', { class: 'error-ej' },
      'No pude leer la base: ' + mensajeError(err) + '. Revisa tu internet y vuelve a abrir esta pantalla.'));
  }

  // ---------------------------------------------------------------
  // 3. RESUMEN DE SESIÓN
  //   datos = { sesion, hoy: {id: [series]}, previa: {id: últimaVez|null|undefined}, desde }
  // ---------------------------------------------------------------
  function resumen(datos) {
    const { el, main, fechaBonita, plural, irA, pintarSync } = A();
    const { sesion, hoy, previa } = datos;
    const dia = R.DIAS[sesion.dia];
    const lista = R.ejerciciosDeDia(sesion.dia);
    let total = 0, hechas = 0, tocaSubir = 0;

    const filas = lista.map(e => {
      const s = hoy[e.id] || [];
      hechas += s.length;
      total += Math.max(e.series, ...s.map(x => x.set_number));
      const ant = previa[e.id];
      const partes = [el('div', { class: 'res-nombre' }, el('span', { class: 'gris' }, e.ronda + e.slot + ' '), e.nombre)];

      if (!s.length) {
        partes.push(el('div', { class: 'gris' }, 'No lo hiciste'));
      } else {
        let comparacion;
        if (ant === undefined) comparacion = valores(e, s) + ' (sin datos de la vez anterior)';
        else if (ant === null) comparacion = valores(e, s) + ' · primera vez';
        else comparacion = valores(e, s) + ' vs ' + valores(e, ant.series) + ': ' + conSigno(mejor(e, s) - mejor(e, ant.series));
        partes.push(el('div', { class: 'res-reps' }, comparacion));

        const c = carga(e, s);
        const cAnt = ant && carga(e, ant.series);
        if (c) partes.push(el('div', { class: 'gris' }, 'Con ' + c.texto + (cAnt && cAnt.n !== c.n ? ' (antes ' + cAnt.texto + ')' : '')));

        const aviso = P.avisoHoy(e, s.map(x => valor(e, x)), c && e.carga !== 'tiempo' ? c.n : null, s.length);
        if (aviso) {
          tocaSubir++;
          partes.push(el('div', { class: 'aviso chico' }, el('strong', {}, 'Toca subir'), aviso.texto));
        }
      }
      return el('div', { class: 'res-fila' }, partes);
    });

    main.replaceChildren(
      el('h1', {}, 'Resumen'),
      el('p', { class: 'sub' }, dia.nombre + ' · ' + fechaBonita(sesion.fecha) + ' · ' + dia.titulo),
      el('div', { class: 'sync' }, ''),
      el('div', { class: 'tarjeta mt resumen-total' },
        el('div', { class: 'grande' }, hechas + ' de ' + total + ' series'),
        tocaSubir ? el('div', { class: 'ambar' }, plural(tocaSubir, 'ejercicio ya toca subir de peso', 'ejercicios ya tocan subir de peso')) : null),
      el('div', { class: 'tarjeta' }, filas),
      el('button', { type: 'button', class: 'btn', onclick: () => irA(datos.desde === 'historial' ? 'historial' : 'hoy') },
        datos.desde === 'historial' ? 'Volver al historial' : 'Listo'),
    );
    pintarSync();
  }

  // Resumen de una sesión vieja (desde Historial): se arma leyendo la base
  async function resumenDeSesion(sesion) {
    const { main, el } = A();
    main.replaceChildren(el('h1', {}, 'Resumen'), cargando());
    try {
      const datos = { sesion, hoy: {}, previa: {}, desde: 'historial' };
      await Promise.all(R.ejerciciosDeDia(sesion.dia).map(async e => {
        const hist = await DB.historialEjercicio(e.id);
        const i = hist.findIndex(x => x.session_id === sesion.id);
        datos.hoy[e.id] = i >= 0 ? hist[i].series : [];
        datos.previa[e.id] = i >= 0 ? hist[i + 1] || null : null; // la anterior a ESA sesión
      }));
      resumen(datos);
    } catch (err) {
      main.replaceChildren(el('h1', {}, 'Resumen'), sinConexion(err));
    }
  }

  // ---------------------------------------------------------------
  // 4. COMPARAR (sesión por sesión)
  // ---------------------------------------------------------------
  function comparar() {
    const { el, main, pintarSync } = A();
    const caja = el('div', {});

    async function mostrar(id) {
      if (!id) { caja.replaceChildren(); return; }
      caja.replaceChildren(cargando());
      const e = infoGeneral(id);
      let hist;
      try { hist = await DB.historialEjercicio(id); } catch (err) { return caja.replaceChildren(sinConexion(err)); }
      if (!hist.length) return caja.replaceChildren(cargando('Todavía no has hecho este ejercicio.'));

      const encabezado = el('tr', {},
        el('th', {}, 'Fecha'), el('th', {}, e.carga === 'corporal' ? '' : 'Carga'),
        el('th', {}, e.unidad === 's' ? 'Segundos' : 'Reps'), el('th', { class: 'der' }, 'Cambio'));
      const filas = hist.map((h, i) => {
        const ant = hist[i + 1]; // la sesión anterior de ESTE ejercicio (sea el día que sea)
        const c = carga(e, h.series);
        const cAnt = ant && carga(e, ant.series);
        let cambio = '—';
        let notaCarga = null;
        if (ant) {
          cambio = conSigno(mejor(e, h.series) - mejor(e, ant.series));
          if (c && cAnt && c.n !== cAnt.n) notaCarga = el('small', {}, c.n > cAnt.n ? '↑ más carga' : '↓ menos carga');
        }
        return el('tr', {},
          el('td', { class: 'nowrap' }, fechaCorta(h.fecha)),
          el('td', { class: 'nowrap' }, c ? c.texto : ''),
          el('td', { class: 'reps' }, valores(e, h.series)),
          el('td', { class: 'der' }, cambio, notaCarga));
      });
      caja.replaceChildren(
        el('p', { class: 'sub mt' }, 'La más reciente arriba. "Cambio" compara tu mejor serie contra la sesión anterior de este ejercicio.'),
        el('div', { class: 'tarjeta tabla-caja' }, el('table', { class: 'tabla' }, el('thead', {}, encabezado), el('tbody', {}, filas))));
    }

    main.replaceChildren(
      el('h1', {}, 'Comparar'),
      el('p', { class: 'sub' }, 'Sesión por sesión, por ejercicio.'),
      el('div', { class: 'sync' }, ''),
      el('label', { class: 'campo mt' }, el('span', {}, 'Ejercicio'), selectorEjercicio(mostrar)),
      caja);
    pintarSync();
  }

  // ---------------------------------------------------------------
  // 5. HISTORIAL
  // ---------------------------------------------------------------
  function historial() {
    const { el, main, pintarSync, fechaBonita } = A();
    const cajaSesiones = cargando();
    const cajaEjercicio = el('div', {});
    let cuantas = 10;

    async function pintarSesiones() {
      let lista;
      try { lista = await DB.sesiones(); }
      catch (err) { const x = sinConexion(err); x.id = 'caja-sesiones'; return main.querySelector('#caja-sesiones').replaceWith(x); }
      const nueva = el('div', { class: 'tarjeta' },
        lista.length ? null : el('span', { class: 'gris' }, 'Todavía no hay sesiones.'),
        lista.slice(0, cuantas).map(s => el('button', {
          type: 'button', class: 'fila-sesion', onclick: () => resumenDeSesion(s),
        },
          el('span', {}, R.DIAS[s.dia].nombre + ' · ' + fechaBonita(s.fecha)),
          el('span', { class: s.terminada ? 'gris' : 'abierta' }, s.terminada ? 'Ver resumen ›' : 'Abierta ›'))),
        lista.length > cuantas ? el('button', {
          type: 'button', class: 'btn sec mt', onclick: () => { cuantas += 10; pintarSesiones(); },
        }, 'Ver más') : null);
      nueva.id = 'caja-sesiones';
      const vieja = main.querySelector('#caja-sesiones');
      if (vieja) vieja.replaceWith(nueva);
    }

    async function mostrarEjercicio(id) {
      if (!id) { cajaEjercicio.replaceChildren(); return; }
      cajaEjercicio.replaceChildren(cargando());
      const e = infoGeneral(id);
      let hist;
      try { hist = await DB.historialEjercicio(id); } catch (err) { return cajaEjercicio.replaceChildren(sinConexion(err)); }
      if (!hist.length) return cajaEjercicio.replaceChildren(cargando('Todavía no has hecho este ejercicio.'));

      // Cambios de peso (o de bandas), del más reciente al más viejo
      const cambios = [];
      const viejoAnuevo = [...hist].reverse();
      viejoAnuevo.forEach((h, i) => {
        const c = carga(e, h.series);
        const cAnt = i > 0 ? carga(e, viejoAnuevo[i - 1].series) : null;
        if (!c) return;
        if (i === 0) cambios.push(fechaBonita(h.fecha) + ': empezaste con ' + c.texto);
        else if (cAnt && cAnt.n !== c.n) cambios.push(fechaBonita(h.fecha) + ': ' + cAnt.texto.replace(/ (kg|bandas?)$/, '') + ' → ' + c.texto);
      });
      cambios.reverse();

      cajaEjercicio.replaceChildren(
        el('h2', {}, e.carga === 'banda' ? 'Cambios de bandas' : 'Cambios de peso'),
        el('div', { class: 'tarjeta' },
          e.carga === 'corporal' ? el('span', { class: 'gris' }, 'Este ejercicio es con peso corporal: no lleva peso.')
            : cambios.length ? cambios.map(t => el('div', { class: 'linea-lista' }, t))
              : el('span', { class: 'gris' }, 'Sin peso registrado.')),
        el('h2', {}, 'Mejor serie de cada sesión'),
        el('div', { class: 'tarjeta' }, hist.map(h => {
          const c = carga(e, h.series);
          return el('div', { class: 'linea-lista' },
            el('span', {}, fechaBonita(h.fecha)),
            el('strong', {}, mejor(e, h.series) + (e.unidad === 's' ? ' s' : ' reps') + (c ? ' · ' + c.texto : '')));
        })));
    }

    cajaSesiones.id = 'caja-sesiones';
    main.replaceChildren(
      el('h1', {}, 'Historial'),
      el('div', { class: 'sync' }, ''),
      el('h2', {}, 'Sesiones'),
      cajaSesiones,
      el('h2', {}, 'Por ejercicio'),
      el('label', { class: 'campo' }, el('span', {}, 'Ejercicio'), selectorEjercicio(mostrarEjercicio)),
      cajaEjercicio);
    pintarSync();
    pintarSesiones();
  }

  // ---------------------------------------------------------------
  // AJUSTES: estado de conexión y respaldo
  // ---------------------------------------------------------------
  function pintarEstadoAjustes(est) {
    const con = document.getElementById('aj-conexion');
    if (!con) return;
    const sinRed = !est.enLinea || est.error === 'Sin conexión';
    con.textContent = sinRed ? 'Sin conexión' : 'En línea';
    con.className = sinRed ? 'rojo' : 'verde';
    document.getElementById('aj-pendientes').textContent = String(est.pendientes);
    const err = document.getElementById('aj-error');
    err.textContent = est.error && !sinRed ? 'Último error: ' + est.error : '';
  }
  DB.alCambiar(pintarEstadoAjustes);

  function csv(celdas) {
    return celdas.map(v => {
      const t = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }).join(',');
  }

  // Une sesiones y series en un solo archivo .csv (abre en Excel o Google Sheets)
  function armarCSV({ sessions, set_logs }) {
    const sesion = Object.fromEntries(sessions.map(s => [s.id, s]));
    const orden = id => { // orden de la rutina para que se lea bonito
      const i = ejerciciosUnicos().findIndex(e => e.id === id); return i < 0 ? 99 : i;
    };
    const lineas = [csv(['fecha', 'dia', 'sesion_terminada', 'ejercicio_id', 'ejercicio', 'serie', 'reps', 'segundos',
      'peso_kg', 'bandas', 'hecha', 'actualizado', 'session_id', 'sesion_creada'])];
    const conSeries = new Set(set_logs.map(f => f.session_id));
    const filas = set_logs.map(f => ({ s: sesion[f.session_id] || {}, f }))
      .concat(sessions.filter(s => !conSeries.has(s.id)).map(s => ({ s, f: null })));
    filas.sort((a, b) => (a.s.fecha || '').localeCompare(b.s.fecha || '') ||
      (a.s.creada_en || '').localeCompare(b.s.creada_en || '') ||
      (a.f ? orden(a.f.exercise_id) : -1) - (b.f ? orden(b.f.exercise_id) : -1) ||
      (a.f ? a.f.set_number : 0) - (b.f ? b.f.set_number : 0));
    for (const { s, f } of filas) {
      lineas.push(csv([s.fecha, s.dia, s.terminada ? 'si' : 'no',
        f && f.exercise_id, f && R.EJERCICIOS[f.exercise_id] ? R.EJERCICIOS[f.exercise_id].nombre : '',
        f && f.set_number, f && f.reps, f && f.seconds, f && f.weight_kg, f && f.bands,
        f ? (f.done ? 'si' : 'no') : '', f && f.updated_at, s.id, s.creada_en]));
    }
    return { texto: lineas.join('\r\n'), series: set_logs.length, sesiones: sessions.length };
  }

  async function exportar(boton, estado) {
    const { hoyISO, plural, el } = A();
    boton.disabled = true;
    estado.className = 'gris mt'; estado.textContent = 'Leyendo tus datos…';
    try {
      const datos = await DB.respaldo();
      const r = armarCSV(datos);
      const archivo = new Blob(['﻿' + r.texto], { type: 'text/csv;charset=utf-8' }); // ﻿ = acentos bien en Excel
      const enlace = el('a', { href: URL.createObjectURL(archivo), download: 'respaldo-tracker-' + hoyISO() + '.csv' });
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 10000);
      DB.escribirLocal(CLAVE_RESPALDO, hoyISO());
      estado.className = 'verde mt';
      estado.textContent = '✓ Listo: ' + plural(r.sesiones, 'sesión', 'sesiones') + ' y ' + plural(r.series, 'serie', 'series') + '. Revisa tus descargas.';
    } catch (err) {
      estado.className = 'error-ej';
      estado.textContent = 'No se pudo exportar: ' + mensajeError(err) + '. Inténtalo con internet.';
    }
    boton.disabled = false;
  }

  function ajustes() {
    const { el, main, fechaBonita, pintarSync } = A();
    const ultimo = DB.leerLocal(CLAVE_RESPALDO, null);
    const estadoRespaldo = el('div', { class: 'gris mt' }, ultimo ? 'Último respaldo desde este teléfono: ' + fechaBonita(ultimo) : '');
    const botonRespaldo = el('button', { type: 'button', class: 'btn mt' }, 'Exportar respaldo');
    botonRespaldo.addEventListener('click', () => exportar(botonRespaldo, estadoRespaldo));

    main.replaceChildren(
      el('h1', {}, 'Ajustes'),
      el('div', { class: 'sync' }, ''),
      el('h2', {}, 'Conexión'),
      el('div', { class: 'tarjeta' },
        el('div', { class: 'linea-lista' }, el('span', {}, 'Estado'), el('strong', { id: 'aj-conexion' }, '')),
        el('div', { class: 'linea-lista' }, el('span', {}, 'Series pendientes de sincronizar'), el('strong', { id: 'aj-pendientes' }, '0')),
        el('div', { id: 'aj-error', class: 'error-ej' }, ''),
        el('button', { type: 'button', class: 'btn sec mt', onclick: () => DB.enviar() }, 'Reintentar ahora')),
      el('h2', {}, 'Respaldo'),
      el('div', { class: 'tarjeta' },
        el('div', {}, 'Descarga todas tus sesiones y series en un archivo .csv que abre Excel o Google Sheets.'),
        botonRespaldo,
        estadoRespaldo));
    pintarSync();
    pintarEstadoAjustes(DB.estado());
  }

  window.PANTALLAS = { resumen, comparar, historial, ajustes, _armarCSV: armarCSV };
})();
