// nwgeo Muestreo — captura offline de puntos de muestreo geoquímico interior mina
// Todo vive en localStorage del iPhone. Sin servidor, sin internet.

const LS_KEY = "nwgeo_muestreo_v1";
// copia espejo redundante: se escribe en cada save() y en localStorage Y en IndexedDB.
// localStorage en iPhone (sobre todo abriendo la página desde una vista "preview"/artefacto
// en vez de Safari directo, o agregada a pantalla de inicio) a veces se vacía solo, en
// particular justo al disparar una descarga de archivo. Si eso pasa, al reabrir la app
// se detecta que LS_KEY está vacío pero el espejo sigue ahí, y se recupera solo.
const LS_SHADOW_KEY = "nwgeo_muestreo_v1_shadow";
const IDB_NAME = "nwgeo_muestreo_backup";
const IDB_STORE = "snapshots";

function idbPut(state) {
  try {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put({ state, ts: Date.now() }, "latest");
      } catch (e) {}
    };
    req.onerror = () => {};
  } catch (e) {}
}

function idbGetLatest(cb) {
  try {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, "readonly");
        const getReq = tx.objectStore(IDB_STORE).get("latest");
        getReq.onsuccess = () => cb(getReq.result || null);
        getReq.onerror = () => cb(null);
      } catch (e) { cb(null); }
    };
    req.onerror = () => cb(null);
  } catch (e) { cb(null); }
}

// pide almacenamiento "persistente" al navegador: en iOS/Safari esto reduce (no elimina del
// todo) el riesgo de que el sistema vacíe localStorage por falta de uso o por presión de memoria
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// compatibilidad con estados guardados antes de agregar folios/nivel activo/barrenos
function normalizarEstado(s) {
  if (!s.capaActiva) s.capaActiva = "muestreo";
  if (!s.folioPorTramo) s.folioPorTramo = {};
  if (!s.nivelActivo) s.nivelActivo = { modo: "SUP", num: null };
  if (!s.barrenos) s.barrenos = [];
  if (!s.tramosBarreno) s.tramosBarreno = [];
  if (!s.surveyBarreno) s.surveyBarreno = [];
  if (!s.nextBarrenoId) s.nextBarrenoId = 1;
  if (!s.nextTramoId) s.nextTramoId = 1;
  if (!s.nextSurveyId) s.nextSurveyId = 1;
  if (s.barrenoActivoId === undefined) s.barrenoActivoId = null;
  if (!s.folioBarreno) s.folioBarreno = {};
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (s && s.puntos) return normalizarEstado(s);
    // LS_KEY vacío o corrupto: busca en el espejo de localStorage antes de rendirse
    const shadowRaw = localStorage.getItem(LS_SHADOW_KEY);
    const shadow = shadowRaw ? JSON.parse(shadowRaw) : null;
    if (shadow && shadow.puntos && shadow.puntos.length) {
      normalizarEstado(shadow);
      localStorage.setItem(LS_KEY, JSON.stringify(shadow));
      window.setTimeout(() => alert(
        "Se detectó que los datos locales se habían vaciado. Se recuperaron " +
        shadow.puntos.length + " punto(s) de la copia espejo automática."
      ), 300);
      return shadow;
    }
    return defaultState();
  } catch (e) {
    return defaultState();
  }
}

// segunda red, más fuerte que localStorage: si al cargar NO hay nada ni en LS_KEY ni en el
// espejo, se revisa IndexedDB (sobrevive mejor que localStorage en Safari/iOS) y se restaura
// ahí mismo, re-pintando todo.
function tryRecoverFromIndexedDB() {
  if (state.puntos && state.puntos.length) return; // ya hay datos, no hace falta
  idbGetLatest((rec) => {
    if (!rec || !rec.state || !rec.state.puntos || !rec.state.puntos.length) return;
    if (state.puntos && state.puntos.length) return; // pudo haber cambiado mientras tanto
    state = normalizarEstado(rec.state);
    save();
    fillProyectoForm();
    renderCapaBar();
    mostrarPlano();
    renderLista();
    const f = new Date(rec.ts);
    alert("Se recuperaron " + state.puntos.length + " punto(s) desde la copia de seguridad interna del " +
      f.toLocaleString() + ".");
  });
}
function defaultState() {
  return {
    proyecto: {
      proyecto: "Congreso-León · San Pedro Corralitos",
      nivel: "04",
      resp: "Ing. Gerardo Pérez Reveles",
      sistema: "WGS84 / UTM 13N · EPSG:32613",
    },
    puntos: [],      // {id, capa, clave, tipo, longCanal, campos, nivel, tramo, notas, este, norte, fecha}
    activePlano: null, // {kind:'preset'|'custom', tramo, file, w, h, x0,x1,y0,y1} o {kind:'custom', cal:[{px,py,e,n}]}
    nextLocalId: 1,
    capaActiva: "muestreo", // qué tipo de punto se crea al tocar el plano
    folioPorTramo: {}, // {NIVEL: siguiente_consecutivo_libre} para la numeración de folio de muestreo geoquímico
    nivelActivo: { modo: "SUP", num: null }, // de qué nivel es el muestreo que se está levantando ahora: Superficie o Nivel X
    barrenos: [],       // collar: {id, clave, este, norte, cota, prof, azimut, inclin, metodo, diam, fechaIni, fechaFin, empresa, notas}
    tramosBarreno: [],  // geología por tramo: {id, barrenoId, de, a, litologico:{}, alteracion:{}, estructural:{}, rqd, recup, dureza, esMuestra, qaqc, folio, notas}
    surveyBarreno: [],  // desviación: {id, barrenoId, prof, azimut, inclin}
    nextBarrenoId: 1, nextTramoId: 1, nextSurveyId: 1,
    barrenoActivoId: null,
    folioBarreno: {}, // {barrenoId: siguiente_consecutivo_libre} para folio de muestras de ensaye por barreno
  };
}

// ---------- folios de muestreo geoquímico (confirmar, no escribir) ----------
// El folio nace del PROYECTO: ABREVIATURA-NIVEL-CONSECUTIVO. No lleva el tramo del mosaico de plano
// (eso es solo la base cartográfica donde se trabajó ese día; al final todo cae en la misma base de
// datos del proyecto y lo que importa es el nivel y el punto geográfico real de la muestra, que ya
// se guarda como UTM). El usuario solo confirma el siguiente folio de esa serie; también puede
// apartar/"rifar" un folio de la misma serie para un control de QA/QC (blanco, duplicado o estándar)
// en vez de capturar una muestra normal — así los controles quedan intercalados en la secuencia real,
// no aparte. El nivel va de Superficie hasta el nivel que el usuario defina (sin tope fijo).
const QAQC_TIPOS = {
  normal: { label: "Normal", sufijo: "" },
  blanco: { label: "Blanco (QA/QC)", sufijo: "-BLK" },
  duplicado: { label: "Duplicado (QA/QC)", sufijo: "-DUP" },
  estandar: { label: "Estándar (QA/QC)", sufijo: "-STD" },
};
function tramoDeFolio() {
  // ya no participa en el folio; se sigue guardando como metadato (de qué base cartográfica salió
  // el punto) en la columna "tramo" del CSV
  const p = state.activePlano;
  if (!p) return "SIN-PLANO";
  return p.kind === "preset" ? p.tramo : "custom";
}
function pad2(n) { return String(n).padStart(2, "0"); }
function pad3(n) { return String(n).padStart(3, "0"); }
function abreviarProyecto(nombre) {
  // solo una sugerencia automática de respaldo; lo normal es que el usuario fije su propia
  // abreviatura en Proyecto → Abreviatura, que es la que de verdad manda en el folio
  if (!nombre) return "PRY";
  const palabras = nombre.replace(/[^\p{L}\s-]/gu, "").split(/[\s-]+/).filter(Boolean);
  if (!palabras.length) return "PRY";
  if (palabras.length === 1) return palabras[0].slice(0, 3).toUpperCase();
  return palabras.slice(0, 3).map(w => w[0]).join("").toUpperCase();
}
function nivelActivoStr() {
  if (!state.nivelActivo) state.nivelActivo = { modo: "SUP", num: null }; // compatibilidad con estados viejos
  if (state.nivelActivo.modo === "SUB" && state.nivelActivo.num != null && state.nivelActivo.num !== "") {
    return pad2(parseInt(state.nivelActivo.num, 10) || 0);
  }
  return "SUP";
}
function proximoConsecutivo(key) {
  if (!state.folioPorTramo) state.folioPorTramo = {}; // compatibilidad con respaldos/estados viejos sin este campo
  return (state.folioPorTramo[key] || 0) + 1;
}
function sugerirClaveFolio(qaqc) {
  const abrev = (state.proyecto.abrev || abreviarProyecto(state.proyecto.proyecto) || "").trim().toUpperCase();
  const nivelStr = nivelActivoStr();
  const cons = proximoConsecutivo(nivelStr);
  const suf = (QAQC_TIPOS[qaqc] || QAQC_TIPOS.normal).sufijo;
  const base = (abrev ? abrev + "-" : "") + nivelStr + "-" + pad3(cons);
  return base + suf;
}
function consumirFolio() {
  const key = nivelActivoStr();
  state.folioPorTramo[key] = proximoConsecutivo(key);
}

