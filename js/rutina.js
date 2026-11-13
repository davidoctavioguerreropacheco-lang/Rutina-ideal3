// =====================================================================
// RUTINA FIJA (Etapa 2)
// Copiada tal cual del documento "Tracker de Entrenamiento -
// Especificación completa". La base de datos NO guarda esto: solo
// guarda lo que tú registras (reps, peso, bandas, segundos).
//
// Si algún día cambias la rutina, se cambia AQUÍ, no en Supabase.
// =====================================================================

// ---------------------------------------------------------------------
// 1) Catálogo de ejercicios
//    La "llave" (ej. press_inclinado) es el id fijo que se guarda en
//    set_logs.exercise_id. Si un ejercicio aparece en dos días, usa el
//    MISMO id y por eso comparte un solo historial.
//
//    carga:
//      'mancuerna' = kilos por mancuerna
//      'banda'     = número de bandas (1 a 6)
//      'corporal'  = solo repeticiones
//      'tiempo'    = segundos (plancha), con campo opcional peso o banda
// ---------------------------------------------------------------------
const EJERCICIOS = {
  // Comparten historial (aparecen en dos días)
  press_inclinado:        { nombre: 'Press inclinado con mancuernas',        carga: 'mancuerna' },
  jalon_pecho_banda:      { nombre: 'Jalón al pecho con banda',              carga: 'banda' },
  elevacion_lateral:      { nombre: 'Elevación lateral',                     carga: 'mancuerna' },
  face_pull_banda:        { nombre: 'Face pull con banda',                   carga: 'banda' },
  curl_martillo:          { nombre: 'Curl martillo',                         carga: 'mancuerna' },
  peso_muerto_rumano:     { nombre: 'Peso muerto rumano',                    carga: 'mancuerna' },
  curl_muneca_supino:     { nombre: 'Curl de muñeca supino',                 carga: 'mancuerna' },
  crunch_banda:           { nombre: 'Crunch con banda',                      carga: 'banda' },
  elevacion_talones:      { nombre: 'Elevación de talones a una pierna',     carga: 'corporal' },

  // Aparecen un solo día
  press_plano:            { nombre: 'Press plano con mancuernas',            carga: 'mancuerna' },
  remo_unilateral:        { nombre: 'Remo unilateral con mancuerna',         carga: 'mancuerna' },
  curl_inclinado_45:      { nombre: 'Curl inclinado a 45°',                  carga: 'mancuerna' },
  press_frances:          { nombre: 'Press francés',                         carga: 'mancuerna' },
  sentadilla_goblet:      { nombre: 'Sentadilla goblet',                     carga: 'mancuerna' },
  curl_inverso:           { nombre: 'Curl inverso con mancuerna',            carga: 'mancuerna' },
  elevacion_piernas_banco:{ nombre: 'Elevación de piernas en banco',         carga: 'corporal' },
  remo_bilateral_inclinado:{ nombre: 'Remo bilateral en banco inclinado',    carga: 'mancuerna' },
  press_militar_sentado:  { nombre: 'Press militar sentado con mancuernas',  carga: 'mancuerna' },
  pushdown_banda:         { nombre: 'Pushdown con banda',                    carga: 'banda' },
  sentadilla_bulgara:     { nombre: 'Sentadilla búlgara',                    carga: 'mancuerna' },
  curl_muneca_invertido:  { nombre: 'Curl de muñeca invertido',              carga: 'mancuerna' },
  extension_cuadriceps_banda: { nombre: 'Extensión de cuádriceps en banco con banda', carga: 'banda' },
  plancha:                { nombre: 'Plancha con peso o banda',              carga: 'tiempo' },
};

