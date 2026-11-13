// =====================================================================
// progresion.js: la regla de progresión del documento (Etapa 4).
// Son funciones "puras": reciben datos y regresan resultados, sin tocar
// la pantalla ni la base. Así se pueden probar solas.
//
// Resumen de la regla:
//   base de hoy = tu mejor serie de la última vez (sea el día que sea)
//   meta de hoy = base en todas las series, base + 1 en la última
//                 (plancha: base + 5 s en la última; provisional)
//   primera vez = base es el mínimo del rango
//   subiste de peso (o de bandas) = base vuelve al mínimo del rango
//   bajaste de peso = la base se queda igual
//   aviso = alguna serie pasa el máximo del rango del día
// =====================================================================
(function () {
  const R = window.RUTINA;

  // ---------- Pesos y discos ----------
  function filaPeso(kg) {
    return R.PESOS.find(p => p.kg === Number(kg)) || null;
  }
  // "Por lado: 2.5 + 1.25" (o null si ese peso no está en la tabla)
  function discosPorLado(kg) {
    const f = filaPeso(kg);
    return f ? f.lado : null;
  }
  // Siguiente peso que se puede armar (después de 8.5 sigue 11)
  function siguientePeso(kg) {
    return R.PESOS.find(p => p.kg > Number(kg)) || null;
  }

  // ---------- Lo que se compara ----------
  // Reps (o segundos en plancha) de una serie
  function valor(e, serie) { return e.unidad === 's' ? serie.seconds : serie.reps; }
  // "Carga" de la serie: kilos en mancuerna, número de bandas en banda
  function cargaDe(e, serie) {
    if (!serie) return null;
    if (e.carga === 'mancuerna') return serie.weight_kg == null ? null : Number(serie.weight_kg);
    if (e.carga === 'banda') return serie.bands == null ? null : Number(serie.bands);
    return null; // peso corporal y plancha: no hay carga que comparar
  }
  const incremento = e => (e.unidad === 's' ? 5 : 1);

  function armarMeta(e, base, numSeries) {
    return Array.from({ length: numSeries }, (_, i) => (i === numSeries - 1 ? base + incremento(e) : base));
  }

  // Texto de la sugerencia según el tipo de carga
  //   carga = kilos (mancuerna) o bandas que se usaron cuando se pasó el máximo
  function sugerencia(e, carga) {
    if (e.carga === 'mancuerna') {
      const sig = carga == null ? null : siguientePeso(carga);
      if (!sig) return { texto: 'Ya estás en el peso más alto que puedes armar (' + carga + ' kg).', kg: null };
      return { texto: 'Sube a ' + sig.kg + ' kg: pon por lado ' + sig.lado + '.', kg: sig.kg };
    }
    if (e.carga === 'banda') return { texto: 'Agrega una banda o usa una más fuerte.', bandas: carga == null ? null : carga + 1 };
    return { texto: 'Sube la dificultad (ejemplo: agrega peso o una banda).' };
  }
  function tituloAviso(e) {
    return e.unidad === 's' ? 'Pasaste ' + e.max + ' s.' : 'Pasaste el máximo.';
  }

  // -------------------------------------------------------------------
  // calcular(): todo lo que la tarjeta necesita saber
  //   e          ejercicio del día (de RUTINA.ejerciciosDeDia)
  //   ultima     la última vez: { series: [{reps, seconds, weight_kg, bands}] } o null
  //   cargaHoy   kilos (o bandas) elegidos hoy, o null si aún no eliges
  //   numSeries  cuántas series hay hoy (3 o 4)
  // -------------------------------------------------------------------
  function calcular(e, ultima, cargaHoy, numSeries) {
    const r = {
      primeraVez: !ultima, base: e.min, meta: null,
      cargaAnterior: null, cargaDistinta: false,
      avisoAnterior: null, // la vez pasada se pasó del máximo y hoy no ha subido
    };
    if (ultima && ultima.series.length) {
      const mejor = Math.max(...ultima.series.map(s => valor(e, s) || 0));
      const ult = ultima.series[ultima.series.length - 1];
      r.cargaAnterior = cargaDe(e, ult);
      r.base = mejor;

      const anterior = r.cargaAnterior;
      const hoy = cargaHoy == null ? null : Number(cargaHoy);
      const comparables = anterior != null && hoy != null;
      const subio = comparables && hoy > anterior;
      if (subio) r.base = e.min; // al subir de carga, la base vuelve al mínimo

      const sePaso = mejor > e.max;
      const sug = sePaso ? sugerencia(e, anterior) : null;
      if (sePaso && !subio) {
        r.avisoAnterior = {
          texto: 'La vez pasada ' + tituloAviso(e).replace('Pasaste', 'pasaste') + ' ' + sug.texto,
          metaNueva: (e.carga === 'mancuerna' && sug.kg) || e.carga === 'banda' ? armarMeta(e, e.min, numSeries) : null,
        };
      }
      // "Peso distinto al anterior": salvo que hayas subido justo a lo que se sugirió
      const siguioSugerencia = sug && subio &&
        ((e.carga === 'mancuerna' && hoy === sug.kg) || (e.carga === 'banda' && hoy === sug.bandas));
      r.cargaDistinta = comparables && hoy !== anterior && !siguioSugerencia;
    }
    r.meta = armarMeta(e, r.base, numSeries);
    return r;
  }

  // -------------------------------------------------------------------
  // avisoHoy(): ¿alguna serie marcada HOY pasó el máximo?
  //   valoresHechos  reps (o segundos) de las series marcadas hoy
  // -------------------------------------------------------------------
  function avisoHoy(e, valoresHechos, cargaHoy, numSeries) {
    if (!valoresHechos.some(v => v > e.max)) return null;
    const sug = sugerencia(e, cargaHoy == null ? null : Number(cargaHoy));
    const conMeta = (e.carga === 'mancuerna' && sug.kg) || e.carga === 'banda';
    return {
      texto: tituloAviso(e) + ' ' + sug.texto,
      metaNueva: conMeta ? armarMeta(e, e.min, numSeries) : null,
    };
  }

  window.PROGRESION = { calcular, avisoHoy, discosPorLado, siguientePeso, filaPeso };
})();