// ---------- capas de mapeo ----------
// "muestreo" usa sus propios campos (tipo/longCanal) por compatibilidad con lo ya capturado.
// Las demás capas guardan sus campos propios dentro de pt.campos = {id: valor, ...}.
const CAPAS = {
  muestreo: { label: "Muestreo geoquímico", color: "#C9A227", campos: [] },
  alteracion: {
    label: "Alteración", color: "#A98CE0",
    campos: [
      { id: "tipoAlt", label: "Tipo de alteración", type: "select", options: [
        ["propilitica", "Propilítica"], ["argilica_intermedia", "Argílica intermedia"],
        ["argilica_avanzada", "Argílica avanzada"], ["sericitica", "Sericítica / fílica"],
        ["potasica", "Potásica"], ["silicificacion", "Silicificación"],
        ["clorítica", "Clorítica"], ["carbonatizacion", "Carbonatización (calcita/dolomita)"],
        ["piritizacion", "Piritización"], ["hematitizacion", "Hematitización / oxidación"],
        ["turmalinizacion", "Turmalinización"], ["albitizacion", "Albitización"],
        ["skarnificacion", "Skarnificación"], ["greisenizacion", "Greisenización"],
        ["silicificacion_jasperoide", "Silicificación jasperoide"],
        ["limonita_insitu", "Limonita in situ"], ["limonita_halo", "Limonita de halo"],
        ["limonita_exotica", "Limonita exótica"], ["sin_alteracion", "Sin alteración visible"],
        ["otra", "Otra"],
      ] },
      { id: "intensidad", label: "Intensidad", type: "select",
        options: [["debil", "Débil"], ["moderada", "Moderada"], ["fuerte", "Fuerte"]] },
      { id: "mineralesAsoc", label: "Minerales asociados", type: "text" },
    ],
  },
  litologico: {
    label: "Litológico", color: "#6FA8DC",
    campos: [
      { id: "grupo", label: "Grupo litológico", type: "select", options: [
        ["ignea_intrusiva", "Ígnea intrusiva"], ["ignea_volcanica", "Ígnea volcánica / piroclástica"],
        ["sedimentaria", "Sedimentaria"], ["metamorfica", "Metamórfica"],
        ["skarn_metasomatica", "Skarn / roca metasomática"], ["brecha", "Brecha"],
        ["suelo_regolito", "Suelo / regolito"], ["otro", "Otro"],
      ] },
      { id: "tipoRoca", label: "Tipo de roca", type: "select", options: [
        ["", "—"],
        ["granito", "Granito"], ["granodiorita", "Granodiorita"], ["diorita", "Diorita"],
        ["monzonita", "Monzonita"], ["sienita", "Sienita"], ["gabro", "Gabro"],
        ["porfido", "Pórfido (especificar en unidad/textura)"], ["pegmatita", "Pegmatita"], ["aplita", "Aplita"],
        ["riolita", "Riolita"], ["dacita", "Dacita"], ["andesita", "Andesita"], ["basalto", "Basalto"],
        ["toba_litica", "Toba lítica"], ["toba_cristalina", "Toba cristalina"], ["toba_vitrea", "Toba vítrea"],
        ["ignimbrita", "Ignimbrita"], ["brecha_volcanica", "Brecha volcánica"],
        ["caliza", "Caliza"], ["dolomia", "Dolomía"], ["lutita", "Lutita"], ["arenisca", "Arenisca"],
        ["limolita", "Limolita"], ["conglomerado", "Conglomerado"], ["yeso", "Yeso"], ["caliche", "Caliche"],
        ["marmol", "Mármol"], ["cuarcita", "Cuarcita"], ["esquisto", "Esquisto"], ["gneis", "Gneis"],
        ["filita", "Filita"], ["corneana", "Corneana"],
        ["skarn", "Skarn"], ["jasperoide", "Jasperoide"], ["gossan", "Gossan / sombrero de hierro"],
        ["brecha_hidrotermal", "Brecha hidrotermal"], ["otro", "Otro (detallar en unidad)"],
      ] },
      { id: "unidad", label: "Unidad / nombre local", type: "text" },
      { id: "textura", label: "Textura / fábrica de roca", type: "select", options: [
        ["", "—"], ["afanitica", "Afanítica"], ["faneritica", "Fanerítica"], ["porfidica", "Porfídica"],
        ["vesicular", "Vesicular"], ["bandeada", "Bandeada"], ["brechada", "Brechada"],
        ["masiva", "Masiva"], ["foliada", "Foliada"], ["otra", "Otra (detallar en notas)"],
      ] },
    ],
  },
  estructural: {
    label: "Estructural", color: "#E06C6C",
    campos: [
      { id: "tipoEstr", label: "Tipo de estructura", type: "select",
        options: [["falla", "Falla"], ["veta", "Veta"], ["vetilla", "Vetilla"],
          ["contacto", "Contacto"], ["fractura", "Fractura"], ["diaclasa", "Diaclasa"],
          ["zona_cizalla", "Zona de cizalla"], ["pliegue", "Pliegue"], ["foliacion", "Foliación"],
          ["lineacion", "Lineación"], ["dique", "Dique"]] },
      { id: "rumbo", label: "Rumbo (azimut °)", type: "number" },
      { id: "echado", label: "Echado (°)", type: "number" },
      { id: "bloque", label: "Bloque", type: "select",
        options: [["", "—"], ["alto", "Bloque del alto"], ["bajo", "Bloque del bajo"]] },
      { id: "cinematica", label: "Cinemática (si aplica)", type: "select",
        options: [["", "—"], ["normal", "Normal"], ["inversa", "Inversa / reversa"],
          ["lateral_izq", "Lateral izquierda"], ["lateral_der", "Lateral derecha"],
          ["oblicua", "Oblicua"]] },
      { id: "relleno", label: "Relleno / mineralización", type: "text" },
    ],
  },
  superficie: {
    label: "Superficie", color: "#6FAE6F",
    campos: [
      { id: "afloramiento", label: "Tipo de afloramiento", type: "select",
        options: [["roca_in_situ", "Roca in situ"], ["suelo_residual", "Suelo residual"],
          ["aluvion", "Aluvión"], ["otro", "Otro"]] },
      { id: "descripcion", label: "Descripción general", type: "textarea" },
    ],
  },
};

function renderCapaBar() {
  const bar = document.getElementById("capaBar");
  bar.innerHTML = "";
  Object.keys(CAPAS).forEach(id => {
    const c = CAPAS[id];
    const chip = document.createElement("div");
    chip.className = "capaChip" + (state.capaActiva === id ? " active" : "");
    chip.innerHTML = `<span class="dot" style="background:${c.color}"></span><span>${c.label}</span>`;
    chip.addEventListener("click", () => {
      state.capaActiva = id;
      save();
      renderCapaBar();
    });
    bar.appendChild(chip);
  });
}
let state = load();
renderCapaBar();
window.setTimeout(tryRecoverFromIndexedDB, 250);

function save() {
  const json = JSON.stringify(state);
  localStorage.setItem(LS_KEY, json);
  localStorage.setItem(LS_SHADOW_KEY, json);
  idbPut(state);
}

// ---------- tabs ----------
document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".screen").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.getElementById("screen-" + t.dataset.screen).classList.add("active");
    if (t.dataset.screen === "lista") renderLista();
    if (t.dataset.screen === "proyecto") pintarFolioEstadoTramo();
    if (t.dataset.screen === "barrenos") renderBarrenosLista();
  });
});

// ---------- proyecto ----------
function fillProyectoForm() {
  document.getElementById("pProyecto").value = state.proyecto.proyecto || "";
  document.getElementById("pNivel").value = state.proyecto.nivel || "";
  document.getElementById("pResp").value = state.proyecto.resp || "";
  document.getElementById("pSistema").value = state.proyecto.sistema || "";
  const pAbrevFill = document.getElementById("pAbrev");
  if (pAbrevFill) pAbrevFill.value = state.proyecto.abrev || "";
}
fillProyectoForm();

function pintarFolioEstadoTramo() {
  const el = document.getElementById("folioEstadoTramo");
  if (!el) return;
  const nivelTxt = nivelActivoStr() === "SUP" ? "Superficie" : ("Nivel " + nivelActivoStr());
  el.textContent = nivelTxt + " · siguiente folio: " + sugerirClaveFolio("normal");
}
pintarFolioEstadoTramo();

const btnFolioForzar = document.getElementById("btnFolioForzar");
if (btnFolioForzar) {
  btnFolioForzar.addEventListener("click", () => {
    const v = parseInt(document.getElementById("folioForzar").value, 10);
    if (!v || v < 1) { alert("Escribe el siguiente número de folio (entero ≥ 1)."); return; }
    state.folioPorTramo[nivelActivoStr()] = v - 1; // el próximo sugerido será v
    save();
    document.getElementById("folioForzar").value = "";
    pintarFolioEstadoTramo();
    alert("Listo. El siguiente folio será " + sugerirClaveFolio("normal") + ".");
  });
}

// ---------- nivel activo de muestreo (define el folio y el "nivel/cota" por defecto del punto) ----------
function pintarNivelActivoUI() {
  const modo = document.getElementById("pNivelModo");
  const num = document.getElementById("pNivelNum");
  if (!modo || !num) return;
  modo.value = state.nivelActivo.modo;
  num.value = state.nivelActivo.num != null ? state.nivelActivo.num : "";
  num.style.display = state.nivelActivo.modo === "SUB" ? "block" : "none";
}
const pNivelModoEl = document.getElementById("pNivelModo");
const pNivelNumEl = document.getElementById("pNivelNum");
if (pNivelModoEl && pNivelNumEl) {
  pNivelModoEl.addEventListener("change", () => {
    state.nivelActivo.modo = pNivelModoEl.value;
    save();
    pintarNivelActivoUI();
    pintarFolioEstadoTramo();
  });
  pNivelNumEl.addEventListener("change", () => {
    state.nivelActivo.num = pNivelNumEl.value;
    save();
    pintarFolioEstadoTramo();
  });
}
pintarNivelActivoUI();

const pAbrevEl = document.getElementById("pAbrev");
if (pAbrevEl) {
  pAbrevEl.value = state.proyecto.abrev || "";
  pAbrevEl.addEventListener("change", () => {
    state.proyecto.abrev = pAbrevEl.value.trim();
    save();
    pintarFolioEstadoTramo();
  });
}

document.getElementById("btnGuardaProy").addEventListener("click", () => {
  const pAbrevGuardar = document.getElementById("pAbrev");
  state.proyecto = {
    proyecto: document.getElementById("pProyecto").value,
    nivel: document.getElementById("pNivel").value,
    resp: document.getElementById("pResp").value,
    sistema: document.getElementById("pSistema").value,
    abrev: pAbrevGuardar ? pAbrevGuardar.value.trim().toUpperCase() : "",
  };
  save();
  pintarFolioEstadoTramo();
  document.getElementById("projLine").textContent =
    (state.proyecto.proyecto || "") + (state.proyecto.nivel ? (" · Nivel " + state.proyecto.nivel) : "");
  alert("Guardado.");
});
document.getElementById("projLine").textContent =
  (state.proyecto.proyecto || "") + (state.proyecto.nivel ? (" · Nivel " + state.proyecto.nivel) : "");

// ---------- plano: niveles precargados (todos los niveles digitalizados + superficie) ----------
// NIVELES viene de assets/niveles_manifest.json: un bloque por nivel (NIVEL02..NIVEL09) y uno
// para SUPERFICIE (ortomosaico de dron). Cada bloque trae su propio objeto "tiles" (uno o más
// tramos/planchas ya calibrados pixel<->UTM); el Nivel 04 es el único con varios tramos
// históricos escaneados (A1-B3) además del plano completo — los demás traen solo "FULL",
// un facsímil vectorial limpio generado de la digitalización SHP del nivel.
const NIVEL_LABEL = {
  NIVEL02: "Nivel 02", NIVEL03: "Nivel 03", NIVEL04: "Nivel 04", NIVEL05: "Nivel 05",
  NIVEL06: "Nivel 06", NIVEL07: "Nivel 07", NIVEL08: "Nivel 08", NIVEL09: "Nivel 09",
  SUPERFICIE: "Superficie (ortomosaico dron)",
};
const NIVEL_ORDEN = ["NIVEL02", "NIVEL03", "NIVEL04", "NIVEL05", "NIVEL06", "NIVEL07", "NIVEL08", "NIVEL09", "SUPERFICIE"];

let NIVELES = null;
fetch("assets/niveles_manifest.json").then(r => r.json()).then(j => { NIVELES = j; buildPresetButtons(); }).catch(() => {});

function buildPresetButtons() {
  if (!NIVELES) return;
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = "<h3>Niveles precargados</h3>" +
    "<p class=\"muted\">Ya vienen calibrados: no hace falta marcar puntos de control. Elige primero el nivel " +
    "(o Superficie) y luego el tramo/plancha que vas a muestrear. El Nivel 04 trae además los 6 tramos " +
    "históricos escaneados (A1-B3) junto con su plano completo.</p>" +
    "<div id=\"nivelesWrap\"></div>";
  document.querySelector("#screen-proyecto .panel").insertBefore(
    card, document.querySelector("#screen-proyecto .panel .card:nth-child(2)")
  );
  const wrap = card.querySelector("#nivelesWrap");
  NIVEL_ORDEN.forEach(claveNivel => {
    const bloque = NIVELES[claveNivel];
    if (!bloque || !bloque.tiles) return;
    const sub = document.createElement("div");
    sub.style.marginBottom = "10px";
    const titulo = document.createElement("div");
    titulo.style.cssText = "font-size:11.5px;color:var(--oro-claro);font-weight:600;margin-bottom:5px;";
    titulo.textContent = NIVEL_LABEL[claveNivel] || claveNivel;
    if (bloque.cota) titulo.textContent += " — cota " + bloque.cota.toFixed(1) + " m s.n.m.";
    sub.appendChild(titulo);
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
    Object.keys(bloque.tiles).forEach(claveTile => {
      const t = bloque.tiles[claveTile];
      const b = document.createElement("button");
      b.className = "btn-ghost btn-sm";
      b.textContent = t.label || (claveTile === "FULL" ? "Plano completo" : ("Tramo " + claveTile));
      if (claveTile === "FULL") { b.style.background = "#2c313a"; b.style.borderColor = "#C9A227"; }
      b.style.flex = "0 0 auto";
      b.addEventListener("click", () => loadPreset(claveNivel, claveTile));
      btnRow.appendChild(b);
    });
    sub.appendChild(btnRow);
    wrap.appendChild(sub);
  });
}