// ---------------------------------------------------------------------
// 2) Los 4 días
//    Cada día tiene 4 rondas. Cada ronda tiene ejercicio A y B.
//
//    series:    cuántas series salen por defecto
//    seriesMax: solo en los "3-4": permite el botón "+ serie" hasta 4
//    min / max: rango de repeticiones de ESE día
//               (en plancha son segundos)
//
//    El músculo va aquí y no en el catálogo porque el documento lo
//    escribe distinto según el día (curl martillo: "Braquial" el jueves,
//    "Bíceps y braquial" el sábado).
// ---------------------------------------------------------------------
const DIAS = {
  miercoles: {
    nombre: 'Miércoles',
    titulo: 'Torso A',
    diaSemana: 3, // 0 = domingo ... 6 = sábado (así cuenta JavaScript)
    rondas: [
      { A: { id: 'press_inclinado',   musculo: 'Pecho',            series: 4,               min: 8,  max: 12 },
        B: { id: 'jalon_pecho_banda', musculo: 'Espalda',          series: 3,               min: 10, max: 12 } },
      { A: { id: 'press_plano',       musculo: 'Pecho',            series: 3,               min: 8,  max: 12 },
        B: { id: 'remo_unilateral',   musculo: 'Espalda',          series: 3, seriesMax: 4, min: 10, max: 12 } },
      { A: { id: 'elevacion_lateral', musculo: 'Hombro',           series: 3, seriesMax: 4, min: 12, max: 15 },
        B: { id: 'curl_inclinado_45', musculo: 'Bíceps',           series: 3,               min: 10, max: 12 } },
      { A: { id: 'face_pull_banda',   musculo: 'Hombro posterior', series: 3,               min: 15, max: 15 },
        B: { id: 'press_frances',     musculo: 'Tríceps',          series: 3,               min: 10, max: 12 } },
    ],
  },

  jueves: {
    nombre: 'Jueves',
    titulo: 'Piernas A, abdomen y antebrazos',
    diaSemana: 4,
    rondas: [
      { A: { id: 'sentadilla_goblet',       musculo: 'Cuádriceps', series: 3, seriesMax: 4, min: 8,  max: 12 },
        B: { id: 'curl_inverso',            musculo: 'Antebrazo',  series: 3,               min: 12, max: 15 } },
      { A: { id: 'peso_muerto_rumano',      musculo: 'Isquios',    series: 3,               min: 8,  max: 12 },
        B: { id: 'curl_muneca_supino',      musculo: 'Antebrazo',  series: 3,               min: 15, max: 20 } },
      { A: { id: 'elevacion_talones',       musculo: 'Gemelos',    series: 3,               min: 12, max: 15 },
        B: { id: 'elevacion_piernas_banco', musculo: 'Abdomen',    series: 3,               min: 12, max: 15 } },
      { A: { id: 'crunch_banda',            musculo: 'Abdomen',    series: 3,               min: 10, max: 15 },
        B: { id: 'curl_martillo',           musculo: 'Braquial',   series: 3,               min: 10, max: 12 } },
    ],
  },

  sabado: {
    nombre: 'Sábado',
    titulo: 'Torso B',
    diaSemana: 6,
    rondas: [
      { A: { id: 'press_inclinado',          musculo: 'Pecho',             series: 3, min: 10, max: 12 },
        B: { id: 'jalon_pecho_banda',        musculo: 'Espalda',           series: 3, min: 12, max: 15 } },
      { A: { id: 'remo_bilateral_inclinado', musculo: 'Espalda',           series: 3, min: 10, max: 12 },
        B: { id: 'elevacion_lateral',        musculo: 'Hombro',            series: 3, min: 12, max: 15 } },
      { A: { id: 'press_militar_sentado',    musculo: 'Hombro',            series: 3, min: 10, max: 12 },
        B: { id: 'curl_martillo',            musculo: 'Bíceps y braquial', series: 3, min: 10, max: 12 } },
      { A: { id: 'face_pull_banda',          musculo: 'Hombro posterior',  series: 3, min: 15, max: 15 },
        B: { id: 'pushdown_banda',           musculo: 'Tríceps',           series: 3, min: 12, max: 15 } },
    ],
  },

  domingo: {
    nombre: 'Domingo',
    titulo: 'Piernas B, abdomen y antebrazos',
    diaSemana: 0,
    rondas: [
      { A: { id: 'sentadilla_bulgara',         musculo: 'Cuádriceps y glúteo', series: 3, seriesMax: 4, min: 8,  max: 12 },
        B: { id: 'curl_muneca_invertido',      musculo: 'Antebrazo',           series: 3,               min: 15, max: 20 } },
      { A: { id: 'peso_muerto_rumano',         musculo: 'Isquios',             series: 3,               min: 8,  max: 12 },
        B: { id: 'crunch_banda',               musculo: 'Abdomen',             series: 3,               min: 10, max: 15 } },
      { A: { id: 'extension_cuadriceps_banda', musculo: 'Cuádriceps',          series: 3,               min: 12, max: 15 },
        B: { id: 'curl_muneca_supino',         musculo: 'Antebrazo',           series: 3,               min: 15, max: 20 } },
      { A: { id: 'elevacion_talones',          musculo: 'Gemelos',             series: 3,               min: 12, max: 15 },
        B: { id: 'plancha',                    musculo: 'Core',                series: 3,               min: 40, max: 60 } },
    ],
  },
};

