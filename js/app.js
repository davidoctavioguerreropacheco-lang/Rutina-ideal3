// =====================================================================
// app.js: las pantallas. Etapa 3 = "Hoy" y "Sesión del día".
// (Meta de hoy y aviso de subir de peso llegan en la Etapa 4.
//  Comparar, Historial, Resumen y Ajustes en la Etapa 5.)
// =====================================================================
(function () {
  const R = window.RUTINA;
  const DB = window.DB;
  const P = window.PROGRESION;
  const CLAVE_SESION = 'tracker.sesion.v1'; // sesión abierta en este teléfono
  const main = document.getElementById('pantalla');

  // ---------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------
  // Crea un elemento HTML: el('div', {class: 'x'}, 'texto', otroElemento)
  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'class') n.className = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) n.append(h);
    return n;
  }

  function hoyISO() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
  }
  // '2026-11-13' -> 'vie, 13 nov'
  function fechaBonita(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
      .format(new Date(Date.UTC(y, m - 1, d)));
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  // Convierte "7,5" o "7.5" en 7.5. Devuelve null si no es válido.
  function kilos(texto) {
    const n = parseFloat(String(texto ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 && n < 1000 ? Math.round(n * 100) / 100 : null;
  }
  function bandasValidas(n) {
    n = parseInt(n, 10);
    return n >= 1 && n <= 6 ? n : null;
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  let temporizadorToast = null;
  function toast(texto) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = el('div', { class: 'toast', role: 'status' }, texto);
    document.body.append(t);
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => t.remove(), 4000);
  }

  // ---------------------------------------------------------------
  // Indicador "Guardado / Pendiente / Sin conexión"
  // ---------------------------------------------------------------
  function textoSync(e) {
    const p = e.pendientes ? ' · ' + plural(e.pendientes, 'serie pendiente', 'series pendientes') : '';
    if (!e.enLinea || e.error === 'Sin conexión') {
      return { clase: 'sync error', texto: 'Sin conexión' + p + '. Se mandan solas al volver la señal.' };
    }
    if (e.error) return { clase: 'sync error', texto: '⚠ No se pudo guardar: ' + e.error + p };
    if (e.pendientes) return { clase: 'sync', texto: 'Guardando…' + p };
    return { clase: 'sync ok', texto: '✓ Todo guardado en línea' };
  }
  function pintarSync() {
    const t = textoSync(DB.estado());
    document.querySelectorAll('.sync').forEach(n => { n.className = t.clase; n.textContent = t.texto; });
    // Marcas "pendiente / guardada" de cada serie
    document.querySelectorAll('[data-marca]').forEach(n => {
      const [ex, num] = n.dataset.marca.split('|');
      const pendiente = S && DB.estaPendiente('set_logs', { session_id: S.sesion.id, exercise_id: ex, set_number: Number(num) });
      n.textContent = pendiente ? 'pendiente' : 'guardada';
    });
  }
  DB.alCambiar(pintarSync);

  // ---------------------------------------------------------------
  // Estado de la sesión abierta
  //   S = { sesion: {id, fecha, dia, terminada},
  //         ej: { press_inclinado: { peso, bandas, extraTipo, extraValor,
  //                                  n (series visibles), series: [...] } } }
  // ---------------------------------------------------------------
  let S = null;
  let ultimas = {};   // "última vez" por ejercicio (undefined = cargando)
  let errores = {};   // mensaje rojo por ejercicio

  function ejerciciosHoy() { return R.ejerciciosDeDia(S.sesion.dia); }
  function info(id) { return ejerciciosHoy().find(e => e.id === id); }

  function serieInicial(e) {
    return e.unidad === 's'
      ? { reps: null, seconds: e.min, done: false, guardada: false }
      : { reps: e.min, seconds: null, done: false, guardada: false };
  }
  function estadoInicial(e) {
    return {
      peso: '', bandas: null, extraTipo: '', extraValor: '',
      n: e.series,
      series: Array.from({ length: e.seriesMax }, () => serieInicial(e)),
    };
  }
  function guardarLocal() { if (S) DB.escribirLocal(CLAVE_SESION, S); }

  // Pasa filas de la base (o de la cola) al estado de la pantalla
  function aplicarFilas(filas) {
    for (const f of filas) {
      const e = info(f.exercise_id);
      const st = S.ej[f.exercise_id];
      if (!e || !st || f.set_number > st.series.length) continue;
      st.series[f.set_number - 1] = { reps: f.reps, seconds: f.seconds, done: !!f.done, guardada: true };
      if (f.done && f.set_number > st.n) st.n = f.set_number;
      if (e.carga === 'mancuerna' && f.weight_kg != null) st.peso = String(Number(f.weight_kg));
      if (e.carga === 'banda' && f.bands != null) st.bandas = f.bands;
      if (e.carga === 'tiempo') {
        if (f.weight_kg != null) { st.extraTipo = 'kg'; st.extraValor = String(Number(f.weight_kg)); }
        else if (f.bands != null) { st.extraTipo = 'bandas'; st.extraValor = String(f.bands); }
      }
    }
  }

  // La fila que se manda a set_logs para una serie
  function filaSerie(e, i) {
    const st = S.ej[e.id];
    const s = st.series[i];
    const fila = {
      session_id: S.sesion.id, exercise_id: e.id, set_number: i + 1,
      reps: null, seconds: null, weight_kg: null, bands: null, done: s.done,
    };
    if (e.unidad === 's') fila.seconds = s.seconds; else fila.reps = s.reps;
    if (e.carga === 'mancuerna') fila.weight_kg = kilos(st.peso);
    if (e.carga === 'banda') fila.bands = bandasValidas(st.bandas);
    if (e.carga === 'tiempo') {
      if (st.extraTipo === 'kg') fila.weight_kg = kilos(st.extraValor);
      if (st.extraTipo === 'bandas') fila.bands = bandasValidas(st.extraValor);
    }
    return fila;
  }

  function guardarSerie(e, i) {
    S.ej[e.id].series[i].guardada = true;
    DB.encolar('set_logs', filaSerie(e, i));
    guardarLocal();
  }
  // Re-guarda todas las series ya registradas de un ejercicio (al cambiar peso o bandas)
  function reguardarEjercicio(e) {
    S.ej[e.id].series.forEach((s, i) => { if (s.guardada) guardarSerie(e, i); });
    guardarLocal();
  }

  function filaSesion() {
    const { id, fecha, dia, terminada } = S.sesion;
    return { id, fecha, dia, terminada };
  }

  function conteo() {
    let total = 0, hechas = 0;
    for (const e of ejerciciosHoy()) {
      const st = S.ej[e.id];
      total += st.n;
      hechas += st.series.slice(0, st.n).filter(s => s.done).length;
    }
    return { total, hechas };
  }
  function faltanDe(e) {
    const st = S.ej[e.id];
    return st.series.slice(0, st.n).filter(s => !s.done).length;
  }
  function rondaActual() {
    const dia = R.DIAS[S.sesion.dia];
    for (let i = 0; i < dia.rondas.length; i++) {
      if (faltanDe(info(dia.rondas[i].A.id)) || faltanDe(info(dia.rondas[i].B.id))) return i + 1;
    }
    return null;
  }

  // ---------------------------------------------------------------
  // Abrir, empezar y terminar sesión
  // ---------------------------------------------------------------
  function sesionLocalAbierta() {
    const l = DB.leerLocal(CLAVE_SESION, null);
    return l && l.sesion && !l.sesion.terminada ? l : null;
  }

  async function abrirSesion(sesion, { nueva }) {
    S = { sesion: { id: sesion.id, fecha: sesion.fecha, dia: sesion.dia, terminada: false }, ej: {} };
    for (const e of ejerciciosHoy()) S.ej[e.id] = estadoInicial(e);

    // 1) Lo que había en este teléfono (incluye números que aún no marcas)
    const local = DB.leerLocal(CLAVE_SESION, null);
    if (local && local.sesion && local.sesion.id === sesion.id) {
      for (const id of Object.keys(S.ej)) if (local.ej && local.ej[id]) S.ej[id] = local.ej[id];
    }
    // 2) Lo que está en la base (por si marcaste desde otro dispositivo)
    if (!nueva) {
      try { aplicarFilas(await DB.seriesDeSesion(sesion.id)); }
      catch (err) { toast('No pude leer la sesión de la base. Uso lo guardado en el teléfono.'); }
    }
    // 3) Lo pendiente en la cola es lo más nuevo
    aplicarFilas(DB.pendientesDeSesion(sesion.id));

    ultimas = {}; errores = {};
    guardarLocal();
    irA('sesion');
    cargarUltimas();
  }

  async function empezar(dia, fecha) {
    const local = sesionLocalAbierta();
    if (local && local.sesion.dia === dia && local.sesion.fecha === fecha) {
      return abrirSesion(local.sesion, { nueva: false });
    }
    if (local && !confirm('Tienes abierta la sesión del ' + R.DIAS[local.sesion.dia].nombre + ' ' +
        fechaBonita(local.sesion.fecha) + '. ¿Empezar otra de todos modos?')) return;

    // ¿Ya existe una sesión con esa fecha y ese día? Se reusa para no duplicar.
    let existente = null;
    try { existente = await DB.sesionPorFechaDia(fecha, dia); } catch (err) { /* sin conexión: se crea nueva */ }
    if (existente) {
      if (existente.terminada) {
        if (!confirm('Ya terminaste una sesión de ' + R.DIAS[dia].nombre + ' con fecha ' + fechaBonita(fecha) +
            '. ¿Abrirla otra vez para corregir?')) return;
        DB.encolar('sessions', { id: existente.id, fecha, dia, terminada: false });
      }
      return abrirSesion(existente, { nueva: false });
    }
    const nueva = { id: uuid(), fecha, dia, terminada: false };
    DB.encolar('sessions', nueva);
    return abrirSesion(nueva, { nueva: true });
  }

  function terminar() {
    const { total, hechas } = conteo();
    const faltan = total - hechas;
    if (faltan > 0 && !confirm('Te faltan ' + plural(faltan, 'serie', 'series') + '. ¿Terminar de todos modos?')) return;
    S.sesion.terminada = true;
    DB.encolar('sessions', filaSesion());
    DB.borrarLocal(CLAVE_SESION);
    S = null;
    irA('hoy');
    toast('Sesión terminada: ' + hechas + ' de ' + total + ' series. El resumen llega en la Etapa 5.');
  }

  // "Última vez" de cada ejercicio del día
  async function cargarUltimas() {
    const sesionId = S.sesion.id;
    await Promise.all(ejerciciosHoy().map(async e => {
      let r;
      try { r = await DB.ultimaVez(e.id, sesionId); }
      catch (err) {
        const guardada = DB.ultimaVezGuardada(e.id);
        r = guardada === undefined ? { sinConexion: true } : guardada;
      }
      if (!S || S.sesion.id !== sesionId) return; // cambiaste de sesión mientras cargaba
      ultimas[e.id] = r;
      // Si todavía no pones peso/bandas, se llena con lo de la última vez
      const st = S.ej[e.id];
      const nadaGuardado = !st.series.some(s => s.guardada);
      if (r && r.series && nadaGuardado) {
        const ult = r.series[r.series.length - 1];
        if (e.carga === 'mancuerna' && !st.peso && ult.weight_kg != null) st.peso = String(Number(ult.weight_kg));
        if (e.carga === 'banda' && !st.bandas && ult.bands != null) st.bandas = ult.bands;
        guardarLocal();
      }
      repintarTarjeta(e.id);
    }));
  }

  // ---------------------------------------------------------------
  // Progresión (Etapa 4): meta de hoy y avisos, usando progresion.js
  // ---------------------------------------------------------------
  function cargaHoy(e) {
    const st = S.ej[e.id];
    if (e.carga === 'mancuerna') return kilos(st.peso);
    if (e.carga === 'banda') return bandasValidas(st.bandas);
    return null;
  }
  // null = todavía no sabemos la última vez (cargando o sin conexión)
  function progreso(e) {
    const u = ultimas[e.id];
    if (u === undefined || (u && u.sinConexion)) return null;
    return P.calcular(e, u, cargaHoy(e), S.ej[e.id].n);
  }
  // Las series que aún no marcas (ni editaste) salen con la meta de hoy
  function aplicarMeta(e, meta) {
    const st = S.ej[e.id];
    for (let i = 0; i < st.n; i++) {
      const s = st.series[i];
      if (s.guardada || s.editada) continue;
      if (e.unidad === 's') s.seconds = meta[i]; else s.reps = meta[i];
    }
  }
  function valoresHechos(e) {
    const st = S.ej[e.id];
    return st.series.slice(0, st.n).filter(s => s.done).map(s => (e.unidad === 's' ? s.seconds : s.reps));
  }
  // Cuadro ámbar de "sube de peso"
  function cajaAviso(aviso, e) {
    const etiquetaMeta = e.carga === 'banda' ? 'Meta con más bandas: ' : 'Meta con el peso nuevo: ';
    return el('div', { class: 'aviso', role: 'status' },
      el('strong', {}, aviso.texto),
      aviso.metaNueva ? el('div', {}, etiquetaMeta + aviso.metaNueva.join(' - ') + (e.unidad === 's' ? ' s' : '')) : null,
      el('div', { class: 'aviso-nota' }, 'Es sugerencia: tú decides si subes.'));
  }

  // Redibuja la tarjeta un poco después y solo cuando ya no estás escribiendo en ella
  // (si se redibujara mientras escribes, se cerraría el teclado o se perdería tu toque)
  const repintesPendientes = {};
  function repintarLuego(id) {
    clearTimeout(repintesPendientes[id]);
    repintesPendientes[id] = setTimeout(() => {
      const t = document.getElementById('ej-' + id);
      if (t && t.contains(document.activeElement)) return repintarLuego(id);
      repintarTarjeta(id);
    }, 350);
  }

  function textoUltimaVez(e) {
    const r = ultimas[e.id];
    if (r === undefined) return el('span', { class: 'gris' }, 'cargando…');
    if (r === null) return 'Primera vez';
    if (r.sinConexion) return el('span', { class: 'gris' }, 'sin conexión');
    const valores = r.series.map(s => (e.unidad === 's' ? s.seconds : s.reps)).join(' - ');
    const ult = r.series[r.series.length - 1];
    let carga = '';
    if (e.carga === 'mancuerna' && ult.weight_kg != null) carga = ' con ' + Number(ult.weight_kg) + ' kg';
    if (e.carga === 'banda' && ult.bands != null) carga = ' con ' + plural(ult.bands, 'banda', 'bandas');
    if (e.carga === 'tiempo') {
      if (ult.weight_kg != null) carga = ' con ' + Number(ult.weight_kg) + ' kg';
      else if (ult.bands != null) carga = ' con ' + plural(ult.bands, 'banda', 'bandas');
    }
    return [valores + (e.unidad === 's' ? ' s' : '') + carga + ' ',
      el('span', { class: 'gris' }, '(' + fechaBonita(r.fecha) + ')')];
  }

  // ---------------------------------------------------------------
  // Acciones dentro de una tarjeta
  // ---------------------------------------------------------------
  function alternarSerie(e, i) {
    const st = S.ej[e.id];
    const s = st.series[i];
    errores[e.id] = null;
    if (!s.done) {
      if (e.carga === 'mancuerna' && kilos(st.peso) === null) return error(e, 'Pon el peso antes de marcar la serie.');
      if (e.carga === 'banda' && bandasValidas(st.bandas) === null) return error(e, 'Pon cuántas bandas usas antes de marcar.');
      const v = e.unidad === 's' ? s.seconds : s.reps;
      if (v === null || v === undefined || !(v >= 0)) return error(e, 'Pon las repeticiones de la serie.');
    }
    s.done = !s.done;
    guardarSerie(e, i);
    repintarTodo();
  }

  // Ojo: cuando el cambio viene de ESCRIBIR en el campo, no se redibuja la tarjeta.
  // Si se redibujara, el toque a la palomita que viene justo después se perdería.
  function cambiarValor(e, i, valor, redibujar = true) {
    const s = S.ej[e.id].series[i];
    let v = parseInt(valor, 10);
    if (!Number.isFinite(v) || v < 0) v = 0;
    if (v > 999) v = 999;
    if (e.unidad === 's') s.seconds = v; else s.reps = v;
    s.editada = true; // ya no se cambia sola con la meta
    if (s.guardada) guardarSerie(e, i); else guardarLocal();
    if (redibujar) repintarTarjeta(e.id); else repintarLuego(e.id);
  }

  function cambiarPeso(e, texto) {
    const st = S.ej[e.id];
    const hayHechas = st.series.some(s => s.guardada && s.done);
    if (kilos(texto) === null && hayHechas) {
      error(e, 'Ese peso no es válido. Escribe los kilos por mancuerna (ej. 7.5).');
      return;
    }
    st.peso = kilos(texto) === null ? '' : String(kilos(texto));
    error(e, null);
    reguardarEjercicio(e);
  }

  // Peso elegido de la lista (o "Otro…")
  function elegirPeso(e, valor) {
    const st = S.ej[e.id];
    if (valor === 'otro') {
      st.otro = true;
      guardarLocal();
      repintarTarjeta(e.id);
      const campo = document.getElementById('otro-' + e.id);
      if (campo) campo.focus();
      return;
    }
    if (valor === '' && st.series.some(s => s.guardada && s.done)) {
      repintarTarjeta(e.id);
      return error(e, 'Ya marcaste series con este peso. Elige un peso, no lo dejes vacío.');
    }
    st.otro = false;
    st.peso = valor;
    errores[e.id] = null;
    reguardarEjercicio(e);
    repintarTarjeta(e.id);
  }

  function cambiarBandas(e, delta) {
    const st = S.ej[e.id];
    errores[e.id] = null;
    const actual = bandasValidas(st.bandas) || 0;
    st.bandas = Math.min(6, Math.max(1, actual + delta));
    reguardarEjercicio(e);
    repintarTarjeta(e.id);
  }

  function cambiarExtra(e, tipo, valor) {
    const st = S.ej[e.id];
    const cambioTipo = st.extraTipo !== tipo;
    st.extraTipo = tipo;
    st.extraValor = valor;
    reguardarEjercicio(e);
    if (cambioTipo) repintarTarjeta(e.id);
    if (tipo === 'kg' && valor !== '' && kilos(valor) === null) error(e, 'Escribe los kilos (ej. 5).');
    else if (tipo === 'bandas' && valor !== '' && bandasValidas(valor) === null) error(e, 'Las bandas van de 1 a 6.');
    else error(e, null);
  }

  function masSerie(e) {
    const st = S.ej[e.id];
    if (st.n < e.seriesMax) st.n++;
    guardarLocal();
    repintarTodo();
  }
  function menosSerie(e) {
    const st = S.ej[e.id];
    if (st.n > e.series && !st.series[st.n - 1].done) st.n--;
    guardarLocal();
    repintarTodo();
  }

  // Muestra (o quita) el mensaje rojo de una tarjeta SIN redibujarla
  function error(e, texto) {
    errores[e.id] = texto || null;
    const t = document.getElementById('ej-' + e.id);
    if (!t) return;
    let caja = t.querySelector('.error-ej');
    if (!texto) { if (caja) caja.remove(); return; }
    if (!caja) { caja = el('div', { class: 'error-ej', role: 'alert' }); t.append(caja); }
    caja.textContent = texto;
  }

  // ---------------------------------------------------------------
  // Dibujar la tarjeta de un ejercicio
  // ---------------------------------------------------------------
  function tarjeta(e) {
    const st = S.ej[e.id];
    const rango = e.min === e.max ? String(e.min) : e.min + ' a ' + e.max;
    const faltan = faltanDe(e);

    // Progresión: meta de hoy y avisos
    const pr = progreso(e);
    if (pr) { aplicarMeta(e, pr.meta); guardarLocal(); }
    const avisoDeHoy = P.avisoHoy(e, valoresHechos(e), cargaHoy(e), st.n);
    const avisoAnterior = !avisoDeHoy && pr && pr.avisoAnterior ? pr.avisoAnterior : null;
    let textoMeta;
    if (pr) textoMeta = pr.meta.join(' - ') + (e.unidad === 's' ? ' s' : '');
    else if (ultimas[e.id] === undefined) textoMeta = el('span', { class: 'gris' }, 'cargando…');
    else textoMeta = el('span', { class: 'gris' }, 'sin conexión');

    // Campo de peso / bandas según el tipo de carga
    let campoCarga = null;
    if (e.carga === 'mancuerna') {
      const enLista = st.peso !== '' && P.filaPeso(st.peso);
      const modoOtro = !!st.otro || (st.peso !== '' && !enLista);
      const lado = st.peso === '' ? null : P.discosPorLado(st.peso);
      campoCarga = el('div', { class: 'peso' },
        el('label', { for: 'peso-' + e.id }, 'Peso por mancuerna (todas las series)'),
        el('div', { class: 'fila-peso' },
          el('select', { id: 'peso-' + e.id, onchange: ev => elegirPeso(e, ev.target.value) },
            el('option', { value: '', selected: st.peso === '' && !modoOtro }, 'Elige…'),
            R.PESOS.map(p => el('option', { value: String(p.kg), selected: !modoOtro && Number(st.peso) === p.kg }, p.kg + ' kg')),
            el('option', { value: 'otro', selected: modoOtro }, 'Otro…')),
          modoOtro ? el('input', {
            id: 'otro-' + e.id, type: 'text', inputmode: 'decimal', autocomplete: 'off',
            value: st.peso, placeholder: 'kg', 'aria-label': 'Otro peso en kg',
            onchange: ev => { cambiarPeso(e, ev.target.value); repintarLuego(e.id); },
          }) : null),
        st.peso !== '' ? el('div', { class: 'lado' },
          lado ? ['Por lado: ', el('strong', {}, lado)] : 'Por lado: arma tú los discos (peso fuera de la tabla)') : null,
        pr && pr.cargaDistinta ? el('div', { class: 'gris' }, 'Peso distinto al anterior (antes ' + pr.cargaAnterior + ' kg)') : null);
    } else if (e.carga === 'banda') {
      campoCarga = el('div', { class: 'peso' },
        el('label', {}, 'Número de bandas (todas las series)'),
        el('div', { class: 'paso' },
          el('button', { type: 'button', 'aria-label': 'Menos bandas', onclick: () => cambiarBandas(e, -1) }, '−'),
          el('input', { type: 'text', readonly: true, value: st.bandas ?? '—', 'aria-label': 'Bandas' }),
          el('button', { type: 'button', 'aria-label': 'Más bandas', onclick: () => cambiarBandas(e, +1) }, '+'),
          el('span', { class: 'unidad' }, 'bandas')),
        pr && pr.cargaDistinta ? el('div', { class: 'gris' }, 'Bandas distintas a la anterior (antes ' + pr.cargaAnterior + ')') : null);
    } else if (e.carga === 'tiempo') {
      campoCarga = el('div', { class: 'peso' },
        el('label', { for: 'extra-' + e.id }, 'Peso o banda (opcional)'),
        el('div', { class: 'fila-peso' },
          el('select', {
            id: 'extra-' + e.id,
            onchange: ev => cambiarExtra(e, ev.target.value, ev.target.value ? st.extraValor : ''),
          },
            el('option', { value: '', selected: st.extraTipo === '' }, 'Nada'),
            el('option', { value: 'kg', selected: st.extraTipo === 'kg' }, 'Peso (kg)'),
            el('option', { value: 'bandas', selected: st.extraTipo === 'bandas' }, 'Bandas')),
          st.extraTipo && el('input', {
            type: 'text', inputmode: 'decimal', value: st.extraValor, placeholder: '—',
            'aria-label': st.extraTipo === 'kg' ? 'Kilos' : 'Bandas',
            onchange: ev => cambiarExtra(e, st.extraTipo, ev.target.value),
          })));
    }

    // Una fila por serie
    const filas = [];
    for (let i = 0; i < st.n; i++) {
      const s = st.series[i];
      const valor = e.unidad === 's' ? s.seconds : s.reps;
      filas.push(el('div', { class: 'serie' + (s.done ? ' hecha' : '') },
        el('div', { class: 'num' }, 'Serie ' + (i + 1), e.unidad === 's' ? el('small', {}, 'segundos') : null,
          s.done ? el('small', { 'data-marca': e.id + '|' + (i + 1) }, '') : null),
        el('div', { class: 'paso' },
          el('button', { type: 'button', 'aria-label': 'Menos', onclick: () => cambiarValor(e, i, (valor || 0) - 1) }, '−'),
          el('input', {
            type: 'text', inputmode: 'numeric', autocomplete: 'off', value: valor ?? '',
            'aria-label': (e.unidad === 's' ? 'Segundos' : 'Repeticiones') + ' serie ' + (i + 1),
            onchange: ev => {
              cambiarValor(e, i, ev.target.value, false);
              ev.target.value = e.unidad === 's' ? st.series[i].seconds : st.series[i].reps; // muestra el número limpio
            },
          }),
          el('button', { type: 'button', 'aria-label': 'Más', onclick: () => cambiarValor(e, i, (valor || 0) + 1) }, '+')),
        el('button', {
          type: 'button', class: 'check' + (s.done ? ' hecha' : ''),
          'aria-pressed': s.done ? 'true' : 'false',
          'aria-label': (s.done ? 'Desmarcar' : 'Marcar') + ' serie ' + (i + 1),
          onclick: () => alternarSerie(e, i),
        }, '✓')));
    }

    const ultimaHecha = st.series[st.n - 1] && st.series[st.n - 1].done;
    const botonesSerie = e.seriesMax > e.series ? el('div', { class: 'botones-serie' },
      st.n < e.seriesMax ? el('button', { type: 'button', class: 'btn sec chico', onclick: () => masSerie(e) }, '+ serie') : null,
      st.n > e.series && !ultimaHecha ? el('button', { type: 'button', class: 'btn sec chico', onclick: () => menosSerie(e) }, '− quitar serie') : null,
    ) : null;

    return el('section', { class: 'tarjeta', id: 'ej-' + e.id },
      el('div', { class: 'ej-titulo' },
        el('div', { class: 'ej-letra' }, e.slot),
        el('div', {},
          el('div', { class: 'ej-nombre' }, e.nombre),
          el('div', { class: 'ej-musculo' }, e.musculo))),
      el('div', { class: 'dato' }, el('b', {}, 'Rango: '), rango + (e.unidad === 's' ? ' segundos' : ' reps')),
      el('div', { class: 'dato' }, el('b', {}, 'Última vez: '), textoUltimaVez(e)),
      el('div', { class: 'dato meta' }, el('b', {}, 'Meta de hoy: '), textoMeta),
      avisoAnterior ? cajaAviso(avisoAnterior, e) : null,
      campoCarga,
      el('div', { class: 'series' }, filas),
      avisoDeHoy ? cajaAviso(avisoDeHoy, e) : null,
      botonesSerie,
      el('div', { class: 'faltan' + (faltan ? '' : ' completo') },
        faltan ? 'Te faltan ' + plural(faltan, 'serie', 'series') : '✓ Ejercicio completo'),
      errores[e.id] ? el('div', { class: 'error-ej', role: 'alert' }, errores[e.id]) : null,
    );
  }

  function repintarTarjeta(id) {
    const vieja = document.getElementById('ej-' + id);
    if (!vieja || !S) return;
    vieja.replaceWith(tarjeta(info(id)));
    repintarEncabezado();
    pintarSync();
  }

  function repintarEncabezado() {
    const cab = document.getElementById('encabezado-sesion');
    if (!cab || !S) return;
    const { total, hechas } = conteo();
    const ronda = rondaActual();
    cab.querySelector('.progreso').textContent = hechas + ' de ' + total + ' series';
    cab.querySelector('.ronda').textContent = ronda ? 'Ronda ' + ronda + ' de 4' : '¡Todas las rondas hechas!';
    cab.querySelector('.barra-progreso div').style.width = (total ? (hechas / total) * 100 : 0) + '%';
  }

  function repintarTodo() {
    if (pantallaActual !== 'sesion') return;
    const y = window.scrollY;
    pantallaSesion();
    window.scrollTo(0, y);
  }

  // ---------------------------------------------------------------
  // Pantalla: Sesión del día
  // ---------------------------------------------------------------
  function pantallaSesion() {
    if (!S) return irA('hoy');
    const dia = R.DIAS[S.sesion.dia];
    main.replaceChildren(
      el('div', { class: 'encabezado', id: 'encabezado-sesion' },
        el('div', { class: 'linea1' },
          el('strong', {}, dia.nombre + ' · ' + fechaBonita(S.sesion.fecha)),
          el('span', { class: 'progreso' }, '')),
        el('div', { class: 'ronda' }, ''),
        el('div', { class: 'barra-progreso' }, el('div', {})),
        el('div', { class: 'sync' }, '')),
      el('p', { class: 'sub', style: 'margin-top:12px' }, dia.titulo),
      ...dia.rondas.flatMap((ronda, i) => [
        el('h2', {}, 'Ronda ' + (i + 1)),
        tarjeta(info(ronda.A.id)),
        tarjeta(info(ronda.B.id)),
      ]),
      el('button', { type: 'button', class: 'btn mt', onclick: terminar }, 'Terminar sesión'),
    );
    repintarEncabezado();
    pintarSync();
  }

  // ---------------------------------------------------------------
  // Pantalla: Hoy
  // ---------------------------------------------------------------
  let diaElegido = null;
  let fechaElegida = null;

  function pantallaHoy() {
    const hoy = hoyISO();
    if (!fechaElegida) fechaElegida = hoy;
    if (diaElegido === null) diaElegido = R.diaDeHoy();

    const local = sesionLocalAbierta();
    const cajaAbierta = el('div', {});
    const cajaUltima = el('div', { class: 'tarjeta' }, el('span', { class: 'gris' }, 'Cargando…'));

    const botonEmpezar = el('button', {
      type: 'button', class: 'btn', disabled: !diaElegido,
      onclick: async ev => {
        ev.target.disabled = true;
        await empezar(diaElegido, fechaElegida);
        ev.target.disabled = false;
      },
    }, 'Empezar sesión');

    main.replaceChildren(
      el('h1', {}, 'Hoy'),
      el('p', { class: 'sub' }, fechaBonita(hoy) + (R.diaDeHoy() ? '' : ' · día de descanso')),
      el('div', { class: 'sync' }, ''),
      cajaAbierta,
      el('h2', {}, '¿Qué día vas a entrenar?'),
      el('div', { class: 'dias' }, R.ORDEN_DIAS.map(d => el('button', {
        type: 'button', class: 'dia' + (d === diaElegido ? ' activo' : ''),
        'aria-pressed': d === diaElegido ? 'true' : 'false',
        onclick: () => { diaElegido = d; pantallaHoy(); },
      }, R.DIAS[d].nombre, el('small', {}, R.DIAS[d].titulo)))),
      el('label', { class: 'campo' },
        el('span', {}, 'Fecha (cámbiala si entrenaste otro día)'),
        el('input', {
          type: 'date', value: fechaElegida, max: hoy,
          onchange: ev => { fechaElegida = ev.target.value || hoy; },
        })),
      botonEmpezar,
      el('h2', {}, 'Última sesión terminada'),
      cajaUltima,
    );
    pintarSync();

    function mostrarAbierta(s, origen) {
      cajaAbierta.replaceChildren(el('div', { class: 'tarjeta mt' },
        el('div', {}, 'Tienes una sesión abierta:'),
        el('div', { class: 'ej-nombre' }, R.DIAS[s.dia].nombre + ' · ' + fechaBonita(s.fecha)),
        origen === 'otro' ? el('div', { class: 'gris' }, 'Empezada en otro dispositivo') : null,
        el('button', { type: 'button', class: 'btn mt', onclick: () => abrirSesion(s, { nueva: false }) }, 'Continuar sesión')));
    }
    if (local) mostrarAbierta(local.sesion, 'aqui');

    // Datos de la base (sin bloquear la pantalla)
    (async () => {
      if (!local) {
        try { const s = await DB.sesionAbierta(); if (s && pantallaActual === 'hoy') mostrarAbierta(s, 'otro'); }
        catch (err) { /* sin conexión */ }
      }
      try {
        const u = await DB.ultimaTerminada();
        cajaUltima.replaceChildren(u
          ? el('div', {},
              el('div', { class: 'ej-nombre' }, R.DIAS[u.dia].nombre + ' · ' + fechaBonita(u.fecha)),
              el('div', { class: 'gris' }, plural(u.series, 'serie hecha', 'series hechas')))
          : el('span', { class: 'gris' }, 'Todavía no terminas ninguna sesión.'));
      } catch (err) {
        cajaUltima.replaceChildren(el('span', { class: 'gris' }, 'Sin conexión: no pude leer la última sesión.'));
      }
    })();
  }

  // ---------------------------------------------------------------
  // Pantallas que llegan en la Etapa 5
  // ---------------------------------------------------------------
  function pantallaPendiente(titulo) {
    main.replaceChildren(
      el('h1', {}, titulo),
      el('div', { class: 'sync' }, ''),
      el('div', { class: 'tarjeta mt' }, el('span', { class: 'gris' }, 'Esta pantalla llega en la Etapa 5.')));
    pintarSync();
  }

  // ---------------------------------------------------------------
  // Navegación
  // ---------------------------------------------------------------
  let pantallaActual = null;
  function irA(p) {
    pantallaActual = p;
    const pestaña = p === 'sesion' ? 'hoy' : p;
    document.querySelectorAll('.nav button').forEach(b => {
      const activo = b.dataset.ir === pestaña;
      b.classList.toggle('activo', activo);
      if (activo) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (p === 'hoy') pantallaHoy();
    else if (p === 'sesion') pantallaSesion();
    else if (p === 'comparar') pantallaPendiente('Comparar');
    else if (p === 'historial') pantallaPendiente('Historial');
    else if (p === 'ajustes') pantallaPendiente('Ajustes');
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.nav button').forEach(b => b.addEventListener('click', () => {
    // "Hoy" con una sesión abierta te regresa a la sesión
    if (b.dataset.ir === 'hoy' && S && pantallaActual !== 'sesion' && pantallaActual !== 'hoy') return irA('sesion');
    irA(b.dataset.ir);
  }));

  // ---------------------------------------------------------------
  // Arranque: si dejaste una sesión abierta en este teléfono, vuelve a ella
  // ---------------------------------------------------------------
  const abierta = sesionLocalAbierta();
  if (abierta) abrirSesion(abierta.sesion, { nueva: false });
  else irA('hoy');

  // Solo para pruebas automáticas
  window.__app = { estado: () => S };
})();