// A qué "nivel activo de muestreo" corresponde cada clave de nivel precargado, para que el
// folio sugerido y el campo "Nivel" de cada punto queden sincronizados con el plano que se
// está viendo — antes de este arreglo, elegir aquí un nivel precargado NO actualizaba el nivel
// activo de la pestaña Proyecto, y un punto capturado sobre el plano del Nivel 06 podía
// terminar guardado con el folio y el campo "Nivel" de, por ejemplo, Superficie o el Nivel 04.
function nivelActivoDesdeClavePreset(claveNivel) {
  if (claveNivel === "SUPERFICIE") return { modo: "SUP", num: null };
  const m = /^NIVEL(\d+)$/.exec(claveNivel);
  return { modo: "SUB", num: m ? String(parseInt(m[1], 10)) : null };
}

function loadPreset(claveNivel, claveTile) {
  const t = NIVELES[claveNivel].tiles[claveTile];
  state.activePlano = {
    kind: "preset", nivel: claveNivel, tramo: claveTile, file: "assets/" + t.file,
    w: t.w_px, h: t.h_px, x0: t.x0, x1: t.x1, y0: t.y0, y1: t.y1,
  };
  state.nivelActivo = nivelActivoDesdeClavePreset(claveNivel);
  pintarNivelActivoUI();
  agregarNivelANota(state.nivelActivo);
  save();
  mostrarPlano();
  switchTab("mapa");
  pintarFolioEstadoTramo();
}

// Agrega el nivel activo a la nota informativa "Niveles del proyecto" si todavía no está ahí
// (p. ej. "02, 04, 06" → "02, 04, 06, 08"), para que esa lista se vaya completando sola conforme
// se van muestreando niveles, sin dejar de ser editable a mano.
function agregarNivelANota(nivelActivo) {
  const etiqueta = nivelActivo.modo === "SUP" ? "Superficie" : pad2(nivelActivo.num);
  const actual = (state.proyecto.nivel || "").trim();
  const partes = actual ? actual.split(",").map(s => s.trim()).filter(Boolean) : [];
  if (!partes.some(p => p.toLowerCase() === etiqueta.toLowerCase())) {
    partes.push(etiqueta);
    state.proyecto.nivel = partes.join(", ");
    const campo = document.getElementById("pNivel");
    if (campo) campo.value = state.proyecto.nivel;
  }
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.screen === name));
  document.querySelectorAll(".screen").forEach(x => x.classList.toggle("active", x.id === "screen-" + name));
  if (name === "lista") renderLista();
  if (name === "barrenos") renderBarrenosLista();
}

// ---------- plano: imagen propia + calibración manual ----------
document.getElementById("fileImg").addEventListener("change", (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    state.activePlano = { kind: "custom", dataUrl: e.target.result, cal: [] };
    save();
    mostrarPlano();
    document.getElementById("imgInfo").textContent = "Cargado: " + file.name + ". Ahora calibra 2 puntos.";
  };
  reader.readAsDataURL(file);
});

let calibrando = null; // 1 o 2
document.getElementById("btnCal1").addEventListener("click", () => { calibrando = 1; switchTab("mapa"); alert("Toca en el plano el primer punto de control."); });
document.getElementById("btnCal2").addEventListener("click", () => { calibrando = 2; switchTab("mapa"); alert("Toca en el plano el segundo punto de control."); });
document.getElementById("btnCalReset").addEventListener("click", () => {
  if (state.activePlano && state.activePlano.kind === "custom") {
    state.activePlano.cal = [];
    save();
    renderCalLayer();
    updateCalStatus();
  }
});

function updateCalStatus() {
  const el = document.getElementById("calStatus");
  const p = state.activePlano;
  if (!p || p.kind !== "custom") { el.textContent = "Plano precargado del nivel 04: ya calibrado."; return; }
  const n = (p.cal || []).length;
  if (n === 0) el.textContent = "Sin calibrar.";
  else if (n === 1) el.textContent = "1 de 2 puntos fijados.";
  else el.textContent = "Calibrado con 2 puntos ✓";
}

// ---------- mostrar plano ----------
function mostrarPlano() {
  const p = state.activePlano;
  const placeholder = document.getElementById("placeholder");
  const wrap = document.getElementById("imgWrap");
  const img = document.getElementById("planImg");
  const toolbar = document.getElementById("mapToolbar");
  if (!p) { placeholder.style.display = "block"; wrap.style.display = "none"; toolbar.style.display = "none"; return; }
  placeholder.style.display = "none";
  wrap.style.display = "block";
  toolbar.style.display = "flex";
  exitCropView();
  img.onload = () => { cropMeters = null; renderCalLayer(); renderPuntos(); renderGridOverlay(); };
  img.src = p.kind === "preset" ? p.file : p.dataUrl;
  updateCalStatus();
}

// ---------- seleccionar área / zoom a escala ----------
let seleccionando = null; // null | 1 | 2 | "extra" | "confirm"
let selPuntos = []; // esquinas tocadas hasta ahora: [{px,py}, ...] — el recuadro es su caja envolvente
let cropMeters = null; // null = plano completo, o {e0,e1,n0,n1} del área ampliada
let cropHistory = []; // pila de recortes anteriores {x0,y0,w,h} en px naturales, para "Regresar"

function bboxDePuntos(pts) {
  return {
    x0: Math.min(...pts.map(p => p.px)), x1: Math.max(...pts.map(p => p.px)),
    y0: Math.min(...pts.map(p => p.py)), y1: Math.max(...pts.map(p => p.py)),
  };
}

function pickStep(extentMeters) {
  const candidatos = [5, 10, 25, 50, 100, 250, 500, 1000, 2000];
  const target = 10; // apunta a ~10 líneas cruzando el lado más chico
  for (const c of candidatos) {
    if (extentMeters / c <= target) return c;
  }
  return candidatos[candidatos.length - 1];
}