// Orden en que salen los botones en la pantalla "Hoy"
const ORDEN_DIAS = ['miercoles', 'jueves', 'sabado', 'domingo'];

// ---------------------------------------------------------------------
// Pesos posibles por mancuerna y discos por lado (tabla del documento)
// Inventario: 8 discos de 3 kg, 4 de 2.5 kg y 4 de 1.25 kg.
// Por lado máximo: dos de 3, uno de 2.5 y uno de 1.25.
// La barra (~300 g) no se cuenta.
// ---------------------------------------------------------------------
const PESOS = [
  { kg: 2.5,  lado: '1.25' },
  { kg: 5,    lado: '2.5' },
  { kg: 6,    lado: '3' },
  { kg: 7.5,  lado: '2.5 + 1.25' },
  { kg: 8.5,  lado: '3 + 1.25' },
  { kg: 11,   lado: '3 + 2.5' },
  { kg: 12,   lado: '3 + 3' },
  { kg: 13.5, lado: '3 + 2.5 + 1.25' },
  { kg: 14.5, lado: '3 + 3 + 1.25' },
  { kg: 17,   lado: '3 + 3 + 2.5' },
  { kg: 19.5, lado: '3 + 3 + 2.5 + 1.25' },
];

// ---------------------------------------------------------------------
// 3) Ayudantes para que el resto de la app no tenga que buscar a mano
// ---------------------------------------------------------------------

// Junta el catálogo con los datos del día: nombre, carga, rango, series...
function ejercicioDelDia(slot) {
  const base = EJERCICIOS[slot.id];
  return {
    ...slot,
    nombre: base.nombre,
    carga: base.carga,
    seriesMax: slot.seriesMax || slot.series,
    unidad: base.carga === 'tiempo' ? 's' : 'reps',
  };
}

// Lista plana de un día, en el orden en que se entrenan:
// ronda 1 A, ronda 1 B, ronda 2 A, ...
function ejerciciosDeDia(diaId) {
  const lista = [];
  DIAS[diaId].rondas.forEach((ronda, i) => {
    for (const letra of ['A', 'B']) {
      lista.push({ ...ejercicioDelDia(ronda[letra]), ronda: i + 1, slot: letra });
    }
  });
  return lista;
}

// Cuántas series tiene el día por defecto (sin contar los "+ serie")
function seriesDelDia(diaId) {
  return ejerciciosDeDia(diaId).reduce((total, e) => total + e.series, 0);
}

// Qué día de rutina es hoy en Acapulco (o null si hoy es descanso)
function diaDeHoy(fecha = new Date()) {
  const nombre = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', weekday: 'short',
  }).format(fecha);
  const numero = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nombre);
  return ORDEN_DIAS.find(d => DIAS[d].diaSemana === numero) || null;
}

// Congelamos todo para que ningún otro código lo modifique por error
function congelar(obj) {
  Object.values(obj).forEach(v => { if (v && typeof v === 'object') congelar(v); });
  return Object.freeze(obj);
}

window.RUTINA = congelar({
  EJERCICIOS, DIAS, ORDEN_DIAS, PESOS,
  ejerciciosDeDia, seriesDelDia, diaDeHoy,
});
