// =====================================================================
// db.js: todo lo que habla con Supabase.
//
// GUARDADO SEGURO (regla de oro 1):
//   1. Cada cambio se mete primero a una "cola" en el teléfono
//      (localStorage = memoria del navegador que sobrevive si cierras).
//   2. Enseguida se intenta mandar a Supabase.
//   3. Si se manda bien, se quita de la cola  -> "Guardado".
//      Si no hay internet, se queda en la cola -> "Pendiente", y se
//      reintenta solo al volver la señal y cada 15 segundos.
//
// Guardar siempre es "upsert" (crear o actualizar la fila de
// sesión + ejercicio + serie). Por eso reenviar o corregir no duplica.
// =====================================================================
(function () {
  const CLAVE_COLA = 'tracker.cola.v1';
  const CLAVE_ULTIMA = 'tracker.ultima.v1.'; // + exercise_id
  const CFG = window.APP_CONFIG || {};

  // ---------- Conexión ----------
  function problemaConfig() {
    const url = CFG.SUPABASE_URL || '';
    const k = CFG.SUPABASE_KEY || '';
    if (!url || url.startsWith('PEGA_AQUI')) return 'Falta la URL en js/config.js';
    if (!k || k.startsWith('PEGA_AQUI')) return 'Falta la clave en js/config.js';
    if (k.startsWith('sb_secret_')) return 'En config.js está la clave SECRETA. Cámbiala por la publishable.';
    if (k.startsWith('eyJ')) {
      try {
        const datos = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (datos.role !== 'anon') return 'La clave de config.js no es la pública.';
      } catch (e) { return 'La clave de config.js no se pudo leer.'; }
    }
    return null;
  }

  let cliente = null;
  function db() {
    if (cliente) return cliente;
    if (!window.supabase || problemaConfig()) return null;
    cliente = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return cliente;
  }

  // ---------- Memoria local con try/catch (puede fallar en modo incógnito) ----------
  function leerLocal(clave, porDefecto) {
    try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : porDefecto; }
    catch (e) { return porDefecto; }
  }
  function escribirLocal(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); return true; }
    catch (e) { return false; }
  }
  function borrarLocal(clave) { try { localStorage.removeItem(clave); } catch (e) {} }

  // ---------- La cola ----------
  // { "set_logs|<sesion>|<ejercicio>|<serie>": { tabla, fila, v } }
  let cola = leerLocal(CLAVE_COLA, {});
  let contador = Date.now();
  let enviando = false;
  let ultimoError = null;
  let temporizador = null;
  const oyentes = [];

  function claveDe(tabla, fila) {
    return tabla === 'sessions'
      ? 'sessions|' + fila.id
      : 'set_logs|' + fila.session_id + '|' + fila.exercise_id + '|' + fila.set_number;
  }

  function avisar() {
    const e = estado();
    oyentes.forEach(fn => { try { fn(e); } catch (err) { console.error(err); } });
  }

  function estado() {
    return {
      pendientes: Object.keys(cola).length,
      enviando,
      error: problemaConfig() || ultimoError,
      enLinea: navigator.onLine !== false,
    };
  }

  // Mete (o reemplaza) una fila en la cola y la manda enseguida
  function encolar(tabla, fila) {
    cola[claveDe(tabla, fila)] = { tabla, fila: { ...fila }, v: ++contador };
    escribirLocal(CLAVE_COLA, cola);
    avisar();
    programarEnvio(300); // espera 0.3 s por si tocas varias cosas seguidas
  }

  function programarEnvio(ms) {
    clearTimeout(temporizador);
    temporizador = setTimeout(enviar, ms);
  }

  // Si ya se está enviando, regresa esa misma promesa (así se puede "esperar a que se vacíe")
  let promesaEnvio = null;
  function enviar() {
    if (!promesaEnvio) promesaEnvio = enviarAhora().finally(() => { promesaEnvio = null; });
    return promesaEnvio;
  }

  async function enviarAhora() {
    if (!Object.keys(cola).length) return;
    const c = db();
    if (!c) {
      ultimoError = problemaConfig() || 'No cargó la librería de Supabase';
      avisar();
      programarEnvio(15000);
      return;
    }
    enviando = true;
    avisar();
    try {
      // Primero sesiones y luego series: una serie necesita que su sesión exista
      for (const tabla of ['sessions', 'set_logs']) {
        const items = Object.entries(cola).filter(([, x]) => x.tabla === tabla);
        if (!items.length) continue;
        const filas = items.map(([, x]) => x.fila);
        const conflicto = tabla === 'set_logs' ? 'session_id,exercise_id,set_number' : 'id';
        const { error } = await c.from(tabla).upsert(filas, { onConflict: conflicto });
        if (error) throw error;
        // Quitar de la cola solo lo que NO cambió mientras se enviaba
        for (const [k, x] of items) if (cola[k] && cola[k].v === x.v) delete cola[k];
        escribirLocal(CLAVE_COLA, cola);
      }
      ultimoError = null;
    } catch (e) {
      ultimoError = (e && e.message) || String(e);
      if (/fetch|network|Failed|Load failed/i.test(ultimoError)) ultimoError = 'Sin conexión';
    }
    enviando = false;
    avisar();
    if (Object.keys(cola).length) programarEnvio(ultimoError ? 15000 : 0);
  }

  // Reintentos automáticos
  window.addEventListener('online', () => programarEnvio(0));
  window.addEventListener('offline', avisar);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') programarEnvio(0);
  });
  setInterval(() => { if (Object.keys(cola).length && !enviando) enviar(); }, 15000);

  // Filas de la cola que pertenecen a una sesión (para no perder lo pendiente al recargar)
  function pendientesDeSesion(sesionId) {
    return Object.values(cola)
      .filter(x => x.tabla === 'set_logs' && x.fila.session_id === sesionId)
      .map(x => x.fila);
  }
  function estaPendiente(tabla, fila) { return !!cola[claveDe(tabla, fila)]; }

  // ---------- Lecturas ----------
  // Antes de leer, intenta mandar lo pendiente para que la lectura venga al día
  async function alDia() {
    if (Object.keys(cola).length) { try { await enviar(); } catch (e) {} }
  }

  function exigir() {
    const c = db();
    if (!c) throw new Error(problemaConfig() || 'No cargó la librería de Supabase');
    return c;
  }

  // Ordena sesiones: fecha más reciente primero; empate -> la creada después
  function masReciente(a, b) {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
    return a.creada_en < b.creada_en ? 1 : -1;
  }

  // "Última vez" de un ejercicio, sea el día que sea (sin contar la sesión actual)
  async function ultimaVez(exerciseId, excluirSesionId) {
    await alDia();
    let q = exigir().from('set_logs')
      .select('session_id, set_number, reps, seconds, weight_kg, bands, sessions!inner(fecha, dia, creada_en)')
      .eq('exercise_id', exerciseId)
      .eq('done', true)
      .order('updated_at', { ascending: false })
      .limit(60);
    if (excluirSesionId) q = q.neq('session_id', excluirSesionId);
    const { data, error } = await q;
    if (error) throw error;

    const r = agruparPorSesion(data)[0] || null;
    escribirLocal(CLAVE_ULTIMA + exerciseId, r);
    return r;
  }

  // Junta las series por sesión: [{ session_id, fecha, dia, creada_en, series: [...] }]
  // La sesión más reciente queda primero; las series en orden 1, 2, 3, 4.
  function agruparPorSesion(filas) {
    const porSesion = {};
    for (const f of filas) {
      const s = porSesion[f.session_id] ||= { ...f.sessions, session_id: f.session_id, series: [] };
      s.series.push({ set_number: f.set_number, reps: f.reps, seconds: f.seconds, weight_kg: f.weight_kg, bands: f.bands });
    }
    const lista = Object.values(porSesion).sort(masReciente);
    lista.forEach(x => x.series.sort((a, b) => a.set_number - b.set_number));
    return lista;
  }

  // Supabase regresa máximo 1000 filas por consulta: esto pide página por página
  async function todas(armarConsulta) {
    const PASO = 1000;
    let desde = 0, resultado = [];
    for (;;) {
      const { data, error } = await armarConsulta().range(desde, desde + PASO - 1);
      if (error) throw error;
      resultado = resultado.concat(data);
      if (data.length < PASO) return resultado;
      desde += PASO;
    }
  }

  // Etapa 5: todas las sesiones en que hiciste un ejercicio (la más reciente primero)
  async function historialEjercicio(exerciseId) {
    await alDia();
    const filas = await todas(() => exigir().from('set_logs')
      .select('id, session_id, set_number, reps, seconds, weight_kg, bands, sessions!inner(fecha, dia, creada_en, terminada)')
      .eq('exercise_id', exerciseId).eq('done', true).order('id'));
    return agruparPorSesion(filas);
  }

  // Etapa 5: lista de sesiones (la más reciente primero)
  async function sesiones() {
    await alDia();
    return todas(() => exigir().from('sessions')
      .select('id, fecha, dia, terminada, creada_en')
      .order('fecha', { ascending: false }).order('creada_en', { ascending: false }));
  }

  // Etapa 5: TODO lo que hay en la base, para el respaldo
  async function respaldo() {
    await alDia();
    const c = exigir();
    const [ses, series] = await Promise.all([
      todas(() => c.from('sessions').select('*').order('creada_en')),
      todas(() => c.from('set_logs').select('*').order('id')),
    ]);
    return { sessions: ses, set_logs: series };
  }
  function ultimaVezGuardada(exerciseId) { return leerLocal(CLAVE_ULTIMA + exerciseId, undefined); }

  // Sesión sin terminar más reciente (para "Continuar sesión", aun desde otro dispositivo)
  async function sesionAbierta() {
    await alDia();
    const { data, error } = await exigir().from('sessions')
      .select('id, fecha, dia, terminada, creada_en')
      .eq('terminada', false)
      .order('fecha', { ascending: false }).order('creada_en', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data[0] || null;
  }

  // Última sesión terminada + cuántas series hizo
  async function ultimaTerminada() {
    await alDia();
    const c = exigir();
    const { data, error } = await c.from('sessions')
      .select('id, fecha, dia, terminada, creada_en')
      .eq('terminada', true)
      .order('fecha', { ascending: false }).order('creada_en', { ascending: false })
      .limit(1);
    if (error) throw error;
    const s = data[0];
    if (!s) return null;
    const r = await c.from('set_logs').select('id', { count: 'exact', head: true })
      .eq('session_id', s.id).eq('done', true);
    if (r.error) throw r.error;
    return { ...s, series: r.count || 0 };
  }

  // ¿Ya existe una sesión con esa fecha y ese día? (para no crear dos por error)
  async function sesionPorFechaDia(fecha, dia) {
    await alDia();
    const { data, error } = await exigir().from('sessions')
      .select('id, fecha, dia, terminada, creada_en')
      .eq('fecha', fecha).eq('dia', dia)
      .order('creada_en', { ascending: false }).limit(1);
    if (error) throw error;
    return data[0] || null;
  }

  async function seriesDeSesion(sesionId) {
    await alDia();
    const { data, error } = await exigir().from('set_logs')
      .select('exercise_id, set_number, reps, seconds, weight_kg, bands, done')
      .eq('session_id', sesionId);
    if (error) throw error;
    return data;
  }

  window.DB = {
    problemaConfig, encolar, enviar, estado,
    alCambiar: fn => { oyentes.push(fn); fn(estado()); },
    pendientesDeSesion, estaPendiente,
    ultimaVez, ultimaVezGuardada, sesionAbierta, ultimaTerminada, sesionPorFechaDia, seriesDeSesion,
    historialEjercicio, sesiones, respaldo,
    leerLocal, escribirLocal, borrarLocal,
  };
})();