function renderGridOverlay() {
  const svg = document.getElementById("gridLayer");
  svg.innerHTML = "";
  const p = state.activePlano;
  const img = document.getElementById("planImg");
  if (!p || p.kind !== "preset" || !img.naturalWidth) return;

  const e0 = cropMeters ? cropMeters.e0 : p.x0;
  const e1 = cropMeters ? cropMeters.e1 : p.x1;
  const n0 = cropMeters ? cropMeters.n0 : p.y0;
  const n1 = cropMeters ? cropMeters.n1 : p.y1;
  const step = pickStep(Math.min(e1 - e0, n1 - n0));

  svg.setAttribute("viewBox", `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
  const ns = "http://www.w3.org/2000/svg";
  const color = "#C9A227";

  // grosor adaptativo: el svg se estira a img.clientWidth aunque el viewBox esté en px
  // naturales, así que un stroke-width fijo en px naturales se ve cada vez MÁS grueso
  // conforme amplías (clientWidth crece sobre naturalWidth al ampliar un área pequeña).
  // Se corrige al grosor real en pantalla (displayScale) y además se afina un poco más
  // mientras la escala de la grilla baja hacia el mínimo de 5 m, para que no se vea
  // pesada cuando hay muchas líneas juntas.
  const displayScale = (img.clientWidth / img.naturalWidth) || 1;
  // el grosor objetivo está en px DE PANTALLA (no de la imagen): así es válido en
  // cualquier nivel de ampliación, incluida la escala mínima de 5 m
  const desiredScreenPx = 0.6 + Math.min(1, step / 100) * 0.8; // 0.64px (5 m) a 1.4px (100+ m)
  const strokeW = desiredScreenPx / displayScale;

  const eStart = Math.ceil(e0 / step) * step;
  for (let e = eStart; e <= e1; e += step) {
    const px = ((e - p.x0) / (p.x1 - p.x0)) * img.naturalWidth;
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", px); line.setAttribute("x2", px);
    line.setAttribute("y1", 0); line.setAttribute("y2", img.naturalHeight);
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", strokeW);
    line.setAttribute("stroke-opacity", "0.55");
    svg.appendChild(line);
  }
  const nStart = Math.ceil(n0 / step) * step;
  for (let n = nStart; n <= n1; n += step) {
    const py = img.naturalHeight - ((n - p.y0) / (p.y1 - p.y0)) * img.naturalHeight;
    const line = document.createElementNS(ns, "line");
    line.setAttribute("y1", py); line.setAttribute("y2", py);
    line.setAttribute("x1", 0); line.setAttribute("x2", img.naturalWidth);
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", strokeW);
    line.setAttribute("stroke-opacity", "0.55");
    svg.appendChild(line);
  }

  const lbl = document.createElement("div");
  // etiqueta de la escala de grilla actual, como texto flotante (no bloquea toques)
  let tag = document.getElementById("gridStepTag");
  if (!tag) {
    tag = document.createElement("div");
    tag.id = "gridStepTag";
    // fijo a la pantalla (no a la imagen): si va dentro de imgWrap, al recortar/ampliar el
    // transform lo saca de la parte visible y deja de verse
    tag.style.cssText = "position:fixed;right:10px;background:rgba(20,23,28,.88);" +
      "color:#E4C765;font-size:11px;padding:4px 8px;border-radius:5px;pointer-events:none;z-index:45;" +
      "top:calc(env(safe-area-inset-top,0px) + 108px);";
    document.getElementById("screen-mapa").appendChild(tag);
  }
  tag.textContent = "grilla cada " + step + " m";
}

function setSelBanner(text) {
  const b = document.getElementById("selBanner");
  if (!text) { b.style.display = "none"; b.innerHTML = ""; return; }
  b.style.display = "block";
  b.textContent = text;
}

// dibuja el recuadro rojo punteado de la selección (en coordenadas de pantalla, no de la imagen)
let pendingCrop = null; // {x0,y0,x1,y1} en px naturales de la imagen, esperando confirmación
function posicionarSelRect() {
  if (!pendingCrop) { document.getElementById("selRect").style.display = "none"; return; }
  const img = document.getElementById("planImg");
  const rx = img.clientWidth / img.naturalWidth, ry = img.clientHeight / img.naturalHeight;
  const r = document.getElementById("selRect");
  r.style.left = (pendingCrop.x0 * rx) + "px";
  r.style.top = (pendingCrop.y0 * ry) + "px";
  r.style.width = ((pendingCrop.x1 - pendingCrop.x0) * rx) + "px";
  r.style.height = ((pendingCrop.y1 - pendingCrop.y0) * ry) + "px";
  r.style.display = "block";
}
function ocultarSelRect() {
  pendingCrop = null;
  document.getElementById("selRect").style.display = "none";
}

// muestra el recuadro de la selección + pregunta de confirmación con botones
function showSelConfirm(x0, y0, x1, y1) {
  pendingCrop = { x0, y0, x1, y1 };
  posicionarSelRect();
  const b = document.getElementById("selBanner");
  b.style.display = "block";
  b.innerHTML = "";
  const txt = document.createElement("div");
  txt.textContent = "¿Ampliar esta área?";
  b.appendChild(txt);
  const row = document.createElement("div");
  row.className = "selBtnRow";
  const btnSi = document.createElement("button");
  btnSi.className = "selBtnSi";
  btnSi.textContent = "Sí, ampliar";
  btnSi.addEventListener("click", () => {
    const c = pendingCrop;
    ocultarSelRect();
    seleccionando = null;
    selPuntos = [];
    setSelBanner(null);
    enterCropView(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
  });
  const btnMas = document.createElement("button");
  btnMas.className = "selBtnNo";
  btnMas.textContent = "Agregar otro punto";
  btnMas.addEventListener("click", () => {
    // sigue en modo selección: el siguiente toque (o el dedo mientras se mueve) amplía
    // el recuadro actual para que también incluya ese punto nuevo
    seleccionando = "extra";
    setSelBanner("Toca otro punto para ampliar el recuadro de selección.");
  });
  const btnNo = document.createElement("button");
  btnNo.className = "selBtnNo";
  btnNo.textContent = "Elegir de nuevo";
  btnNo.addEventListener("click", () => {
    ocultarSelRect();
    seleccionando = 1;
    selPuntos = [];
    setSelBanner("Toca la primera esquina del área que quieres ampliar.");
  });
  row.appendChild(btnSi);
  row.appendChild(btnMas);
  row.appendChild(btnNo);
  b.appendChild(row);
}

let currentCropPx = null; // {x0,y0,w,h} en px naturales del recorte activo, o null = plano completo

function enterCropView(cropX0, cropY0, cropW, cropH, fromHistory) {
  if (!fromHistory && currentCropPx) cropHistory.push(currentCropPx);
  currentCropPx = { x0: cropX0, y0: cropY0, w: cropW, h: cropH };
  const img = document.getElementById("planImg");
  const imgWrap = document.getElementById("imgWrap");
  const mapScroll = document.getElementById("mapScroll");
  const PAD = 10; // px de "aire" alrededor del área elegida
  cropX0 = Math.max(0, cropX0 - PAD);
  cropY0 = Math.max(0, cropY0 - PAD);
  cropW = Math.min(img.naturalWidth - cropX0, cropW + PAD * 2);
  cropH = Math.min(img.naturalHeight - cropY0, cropH + PAD * 2);
  const availW = mapScroll.clientWidth - 24; // padding del contenedor (12px cada lado)
  const scale = availW / cropW;
  const dispW = img.naturalWidth * scale;
  const dispH = img.naturalHeight * scale;
  img.style.width = dispW + "px";
  img.style.height = dispH + "px";
  imgWrap.style.width = dispW + "px";
  imgWrap.style.height = dispH + "px";
  imgWrap.style.transformOrigin = "0 0";
  imgWrap.style.transform = `translate(${-cropX0 * scale}px, ${-cropY0 * scale}px)`;
  // el alto del contenedor es box-sizing:border-box, hay que sumar el padding (12px arriba+abajo);
  // y hay que anular el flex:1 1 auto (si no, el contenedor se estira a toda la pantalla y
  // la altura fija de abajo no tiene efecto)
  mapScroll.style.flex = "0 0 auto";
  const csPad = getComputedStyle(mapScroll);
  const padV = parseFloat(csPad.paddingTop) + parseFloat(csPad.paddingBottom);
  mapScroll.style.height = (cropH * scale + padV) + "px";
  mapScroll.style.overflow = "hidden";

  const p = state.activePlano;
  const e0 = p.x0 + (cropX0 / img.naturalWidth) * (p.x1 - p.x0);
  const e1 = p.x0 + ((cropX0 + cropW) / img.naturalWidth) * (p.x1 - p.x0);
  const n1 = p.y1 - (cropY0 / img.naturalHeight) * (p.y1 - p.y0);
  const n0 = p.y1 - ((cropY0 + cropH) / img.naturalHeight) * (p.y1 - p.y0);
  cropMeters = { e0, e1, n0, n1 };

  renderCalLayer();
  renderPuntos();
  renderGridOverlay();
  document.getElementById("btnVerCompleto").style.display = "inline-block";
  document.getElementById("btnRegresarZoom").style.display = cropHistory.length ? "inline-block" : "none";
  document.getElementById("btnSeleccionArea").textContent = "Seleccionar otra área";
}

// regresa un nivel de zoom (a como estaba antes de la última ampliación), no hasta el plano
// completo — como el "pellizcar para alejar" normal de un mapa en el iPhone
function regresarZoomAnterior() {
  if (!cropHistory.length) { exitCropView(); return; }
  const prev = cropHistory.pop();
  enterCropView(prev.x0, prev.y0, prev.w, prev.h, true);
}

function exitCropView() {
  const img = document.getElementById("planImg");
  const imgWrap = document.getElementById("imgWrap");
  const mapScroll = document.getElementById("mapScroll");
  img.style.width = "100%";
  img.style.height = "auto";
  imgWrap.style.width = "100%";
  imgWrap.style.height = "";
  imgWrap.style.transform = "";
  mapScroll.style.flex = "1 1 auto";
  mapScroll.style.height = "";
  mapScroll.style.overflow = "auto";
  seleccionando = null;
  selPuntos = [];
  cropHistory = [];
  currentCropPx = null;
  ocultarCrosshair();
  ocultarSelRect();
  setSelBanner(null);
  document.getElementById("btnVerCompleto").style.display = "none";
  document.getElementById("btnRegresarZoom").style.display = "none";
  document.getElementById("btnSeleccionArea").textContent = "Seleccionar área";
  cropMeters = null;
  renderCalLayer();
  renderPuntos();
  renderGridOverlay();
}

document.getElementById("btnSeleccionArea").addEventListener("click", () => {
  if (!state.activePlano) { setSelBanner("Primero carga un plano en Proyecto."); setTimeout(() => setSelBanner(null), 2500); return; }
  seleccionando = 1;
  selPuntos = [];
  ocultarCrosshair();
  ocultarSelRect();
  setSelBanner("Toca la primera esquina del área que quieres ampliar.");
});
document.getElementById("btnVerCompleto").addEventListener("click", () => { exitCropView(); setSelBanner(null); });
document.getElementById("btnRegresarZoom").addEventListener("click", () => { regresarZoomAnterior(); setSelBanner(null); });

// convierte evento táctil/click en px relativos a resolución natural de la imagen
function eventToImgPx(ev) {
  const img = document.getElementById("planImg");
  const rect = img.getBoundingClientRect();
  const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
  const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
  const px = ((clientX - rect.left) / rect.width) * img.naturalWidth;
  const py = ((clientY - rect.top) / rect.height) * img.naturalHeight;
  return { px, py, rect, clientX, clientY };
}

function pxToUTM(px, py) {
  const p = state.activePlano;
  if (!p) return null;
  if (p.kind === "preset") {
    const e = p.x0 + (px / p.w) * (p.x1 - p.x0);
    const n = p.y1 - (py / p.h) * (p.y1 - p.y0);
    return { e, n };
  }
  if (p.kind === "custom" && p.cal && p.cal.length === 2) {
    const [A, B] = p.cal;
    // transformación de semejanza 2D (Helmert) a partir de 2 puntos: escala+rotación+traslación
    const dpx = B.px - A.px, dpy = B.py - A.py;
    const de = B.e - A.e, dn = B.n - A.n;
    const denom = dpx * dpx + dpy * dpy;
    if (denom === 0) return null;
    // resolver [de;dn] = [[a,-b],[b,a]] * [dpx;dpy]
    const a = (dpx * de + dpy * dn) / denom;
    const b = (dpx * dn - dpy * de) / denom;
    const e = A.e + a * (px - A.px) - b * (py - A.py);
    const n = A.n + b * (px - A.px) + a * (py - A.py);
    return { e, n };
  }
  return null;
}

// mientras se arma el recuadro (esperando la 2ª esquina o un punto extra), el recuadro se
// dibuja EN VIVO siguiendo el dedo, sin necesidad de soltar/tocar para verlo crecer
function onSelMove(ev) {
  if (seleccionando !== 2 && seleccionando !== "extra") return;
  if (selPuntos.length === 0) return;
  if (ev.cancelable) ev.preventDefault(); // evita que el mapa haga scroll mientras arrastras
  const { px, py } = eventToImgPx(ev);
  const b = bboxDePuntos(selPuntos.concat([{ px, py }]));
  pendingCrop = b;
  posicionarSelRect();
}
document.getElementById("imgWrap").addEventListener("touchmove", onSelMove, { passive: false });
document.getElementById("imgWrap").addEventListener("mousemove", onSelMove);

let pendingTap = null;
document.getElementById("imgWrap").addEventListener("click", (ev) => {
  if (ev.target.id !== "planImg") return;
  const { px, py } = eventToImgPx(ev);
  const p = state.activePlano;

  if (seleccionando === "confirm") return; // esperando que use los botones de abajo

  if (seleccionando === 1) {
    selPuntos = [{ px, py }];
    seleccionando = 2;
    mostrarCrosshair(px, py);
    setSelBanner("Mueve el dedo y toca la esquina opuesta del área.");
    return;
  }
  if (seleccionando === 2 || seleccionando === "extra") {
    selPuntos.push({ px, py });
    ocultarCrosshair();
    const b = bboxDePuntos(selPuntos);
    if (b.x1 - b.x0 < 5 || b.y1 - b.y0 < 5) {
      setSelBanner("Área muy pequeña — toca de nuevo la primera esquina.");
      selPuntos = [];
      seleccionando = 1;
      return;
    }
    seleccionando = "confirm";
    showSelConfirm(b.x0, b.y0, b.x1, b.y1);
    return;
  }

  if (p && p.kind === "custom" && calibrando) {
    const e = prompt("Este (UTM), para el punto " + calibrando + ":");
    if (e === null) { calibrando = null; return; }
    const n = prompt("Norte (UTM), para el punto " + calibrando + ":");
    if (n === null) { calibrando = null; return; }
    p.cal = p.cal || [];
    p.cal[calibrando - 1] = { px, py, e: parseFloat(e), n: parseFloat(n) };
    calibrando = null;
    save();
    renderCalLayer();
    updateCalStatus();
    return;
  }

  const utm = pxToUTM(px, py);
  if (!utm) { alert("Este plano aún no está calibrado. Ve a Proyecto → Calibración."); return; }
  abrirModalNuevo(px, py, utm);
});

function renderCalLayer() {
  const layer = document.getElementById("calLayer");
  layer.innerHTML = "";
  const p = state.activePlano;
  const img = document.getElementById("planImg");
  if (!p || p.kind !== "custom" || !p.cal) return;
  p.cal.forEach((c, i) => {
    if (!c) return;
    const d = document.createElement("div");
    d.className = "calpt";
    d.style.left = (c.px / img.naturalWidth * img.clientWidth) + "px";
    d.style.top = (c.py / img.naturalHeight * img.clientHeight) + "px";
    layer.appendChild(d);
  });
}

// etiquetas de puntos ocultas por defecto (tapan el plano si hay muchas juntas): el primer
// toque sobre un punto solo muestra su etiqueta; si ya estaba mostrada, ese segundo toque
// abre la ficha para editarlo.
const etiquetasVisibles = new Set();

function renderPuntos() {
  const layer = document.getElementById("ptLayer");
  layer.innerHTML = "";
  const img = document.getElementById("planImg");
  const p = state.activePlano;
  if (!p) return;
  const tramoActual = p.kind === "preset" ? p.tramo : "custom";
  state.puntos
    .filter(pt => pt.tramo === tramoActual || (p.kind === "custom"))
    .forEach(pt => {
      if (pt._px == null) return;
      const color = (CAPAS[pt.capa] || CAPAS.muestreo).color;
      const d = document.createElement("div");
      d.className = "pt";
      d.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 0C6.5 0 2 4.5 2 10c0 7.5 10 14 10 14s10-6.5 10-14C22 4.5 17.5 0 12 0z" fill="' + color + '" stroke="#14171C" stroke-width="1"/><circle cx="12" cy="10" r="4" fill="#14171C"/></svg>';
      d.style.left = (pt._px / img.naturalWidth * img.clientWidth) + "px";
      d.style.top = (pt._py / img.naturalHeight * img.clientHeight) + "px";
      if (etiquetasVisibles.has(pt.id)) {
        const lbl = document.createElement("div");
        lbl.className = "pt-label";
        lbl.textContent = pt.clave || "(sin clave)";
        d.appendChild(lbl);
      }
      d.style.pointerEvents = "auto";
      d.addEventListener("click", (e) => {
        e.stopPropagation();
        if (etiquetasVisibles.has(pt.id)) {
          abrirModalEditar(pt);
        } else {
          etiquetasVisibles.add(pt.id);
          renderPuntos();
        }
      });
      layer.appendChild(d);
    });
}

// tocar el plano fuera de cualquier punto oculta todas las etiquetas encendidas
document.getElementById("imgWrap").addEventListener("click", (ev) => {
  if (ev.target.id === "planImg" && etiquetasVisibles.size) {
    etiquetasVisibles.clear();
    renderPuntos();
  }
}, true);

// ---------- mira (cruz de hilos) sobre el punto que se está marcando ----------
let crosshairPxPy = null;
function mostrarCrosshair(px, py) {
  crosshairPxPy = { px, py };
  posicionarCrosshair();
  document.getElementById("crosshair").style.display = "block";
}
function ocultarCrosshair() {
  crosshairPxPy = null;
  document.getElementById("crosshair").style.display = "none";
}
function posicionarCrosshair() {
  if (!crosshairPxPy) return;
  const img = document.getElementById("planImg");
  const ch = document.getElementById("crosshair");
  ch.style.left = (crosshairPxPy.px / img.naturalWidth * img.clientWidth) + "px";
  ch.style.top = (crosshairPxPy.py / img.naturalHeight * img.clientHeight) + "px";
}

// re-render puntos (y reubicar la mira) si la imagen cambia de tamaño (pinch zoom nativo)
window.addEventListener("resize", () => { renderCalLayer(); renderPuntos(); renderGridOverlay(); posicionarCrosshair(); posicionarSelRect(); });
document.getElementById("mapScroll").addEventListener("scroll", () => {}, { passive: true });

// ---------- modal de punto ----------
const modalBg = document.getElementById("modalPunto");
let modalEditId = null;
let modalPxPy = null;

function abrirModalNuevo(px, py, utm) {
  modalEditId = null;
  modalPxPy = { px, py };
  mostrarCrosshair(px, py);
  document.getElementById("modalTitulo").textContent = "Nuevo punto";
  document.getElementById("modalCoords").textContent =
    "E " + utm.e.toFixed(2) + "   N " + utm.n.toFixed(2);
  document.getElementById("mTipo").value = "canal";
  document.getElementById("mLong").value = "";
  document.getElementById("mNotas").value = "";
  pintarMineralesAccesorios([]);
  const capaNueva = state.capaActiva || "muestreo";
  document.getElementById("mNivel").value =
    (capaNueva === "muestreo") ? (nivelActivoStr() === "SUP" ? "Superficie" : nivelActivoStr())
                                : (state.proyecto.nivel || "");
  modalBg._capa = capaNueva;
  aplicarCapaEnModal(capaNueva);
  pintarDescGenPreview();
  construirCamposExtra(capaNueva, null);
  if (capaNueva === "muestreo") {
    modalBg._folioActivo = true;
    const qaqcSel = document.getElementById("mQAQC");
    if (qaqcSel) qaqcSel.value = "normal";
    document.getElementById("mClave").value = sugerirClaveFolio("normal");
  } else {
    document.getElementById("mClave").value = "";
  }
  document.getElementById("mBtnBorrar").style.display = "none";
  modalBg.classList.add("show");
  modalBg._utm = utm;
}

// glosario de notas de campo (muestreo geoquímico): clave corta -> frase para describir la
// muestra en el informe. Mismo diccionario que alimenta el desplegable #mNotasGlosario.
const GLOSARIO_NOTAS = {
  Vta: "veta", Vtass: "vetillas", Ox: "óxidos", Stock: "stockwork", Chim: "chimenea",
  Man: "manto", Cont: "contacto", Diq: "dique", Cz: "caliza", Intru: "intrusivo",
  Falla: "falla", Fx: "fractura", Brx: "brecha", Skn: "skarn", Gos: "gossan",
  Alt: "alteración", Vert: "orientación vertical",
};

const TIPO_MUESTRA_LABEL = {
  canal: "canal", esquirla: "esquirlas", grab: "grab/punto", rezaga: "rezaga", otro: "muestra",
};

// minerales accesorios observados in situ (muestreo geoquímico) — hasta 5 por muestra,
// capturados por clave corta para mantener la base de datos uniforme.
const MINERALES_ACCESORIOS = {
  Fl: "Fluorita", Ca: "Calcita", Qz: "Cuarzo", Bar: "Baritina", Py: "Pirita",
  Cpy: "Calcopirita", Gn: "Galena", Esf: "Esfalerita", Hem: "Hematita", Mag: "Magnetita",
  Lim: "Limonita", Goe: "Goethita", Yes: "Yeso", Dol: "Dolomita", Sid: "Siderita", Rod: "Rodocrosita",
  Mn: "Óxidos de manganeso", Mal: "Malaquita", Azu: "Azurita", Cris: "Crisocola",
  Wulf: "Wulfenita", Van: "Vanadinita", Mim: "Mimetita", Hmf: "Hemimorfita", Wil: "Willemita",
  Cer: "Cerusita", Angl: "Anglesita", Jar: "Jarosita", Epi: "Epidota", Gra: "Granate",
};

function poblarSelectsMinerales() {
  const optsHTML = '<option value="">—</option>' +
    Object.entries(MINERALES_ACCESORIOS).map(([k, v]) => `<option value="${k}">${k} — ${v}</option>`).join("") +
    '<option value="otro">Otro… (describir)</option>';
  document.querySelectorAll(".mMineralSel").forEach(sel => {
    sel.innerHTML = optsHTML;
    sel.addEventListener("change", () => {
      const otroEl = document.getElementById(sel.id + "Otro");
      if (!otroEl) return;
      if (sel.value === "otro") { otroEl.style.display = "block"; otroEl.focus(); }
      else { otroEl.style.display = "none"; otroEl.value = ""; }
    });
  });
}
poblarSelectsMinerales();

function leerMineralesAccesorios() {
  const vals = [];
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById("mMin" + i);
    if (!el || !el.value) continue;
    if (el.value === "otro") {
      const otroEl = document.getElementById("mMin" + i + "Otro");
      const libre = otroEl ? otroEl.value.trim() : "";
      if (libre && !vals.includes(libre)) vals.push(libre);
    } else if (!vals.includes(el.value)) {
      vals.push(el.value);
    }
  }
  return vals;
}
function pintarMineralesAccesorios(lista) {
  const arr = Array.isArray(lista) ? lista : [];
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById("mMin" + i);
    const otroEl = document.getElementById("mMin" + i + "Otro");
    const v = arr[i - 1] || "";
    if (!el) continue;
    if (v && !MINERALES_ACCESORIOS[v]) {
      el.value = "otro";
      if (otroEl) { otroEl.style.display = "block"; otroEl.value = v; }
    } else {
      el.value = v;
      if (otroEl) { otroEl.style.display = "none"; otroEl.value = ""; }
    }
  }
}

// genera, a partir de la clave de notas (términos del glosario separados por coma) y de los
// demás campos de la muestra, una descripción en prosa lista para usarse en el informe.
function generarDescripcionMuestra(pt) {
  if (!pt || (pt.capa || "muestreo") !== "muestreo") return "";
  const tipoLabel = TIPO_MUESTRA_LABEL[pt.tipo] || "muestra";
  let frase = `Muestra de ${tipoLabel}`;
  if (pt.longCanal) frase += ` de ${pt.longCanal} m`;
  const crudos = (pt.notas || "").split(",").map(s => s.trim()).filter(Boolean);
  const reconocidos = [], libres = [];
  crudos.forEach(c => { if (GLOSARIO_NOTAS[c]) reconocidos.push(GLOSARIO_NOTAS[c]); else libres.push(c); });
  if (reconocidos.length) {
    frase += ` en ${reconocidos[0]}`;
    if (reconocidos.length > 1) frase += " con " + reconocidos.slice(1).join(" y ");
  }
  if (pt.nivel) frase += `, Nivel ${pt.nivel}`;
  frase += ".";
  if (libres.length) frase += ` (${libres.join(", ")})`;
  const minerales = (pt.mineralesAccesorios || []).map(c => MINERALES_ACCESORIOS[c] || c);
  if (minerales.length) frase += ` Minerales accesorios in situ: ${minerales.join(", ")}.`;
  return frase;
}

function aplicarCapaEnModal(capa) {
  const conf = CAPAS[capa] || CAPAS.muestreo;
  document.getElementById("mMuestreoFields").style.display = (capa === "muestreo") ? "block" : "none";
  const glosWrap = document.getElementById("mNotasGlosarioWrap");
  if (glosWrap) glosWrap.style.display = (capa === "muestreo") ? "block" : "none";
  const minWrap = document.getElementById("mMineralesWrap");
  if (minWrap) minWrap.style.display = (capa === "muestreo") ? "flex" : "none";
  const badge = document.getElementById("modalCapaBadge");
  badge.querySelector(".dot").style.background = conf.color;
  badge.querySelector("span:last-child").textContent = conf.label;
}

// glosario de notas de campo (muestreo geoquímico) — estandariza la columna "notas" con
// términos controlados en vez de texto libre; el operador puede elegir varios, se
// concatenan por coma en el mismo campo de notas.
const mNotasGlosarioSel = document.getElementById("mNotasGlosario");
function pintarDescGenPreview() {
  const prev = document.getElementById("mDescGenPreview");
  if (!prev) return;
  const capa = modalBg && modalBg._capa ? modalBg._capa : state.capaActiva;
  if ((capa || "muestreo") !== "muestreo") { prev.textContent = ""; return; }
  const ptPreview = {
    capa: "muestreo",
    tipo: (document.getElementById("mTipo") || {}).value,
    longCanal: (document.getElementById("mLong") || {}).value,
    notas: (document.getElementById("mNotas") || {}).value,
    nivel: (document.getElementById("mNivel") || {}).value,
    mineralesAccesorios: leerMineralesAccesorios(),
  };
  const desc = generarDescripcionMuestra(ptPreview);
  prev.textContent = desc ? "Descripción para informe: " + desc : "";
}
if (mNotasGlosarioSel) {
  mNotasGlosarioSel.addEventListener("change", () => {
    const term = mNotasGlosarioSel.value;
    if (!term) return;
    const notasEl = document.getElementById("mNotas");
    const actuales = notasEl.value.split(",").map(s => s.trim()).filter(Boolean);
    if (!actuales.includes(term)) actuales.push(term);
    notasEl.value = actuales.join(", ");
    mNotasGlosarioSel.value = "";
    pintarDescGenPreview();
  });
}
["mNotas", "mTipo", "mLong", "mNivel",
 "mMin1", "mMin2", "mMin3", "mMin4", "mMin5",
 "mMin1Otro", "mMin2Otro", "mMin3Otro", "mMin4Otro", "mMin5Otro"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", pintarDescGenPreview);
  if (el) el.addEventListener("change", pintarDescGenPreview);
});

// constructor genérico reutilizado por el modal de puntos (capas) y por el modal de tramos de barreno
function construirCamposDesdeLista(cont, lista, valores, prefijoId) {
  cont.innerHTML = "";
  lista.forEach(f => {
    const lbl = document.createElement("label");
    lbl.textContent = f.label;
    cont.appendChild(lbl);
    let el;
    if (f.type === "select") {
      el = document.createElement("select");
      f.options.forEach(([val, txt]) => {
        const o = document.createElement("option");
        o.value = val; o.textContent = txt;
        el.appendChild(o);
      });
    } else if (f.type === "textarea") {
      el = document.createElement("textarea");
    } else {
      el = document.createElement("input");
      el.type = f.type === "number" ? "number" : "text";
      if (f.type === "number") el.step = "0.1";
    }
    el.id = prefijoId + f.id;
    // en un <select> asignar "" cuando ninguna opción tiene ese valor deja el campo SIN
    // selección (selectedIndex=-1); si no hay valor guardado, se deja la 1ª opción por defecto
    if (valores && valores[f.id] != null) el.value = valores[f.id];
    else if (f.type !== "select") el.value = "";
    cont.appendChild(el);
  });
}
function leerCamposDesdeLista(lista, prefijoId) {
  const out = {};
  lista.forEach(f => {
    const el = document.getElementById(prefijoId + f.id);
    if (el) out[f.id] = el.value;
  });
  return out;
}
function construirCamposExtra(capa, valores) {
  const cont = document.getElementById("mCamposExtra");
  const conf = CAPAS[capa] || CAPAS.muestreo;
  construirCamposDesdeLista(cont, conf.campos, valores, "mx_");
}

function abrirModalEditar(pt) {
  modalEditId = pt.id;
  modalPxPy = { px: pt._px, py: pt._py };
  mostrarCrosshair(pt._px, pt._py);
  const capa = pt.capa || "muestreo";
  modalBg._capa = capa;
  document.getElementById("modalTitulo").textContent = "Editar punto";
  document.getElementById("modalCoords").textContent =
    "E " + pt.este.toFixed(2) + "   N " + pt.norte.toFixed(2);
  document.getElementById("mClave").value = pt.clave || "";
  document.getElementById("mTipo").value = pt.tipo || "canal";
  document.getElementById("mLong").value = pt.longCanal || "";
  document.getElementById("mNivel").value = pt.nivel || "";
  document.getElementById("mNotas").value = pt.notas || "";
  pintarMineralesAccesorios(pt.mineralesAccesorios || []);
  const qaqcSelEd = document.getElementById("mQAQC");
  if (qaqcSelEd) qaqcSelEd.value = pt.qaqc || "normal";
  aplicarCapaEnModal(capa);
  pintarDescGenPreview();
  construirCamposExtra(capa, pt.campos || null);
  document.getElementById("mBtnBorrar").style.display = "inline-block";
  modalBg.classList.add("show");
  modalBg._utm = { e: pt.este, n: pt.norte };
}

document.getElementById("mBtnCancelar").addEventListener("click", () => { modalBg.classList.remove("show"); ocultarCrosshair(); });

// al cambiar el tipo de folio (Normal/Blanco/Duplicado/Estándar) en un punto NUEVO de muestreo,
// recalcula la clave sugerida con el sufijo correspondiente (el consecutivo sigue siendo el mismo
// folio de la serie: un control QA/QC también "consume" su lugar en la numeración real)
const mQAQCEl = document.getElementById("mQAQC");
if (mQAQCEl) {
  mQAQCEl.addEventListener("change", () => {
    if (modalEditId || !modalBg._folioActivo) return;
    document.getElementById("mClave").value = sugerirClaveFolio(mQAQCEl.value);
  });
}

document.getElementById("mBtnGuardar").addEventListener("click", () => {
  const clave = document.getElementById("mClave").value.trim();
  if (!clave) { alert("Falta la clave de estación."); return; }
  const utm = modalBg._utm;
  const p = state.activePlano;
  const tramo = p.kind === "preset" ? p.tramo : "custom";
  const capa = modalBg._capa || "muestreo";
  const data = {
    capa,
    clave,
    nivel: document.getElementById("mNivel").value,
    notas: document.getElementById("mNotas").value,
    este: utm.e, norte: utm.n,
    tramo,
    _px: modalPxPy.px, _py: modalPxPy.py,
  };
  if (capa === "muestreo") {
    data.tipo = document.getElementById("mTipo").value;
    data.longCanal = document.getElementById("mLong").value;
    const qaqcSelGuardar = document.getElementById("mQAQC");
    data.qaqc = qaqcSelGuardar ? qaqcSelGuardar.value : "normal";
    data.mineralesAccesorios = leerMineralesAccesorios();
    if (!modalEditId) consumirFolio(); // apartar/consumir el folio de esta serie al guardar (no al abrir)
  } else {
    const campos = {};
    (CAPAS[capa] || CAPAS.muestreo).campos.forEach(f => {
      const el = document.getElementById("mx_" + f.id);
      if (el) campos[f.id] = el.value;
    });
    data.campos = campos;
  }
  if (modalEditId) {
    const i = state.puntos.findIndex(x => x.id === modalEditId);
    if (i >= 0) state.puntos[i] = { ...state.puntos[i], ...data };
  } else {
    data.id = "p" + (state.nextLocalId++);
    data.fecha = new Date().toISOString();
    state.puntos.push(data);
  }
  save();
  modalBg.classList.remove("show");
  ocultarCrosshair();
  renderPuntos();
  renderLista();
  pintarFolioEstadoTramo();
});

document.getElementById("mBtnBorrar").addEventListener("click", () => {
  if (!confirm("¿Borrar este punto?")) return;
  state.puntos = state.puntos.filter(x => x.id !== modalEditId);
  save();
  modalBg.classList.remove("show");
  ocultarCrosshair();
  renderPuntos();
  renderLista();
});

// ---------- barrenos (logueo de sondeos) ----------
function barrenoPorId(id) { return state.barrenos.find(b => b.id === id); }
function tramosDe(barrenoId) {
  return state.tramosBarreno.filter(t => t.barrenoId === barrenoId).sort((a, b) => a.de - b.de);
}
function surveysDe(barrenoId) {
  return state.surveyBarreno.filter(s => s.barrenoId === barrenoId).sort((a, b) => a.prof - b.prof);
}

function renderBarrenosLista() {
  const wrap = document.getElementById("barrenosLista");
  if (!state.barrenos.length) {
    wrap.innerHTML = '<div class="empty">Aún no hay barrenos registrados.</div>';
  } else {
    let html = "";
    state.barrenos.forEach(b => {
      const n = tramosDe(b.id).length;
      html += `<div class="card" data-bid="${b.id}" style="cursor:pointer;margin-bottom:8px;">` +
        `<b style="color:#E4C765;">${b.clave}</b> <span class="muted">· prof. ${b.prof || "?"} m · ${n} tramo(s)</span></div>`;
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-bid]").forEach(card => {
      card.addEventListener("click", () => abrirBarreno(card.dataset.bid));
    });
  }
  document.getElementById("barrenosListaCard").style.display = "block";
  document.getElementById("barrenoDetalle").style.display = "none";
}

function abrirBarreno(id) {
  state.barrenoActivoId = id;
  save();
  const b = barrenoPorId(id);
  if (!b) { renderBarrenosLista(); return; }
  document.getElementById("barrenosListaCard").style.display = "none";
  document.getElementById("barrenoDetalle").style.display = "block";
  document.getElementById("bdTitulo").textContent = "Barreno " + b.clave;
  document.getElementById("bdResumen").textContent =
    "E " + (b.este || "?") + " · N " + (b.norte || "?") + " · cota " + (b.cota || "?") +
    " · az " + (b.azimut || 0) + "° · incl " + (b.inclin || 0) + "° · prof. total " + (b.prof || "?") + " m";
  renderTramosWrap(id);
  renderSurveyWrap(id);
}
document.getElementById("btnCerrarBarreno").addEventListener("click", renderBarrenosLista);

function renderTramosWrap(barrenoId) {
  const wrap = document.getElementById("tramosWrap");
  const tramos = tramosDe(barrenoId);
  if (!tramos.length) { wrap.innerHTML = '<div class="empty">Sin tramos todavía.</div>'; return; }
  let html = "<table><thead><tr><th>De</th><th>A</th><th>Litología</th><th>Alt.</th><th>Estr.</th><th>RQD</th><th>QA/QC</th></tr></thead><tbody>";
  tramos.forEach(t => {
    const lito = (t.litologico && (t.litologico.tipoRoca || t.litologico.grupo)) || "";
    const alt = (t.alteracion && t.alteracion.tipoAlt) || "";
    const est = (t.estructural && t.estructural.tipoEstr) || "";
    const qaqc = t.esMuestra === "si" ? (QAQC_TIPOS[t.qaqc] || QAQC_TIPOS.normal).label : "";
    html += `<tr data-tid="${t.id}"><td>${t.de}</td><td>${t.a}</td><td>${lito}</td><td>${alt}</td>` +
      `<td>${est}</td><td>${t.rqd || ""}</td><td>${qaqc}</td></tr>`;
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
  wrap.querySelectorAll("tr[data-tid]").forEach(tr => {
    tr.addEventListener("click", () => abrirModalTramoEditar(tr.dataset.tid));
  });
}

function renderSurveyWrap(barrenoId) {
  const wrap = document.getElementById("surveyWrap");
  const lecturas = surveysDe(barrenoId);
  if (!lecturas.length) { wrap.innerHTML = '<div class="empty">Sin lecturas de desviación.</div>'; return; }
  let html = "<table><thead><tr><th>Prof. (m)</th><th>Azimut</th><th>Inclinación</th></tr></thead><tbody>";
  lecturas.forEach(s => {
    html += `<tr data-sid="${s.id}"><td>${s.prof}</td><td>${s.azimut}°</td><td>${s.inclin}°</td></tr>`;
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
  wrap.querySelectorAll("tr[data-sid]").forEach(tr => {
    tr.addEventListener("click", () => abrirModalSurveyEditar(tr.dataset.sid));
  });
}

// ---- modal collar (datos del barreno) ----
const modalBarrenoBg = document.getElementById("modalBarreno");
let barrenoEditId = null;
document.getElementById("btnNuevoBarreno").addEventListener("click", () => {
  barrenoEditId = null;
  ["bClave", "bEste", "bNorte", "bCota", "bProf", "bAzimut", "bInclin", "bDiam", "bFechaIni", "bFechaFin", "bEmpresa", "bNotas"]
    .forEach(id => document.getElementById(id).value = "");
  document.getElementById("bMetodo").value = "diamantina";
  document.getElementById("modalBarrenoTitulo").textContent = "Nuevo barreno";
  document.getElementById("bBtnBorrar").style.display = "none";
  modalBarrenoBg.classList.add("show");
});
document.getElementById("btnEditarBarreno").addEventListener("click", () => {
  const b = barrenoPorId(state.barrenoActivoId);
  if (!b) return;
  barrenoEditId = b.id;
  document.getElementById("bClave").value = b.clave || "";
  document.getElementById("bEste").value = b.este != null ? b.este : "";
  document.getElementById("bNorte").value = b.norte != null ? b.norte : "";
  document.getElementById("bCota").value = b.cota != null ? b.cota : "";
  document.getElementById("bProf").value = b.prof != null ? b.prof : "";
  document.getElementById("bAzimut").value = b.azimut != null ? b.azimut : "";
  document.getElementById("bInclin").value = b.inclin != null ? b.inclin : "";
  document.getElementById("bMetodo").value = b.metodo || "diamantina";
  document.getElementById("bDiam").value = b.diam || "";
  document.getElementById("bFechaIni").value = b.fechaIni || "";
  document.getElementById("bFechaFin").value = b.fechaFin || "";
  document.getElementById("bEmpresa").value = b.empresa || "";
  document.getElementById("bNotas").value = b.notas || "";
  document.getElementById("modalBarrenoTitulo").textContent = "Editar barreno";
  document.getElementById("bBtnBorrar").style.display = "inline-block";
  modalBarrenoBg.classList.add("show");
});
document.getElementById("bBtnCancelar").addEventListener("click", () => modalBarrenoBg.classList.remove("show"));
document.getElementById("bBtnGuardar").addEventListener("click", () => {
  const clave = document.getElementById("bClave").value.trim();
  if (!clave) { alert("Falta la clave del barreno."); return; }
  const num = id => { const v = document.getElementById(id).value; return v === "" ? null : parseFloat(v); };
  const data = {
    clave,
    este: num("bEste"), norte: num("bNorte"), cota: num("bCota"), prof: num("bProf"),
    azimut: num("bAzimut"), inclin: num("bInclin"),
    metodo: document.getElementById("bMetodo").value,
    diam: document.getElementById("bDiam").value,
    fechaIni: document.getElementById("bFechaIni").value,
    fechaFin: document.getElementById("bFechaFin").value,
    empresa: document.getElementById("bEmpresa").value,
    notas: document.getElementById("bNotas").value,
  };
  if (barrenoEditId) {
    const i = state.barrenos.findIndex(x => x.id === barrenoEditId);
    if (i >= 0) state.barrenos[i] = { ...state.barrenos[i], ...data };
    save();
    modalBarrenoBg.classList.remove("show");
    abrirBarreno(barrenoEditId);
  } else {
    const id = "b" + (state.nextBarrenoId++);
    state.barrenos.push({ id, ...data });
    save();
    modalBarrenoBg.classList.remove("show");
    abrirBarreno(id);
  }
});
document.getElementById("bBtnBorrar").addEventListener("click", () => {
  if (!confirm("¿Borrar este barreno y todos sus tramos y lecturas de desviación?")) return;
  state.barrenos = state.barrenos.filter(x => x.id !== barrenoEditId);
  state.tramosBarreno = state.tramosBarreno.filter(x => x.barrenoId !== barrenoEditId);
  state.surveyBarreno = state.surveyBarreno.filter(x => x.barrenoId !== barrenoEditId);
  save();
  modalBarrenoBg.classList.remove("show");
  renderBarrenosLista();
});

// ---- folio de muestra de ensaye dentro de un barreno ----
function proximoConsecutivoBarreno(barrenoId) {
  if (!state.folioBarreno) state.folioBarreno = {};
  return (state.folioBarreno[barrenoId] || 0) + 1;
}
function sugerirFolioBarreno(barrenoId, qaqc) {
  const b = barrenoPorId(barrenoId);
  const abrev = (state.proyecto.abrev || abreviarProyecto(state.proyecto.proyecto) || "").trim().toUpperCase();
  const cons = proximoConsecutivoBarreno(barrenoId);
  const suf = (QAQC_TIPOS[qaqc] || QAQC_TIPOS.normal).sufijo;
  const base = (abrev ? abrev + "-" : "") + (b ? b.clave : "BRN") + "-" + pad3(cons);
  return base + suf;
}
function consumirFolioBarreno(barrenoId) {
  state.folioBarreno[barrenoId] = proximoConsecutivoBarreno(barrenoId);
}

// ---- modal de tramo de logueo ----
const modalTramoBg = document.getElementById("modalTramo");
let tramoEditId = null;
function avisarContinuidadTramo(de) {
  const el = document.getElementById("tramoAvisoContinuidad");
  const tramos = tramosDe(state.barrenoActivoId);
  const ultimo = tramos.length ? tramos[tramos.length - 1] : null;
  if (!ultimo) { el.textContent = ""; return; }
  if (Math.abs((de || 0) - ultimo.a) > 0.001) {
    el.innerHTML = de > ultimo.a
      ? `<span style="color:#E4C765;">Hueco sin loguear entre ${ultimo.a} m y ${de} m.</span>`
      : `<span style="color:#f1b4ac;">Se encima con el tramo anterior (hasta ${ultimo.a} m).</span>`;
  } else {
    el.textContent = "";
  }
}
document.getElementById("btnNuevoTramo").addEventListener("click", () => {
  tramoEditId = null;
  const tramos = tramosDe(state.barrenoActivoId);
  const ultimo = tramos.length ? tramos[tramos.length - 1] : null;
  document.getElementById("tDe").value = ultimo ? ultimo.a : 0;
  document.getElementById("tA").value = "";
  construirCamposDesdeLista(document.getElementById("tCamposLito"), CAPAS.litologico.campos, null, "tl_");
  construirCamposDesdeLista(document.getElementById("tCamposAlt"), CAPAS.alteracion.campos, null, "ta_");
  construirCamposDesdeLista(document.getElementById("tCamposEst"), CAPAS.estructural.campos, null, "te_");
  document.getElementById("tRQD").value = "";
  document.getElementById("tRecup").value = "";
  document.getElementById("tDureza").value = "";
  document.getElementById("tNotas").value = "";
  document.getElementById("tEsMuestra").value = "no";
  document.getElementById("tMuestraCampos").style.display = "none";
  document.getElementById("tQAQC").value = "normal";
  document.getElementById("tFolio").value = sugerirFolioBarreno(state.barrenoActivoId, "normal");
  avisarContinuidadTramo(ultimo ? ultimo.a : 0);
  document.getElementById("modalTramoTitulo").textContent = "Nuevo tramo";
  document.getElementById("tBtnBorrar").style.display = "none";
  modalTramoBg.classList.add("show");
});
document.getElementById("tDe").addEventListener("change", () => {
  if (!tramoEditId) avisarContinuidadTramo(parseFloat(document.getElementById("tDe").value) || 0);
});
document.getElementById("tEsMuestra").addEventListener("change", (ev) => {
  document.getElementById("tMuestraCampos").style.display = ev.target.value === "si" ? "block" : "none";
  if (ev.target.value === "si" && !tramoEditId) {
    document.getElementById("tFolio").value = sugerirFolioBarreno(state.barrenoActivoId, document.getElementById("tQAQC").value);
  }
});
document.getElementById("tQAQC").addEventListener("change", () => {
  if (!tramoEditId) document.getElementById("tFolio").value = sugerirFolioBarreno(state.barrenoActivoId, document.getElementById("tQAQC").value);
});
function abrirModalTramoEditar(id) {
  const t = state.tramosBarreno.find(x => x.id === id);
  if (!t) return;
  tramoEditId = id;
  document.getElementById("tDe").value = t.de;
  document.getElementById("tA").value = t.a;
  document.getElementById("tramoAvisoContinuidad").textContent = "";
  construirCamposDesdeLista(document.getElementById("tCamposLito"), CAPAS.litologico.campos, t.litologico, "tl_");
  construirCamposDesdeLista(document.getElementById("tCamposAlt"), CAPAS.alteracion.campos, t.alteracion, "ta_");
  construirCamposDesdeLista(document.getElementById("tCamposEst"), CAPAS.estructural.campos, t.estructural, "te_");
  document.getElementById("tRQD").value = t.rqd != null ? t.rqd : "";
  document.getElementById("tRecup").value = t.recup != null ? t.recup : "";
  document.getElementById("tDureza").value = t.dureza || "";
  document.getElementById("tNotas").value = t.notas || "";
  document.getElementById("tEsMuestra").value = t.esMuestra || "no";
  document.getElementById("tMuestraCampos").style.display = t.esMuestra === "si" ? "block" : "none";
  document.getElementById("tQAQC").value = t.qaqc || "normal";
  document.getElementById("tFolio").value = t.folio || "";
  document.getElementById("modalTramoTitulo").textContent = "Editar tramo";
  document.getElementById("tBtnBorrar").style.display = "inline-block";
  modalTramoBg.classList.add("show");
}
document.getElementById("tBtnCancelar").addEventListener("click", () => modalTramoBg.classList.remove("show"));
document.getElementById("tBtnGuardar").addEventListener("click", () => {
  const de = parseFloat(document.getElementById("tDe").value);
  const a = parseFloat(document.getElementById("tA").value);
  if (isNaN(de) || isNaN(a)) { alert("Falta el \"de\" o el \"a\" del tramo."); return; }
  if (a <= de) { alert("El \"a\" debe ser mayor que el \"de\"."); return; }
  const b = barrenoPorId(state.barrenoActivoId);
  if (b && b.prof != null && a > b.prof + 0.001) {
    if (!confirm("Este tramo llega a " + a + " m, más allá de la profundidad total registrada (" + b.prof + " m). ¿Guardar así?")) return;
  }
  const esMuestra = document.getElementById("tEsMuestra").value;
  const data = {
    barrenoId: state.barrenoActivoId, de, a,
    litologico: leerCamposDesdeLista(CAPAS.litologico.campos, "tl_"),
    alteracion: leerCamposDesdeLista(CAPAS.alteracion.campos, "ta_"),
    estructural: leerCamposDesdeLista(CAPAS.estructural.campos, "te_"),
    rqd: document.getElementById("tRQD").value, recup: document.getElementById("tRecup").value,
    dureza: document.getElementById("tDureza").value, notas: document.getElementById("tNotas").value,
    esMuestra,
    qaqc: esMuestra === "si" ? document.getElementById("tQAQC").value : "",
    folio: esMuestra === "si" ? document.getElementById("tFolio").value : "",
  };
  if (tramoEditId) {
    const i = state.tramosBarreno.findIndex(x => x.id === tramoEditId);
    if (i >= 0) state.tramosBarreno[i] = { ...state.tramosBarreno[i], ...data };
  } else {
    data.id = "t" + (state.nextTramoId++);
    state.tramosBarreno.push(data);
    if (esMuestra === "si") consumirFolioBarreno(state.barrenoActivoId);
  }
  save();
  modalTramoBg.classList.remove("show");
  renderTramosWrap(state.barrenoActivoId);
});
document.getElementById("tBtnBorrar").addEventListener("click", () => {
  if (!confirm("¿Borrar este tramo?")) return;
  state.tramosBarreno = state.tramosBarreno.filter(x => x.id !== tramoEditId);
  save();
  modalTramoBg.classList.remove("show");
  renderTramosWrap(state.barrenoActivoId);
});

// ---- modal de lectura de desviación (survey) ----
const modalSurveyBg = document.getElementById("modalSurvey");
let surveyEditId = null;
document.getElementById("btnNuevaSurvey").addEventListener("click", () => {
  surveyEditId = null;
  document.getElementById("svProf").value = "";
  document.getElementById("svAzimut").value = "";
  document.getElementById("svInclin").value = "";
  document.getElementById("svBtnBorrar").style.display = "none";
  modalSurveyBg.classList.add("show");
});
function abrirModalSurveyEditar(id) {
  const s = state.surveyBarreno.find(x => x.id === id);
  if (!s) return;
  surveyEditId = id;
  document.getElementById("svProf").value = s.prof;
  document.getElementById("svAzimut").value = s.azimut;
  document.getElementById("svInclin").value = s.inclin;
  document.getElementById("svBtnBorrar").style.display = "inline-block";
  modalSurveyBg.classList.add("show");
}
document.getElementById("svBtnCancelar").addEventListener("click", () => modalSurveyBg.classList.remove("show"));
document.getElementById("svBtnGuardar").addEventListener("click", () => {
  const prof = parseFloat(document.getElementById("svProf").value);
  const azimut = parseFloat(document.getElementById("svAzimut").value);
  const inclin = parseFloat(document.getElementById("svInclin").value);
  if (isNaN(prof) || isNaN(azimut) || isNaN(inclin)) { alert("Faltan datos de la lectura."); return; }
  if (surveyEditId) {
    const i = state.surveyBarreno.findIndex(x => x.id === surveyEditId);
    if (i >= 0) state.surveyBarreno[i] = { ...state.surveyBarreno[i], prof, azimut, inclin };
  } else {
    state.surveyBarreno.push({ id: "s" + (state.nextSurveyId++), barrenoId: state.barrenoActivoId, prof, azimut, inclin });
  }
  save();
  modalSurveyBg.classList.remove("show");
  renderSurveyWrap(state.barrenoActivoId);
});
document.getElementById("svBtnBorrar").addEventListener("click", () => {
  if (!confirm("¿Borrar esta lectura?")) return;
  state.surveyBarreno = state.surveyBarreno.filter(x => x.id !== surveyEditId);
  save();
  modalSurveyBg.classList.remove("show");
  renderSurveyWrap(state.barrenoActivoId);
});

// ---- exportar collar / geo / survey / muestras de un barreno (esquema Leapfrog) ----
document.getElementById("btnExportBarreno").addEventListener("click", () => {
  const b = barrenoPorId(state.barrenoActivoId);
  if (!b) return;
  const abrev = (state.proyecto.abrev || abreviarProyecto(state.proyecto.proyecto) || "PRY").trim().toUpperCase();
  const collarRows = ["hole_id,este_utm,norte_utm,cota,azimut,inclinacion,profundidad_m,metodo,diametro_nucleo,fecha_inicio,fecha_fin,empresa,notas",
    [csvCampo(b.clave), b.este ?? "", b.norte ?? "", b.cota ?? "", b.azimut ?? "", b.inclin ?? "", b.prof ?? "",
      csvCampo(b.metodo || ""), csvCampo(b.diam || ""), csvCampo(b.fechaIni || ""), csvCampo(b.fechaFin || ""),
      csvCampo(b.empresa || ""), csvCampo(b.notas || "")].join(",")];
  const surveyRows = ["hole_id,profundidad_m,azimut,inclinacion"];
  surveysDe(b.id).forEach(s => surveyRows.push([csvCampo(b.clave), s.prof, s.azimut, s.inclin].join(",")));
  const geoHeaders = ["hole_id", "de_m", "a_m", "grupo_litologico", "tipo_roca", "unidad", "textura",
    "tipo_alteracion", "intensidad_alt", "minerales_asociados",
    "tipo_estructura", "rumbo", "echado", "bloque", "cinematica", "relleno",
    "rqd_pct", "recuperacion_pct", "dureza", "notas"];
  const geoRows = [geoHeaders.join(",")];
  tramosDe(b.id).forEach(t => {
    const li = t.litologico || {}, al = t.alteracion || {}, es = t.estructural || {};
    geoRows.push([csvCampo(b.clave), t.de, t.a,
      csvCampo(li.grupo || ""), csvCampo(li.tipoRoca || ""), csvCampo(li.unidad || ""), csvCampo(li.textura || ""),
      csvCampo(al.tipoAlt || ""), csvCampo(al.intensidad || ""), csvCampo(al.mineralesAsoc || ""),
      csvCampo(es.tipoEstr || ""), csvCampo(es.rumbo || ""), csvCampo(es.echado || ""), csvCampo(es.bloque || ""),
      csvCampo(es.cinematica || ""), csvCampo(es.relleno || ""),
      csvCampo(t.rqd || ""), csvCampo(t.recup || ""), csvCampo(t.dureza || ""), csvCampo(t.notas || "")].join(","));
  });
  const muestraRows = ["hole_id,de_m,a_m,folio,qaqc"];
  tramosDe(b.id).filter(t => t.esMuestra === "si").forEach(t => {
    muestraRows.push([csvCampo(b.clave), t.de, t.a, csvCampo(t.folio || ""),
      csvCampo(t.qaqc && t.qaqc !== "normal" ? t.qaqc : "")].join(","));
  });
  const pref = abrev + "_" + b.clave;
  descargar(`collar_${pref}.csv`, collarRows.join("\n"), "text/csv");
  setTimeout(() => descargar(`survey_${pref}.csv`, surveyRows.join("\n"), "text/csv"), 350);
  setTimeout(() => descargar(`geo_${pref}.csv`, geoRows.join("\n"), "text/csv"), 700);
  setTimeout(() => descargar(`muestras_${pref}.csv`, muestraRows.join("\n"), "text/csv"), 1050);
});

// ---------- importar barrenos ya levantados (CSV collar / tramos) ----------
// Parser CSV simple que respeta comillas (campos con comas o comillas dentro, como los que
// genera "Exportar CSVs del barreno"), para poder traer de vuelta una base de datos de barrenos
// hecha fuera de la app (o exportada previamente) y seguir describiéndola desde aquí.
function parseCSVTexto(texto) {
  const txt = texto.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const filas = [];
  let fila = [], campo = "", enComillas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (enComillas) {
      if (c === '"') {
        if (txt[i + 1] === '"') { campo += '"'; i++; } else { enComillas = false; }
      } else campo += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === ",") {
      fila.push(campo); campo = "";
    } else if (c === "\n") {
      fila.push(campo); campo = "";
      filas.push(fila); fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  const limpias = filas.filter(f => f.some(v => v.trim() !== ""));
  if (!limpias.length) return [];
  const headers = limpias[0].map(h => h.trim().toLowerCase());
  return limpias.slice(1).map(f => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (f[idx] !== undefined ? f[idx] : "").trim(); });
    return obj;
  });
}
function numOImportar(v) {
  if (v === undefined || v === null || v.trim() === "") return null;
  const n = parseFloat(v.replace(",", "."));
  return isNaN(n) ? null : n;
}
function barrenoPorClave(clave) {
  return state.barrenos.find(b => (b.clave || "").trim().toLowerCase() === clave.trim().toLowerCase());
}

document.getElementById("fileImportCollar").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const filas = parseCSVTexto(String(reader.result));
    let creados = 0, actualizados = 0, sinClave = 0;
    filas.forEach(r => {
      const clave = (r.hole_id || r.clave || "").trim();
      if (!clave) { sinClave++; return; }
      const data = {
        clave,
        este: numOImportar(r.este_utm), norte: numOImportar(r.norte_utm), cota: numOImportar(r.cota),
        azimut: numOImportar(r.azimut), inclin: numOImportar(r.inclinacion), prof: numOImportar(r.profundidad_m),
        metodo: r.metodo || "diamantina", diam: r.diametro_nucleo || "",
        fechaIni: r.fecha_inicio || "", fechaFin: r.fecha_fin || "",
        empresa: r.empresa || "", notas: r.notas || "",
      };
      const existente = barrenoPorClave(clave);
      if (existente) {
        Object.assign(existente, data);
        actualizados++;
      } else {
        const id = "b" + (state.nextBarrenoId++);
        state.barrenos.push({ id, ...data });
        creados++;
      }
    });
    save();
    renderBarrenosLista();
    alert(`Importación de collares lista.\nCreados: ${creados}\nActualizados: ${actualizados}` +
      (sinClave ? `\nFilas sin hole_id/clave (omitidas): ${sinClave}` : ""));
    e.target.value = "";
  };
  reader.readAsText(file);
});

document.getElementById("fileImportGeo").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const filas = parseCSVTexto(String(reader.result));
    let agregados = 0, actualizadosT = 0, sinBarreno = [];
    filas.forEach(r => {
      const clave = (r.hole_id || r.clave || "").trim();
      const de = numOImportar(r.de_m), a = numOImportar(r.a_m);
      if (!clave || de == null || a == null) return;
      const b = barrenoPorClave(clave);
      if (!b) { if (!sinBarreno.includes(clave)) sinBarreno.push(clave); return; }
      const data = {
        barrenoId: b.id, de, a,
        litologico: { grupo: r.grupo_litologico || "", tipoRoca: r.tipo_roca || "", unidad: r.unidad || "", textura: r.textura || "" },
        alteracion: { tipoAlt: r.tipo_alteracion || "", intensidad: r.intensidad_alt || "", mineralesAsoc: r.minerales_asociados || "" },
        estructural: { tipoEstr: r.tipo_estructura || "", rumbo: r.rumbo || "", echado: r.echado || "", bloque: r.bloque || "", cinematica: r.cinematica || "", relleno: r.relleno || "" },
        rqd: r.rqd_pct || "", recup: r.recuperacion_pct || "", dureza: r.dureza || "", notas: r.notas || "",
        esMuestra: "no", qaqc: "", folio: "",
      };
      const existente = state.tramosBarreno.find(t => t.barrenoId === b.id && t.de === de && t.a === a);
      if (existente) {
        Object.assign(existente, data);
        actualizadosT++;
      } else {
        data.id = "t" + (state.nextTramoId++);
        state.tramosBarreno.push(data);
        agregados++;
      }
    });
    save();
    renderBarrenosLista();
    if (state.barrenoActivoId) renderTramosWrap(state.barrenoActivoId);
    alert(`Importación de tramos lista.\nTramos nuevos: ${agregados}\nTramos actualizados (mismo de-a): ${actualizadosT}` +
      (sinBarreno.length ? `\nhole_id sin barreno existente (importa primero el collar): ${sinBarreno.join(", ")}` : ""));
    e.target.value = "";
  };
  reader.readAsText(file);
});

// ---------- lista ----------
function resumenCapa(pt) {
  const capa = pt.capa || "muestreo";
  if (capa === "muestreo") {
    const q = pt.qaqc && pt.qaqc !== "normal" ? " · " + (QAQC_TIPOS[pt.qaqc] || {}).label : "";
    return (pt.tipo || "") + q;
  }
  const conf = CAPAS[capa];
  if (!conf || !pt.campos) return "";
  const primero = conf.campos[0];
  return primero ? (pt.campos[primero.id] || "") : "";
}

function renderLista() {
  const wrap = document.getElementById("tablaWrap");
  if (state.puntos.length === 0) {
    wrap.innerHTML = '<div class="empty">Aún no hay puntos capturados.</div>';
    return;
  }
  let html = "<table><thead><tr><th>Clave</th><th>Capa</th><th>Detalle</th><th>Tramo</th><th>Este</th><th>Norte</th></tr></thead><tbody>";
  state.puntos.forEach(pt => {
    const conf = CAPAS[pt.capa || "muestreo"] || CAPAS.muestreo;
    html += `<tr data-id="${pt.id}"><td>${pt.clave}</td>` +
      `<td><span class="pill" style="color:${conf.color};">${conf.label}</span></td>` +
      `<td>${resumenCapa(pt)}</td>` +
      `<td>${pt.tramo || ""}</td><td>${pt.este.toFixed(1)}</td><td>${pt.norte.toFixed(1)}</td></tr>`;
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
  wrap.querySelectorAll("tr[data-id]").forEach(tr => {
    tr.addEventListener("click", () => {
      const pt = state.puntos.find(x => x.id === tr.dataset.id);
      if (pt) abrirModalEditar(pt);
    });
  });
}

// ---------- exportar ----------
// columnas extra: la unión de los campos propios de todas las capas (alteración, litológico,
// estructural, superficie); quedan vacías en las filas de una capa que no las usa
const EXTRA_FIELD_IDS = [];
Object.values(CAPAS).forEach(c => c.campos.forEach(f => {
  if (!EXTRA_FIELD_IDS.includes(f.id)) EXTRA_FIELD_IDS.push(f.id);
}));

function csvCampo(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }

function toCSV() {
  const headers = ["capa", "clave", "tipo", "qaqc", "long_canal_m", ...EXTRA_FIELD_IDS,
    "nivel", "tramo", "este_utm13n", "norte_utm13n", "notas", "minerales_accesorios", "descripcion_generada", "fecha"];
  const rows = [headers.join(",")];
  state.puntos.forEach(pt => {
    const extras = EXTRA_FIELD_IDS.map(id => csvCampo(pt.campos ? pt.campos[id] : ""));
    const vals = [csvCampo((CAPAS[pt.capa || "muestreo"] || CAPAS.muestreo).label),
      csvCampo(pt.clave), csvCampo(pt.tipo || ""), csvCampo(pt.qaqc && pt.qaqc !== "normal" ? pt.qaqc : ""),
      csvCampo(pt.longCanal || ""),
      ...extras,
      csvCampo(pt.nivel), csvCampo(pt.tramo),
      pt.este.toFixed(3), pt.norte.toFixed(3),
      csvCampo(pt.notas || ""), csvCampo((pt.mineralesAccesorios || []).join("; ")),
      csvCampo(generarDescripcionMuestra(pt)), csvCampo(pt.fecha)];
    rows.push(vals.join(","));
  });
  return rows.join("\n");
}

function toGeoJSON() {
  return JSON.stringify({
    type: "FeatureCollection",
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::32613" } },
    features: state.puntos.map(pt => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [pt.este, pt.norte] },
      properties: { capa: (CAPAS[pt.capa || "muestreo"] || CAPAS.muestreo).label,
        clave: pt.clave, tipo: pt.tipo || null,
        qaqc: pt.qaqc && pt.qaqc !== "normal" ? pt.qaqc : null, long_canal_m: pt.longCanal || null,
        ...(pt.campos || {}),
        nivel: pt.nivel, tramo: pt.tramo, notas: pt.notas,
        minerales_accesorios: pt.mineralesAccesorios || [],
        descripcion_generada: generarDescripcionMuestra(pt), fecha: pt.fecha },
    })),
  }, null, 2);
}

function descargar(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

document.getElementById("btnExport").addEventListener("click", () => {
  if (state.puntos.length === 0) { alert("No hay puntos que exportar todavía."); return; }
  const fecha = new Date().toISOString().slice(0, 10);
  const nivel = state.proyecto.nivel || "XX";
  descargar(`muestreo_nivel${nivel}_${fecha}.csv`, toCSV(), "text/csv");
  setTimeout(() => descargar(`muestreo_nivel${nivel}_${fecha}.geojson`, toGeoJSON(), "application/geo+json"), 400);
});

document.getElementById("btnBackupJSON").addEventListener("click", () => {
  descargar("nwgeo_muestreo_backup.json", JSON.stringify(state, null, 2), "application/json");
});

document.getElementById("fileRestore").addEventListener("change", (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const restored = JSON.parse(e.target.result);
      if (!confirm("Esto reemplaza todos los puntos y planos cargados por los del respaldo. ¿Continuar?")) return;
      normalizarEstado(restored);
      state = restored;
      save();
      fillProyectoForm();
      renderCapaBar();
      mostrarPlano();
      renderLista();
      pintarFolioEstadoTramo();
      pintarNivelActivoUI();
      renderBarrenosLista();
      alert("Respaldo restaurado.");
    } catch (err) {
      alert("Ese archivo no es un respaldo válido.");
    }
  };
  reader.readAsText(file);
});

// ---------- init ----------
if (state.activePlano) mostrarPlano();

// service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
