// ============================================================================
// nwgeo Muestreo — candado de licencia para la copia de PRÉSTAMO (Río Tinto /
// Minera Terrazas). Este archivo SOLO va en esta copia independiente de
// GitHub Pages, nunca en la copia de trabajo ni en el repo general.
//
// Dos capas independientes:
//   1) Candado local (offline): 30 días desde la primera apertura, con aviso
//      5 días antes, bloqueo de pantalla al vencer (deja exportar un último
//      CSV/GeoJSON) y reactivación por código NW-AAAAMMDD-XXXXXXXXXX generado
//      en la página "Generador de código · Terrazas" (artefacto aparte, solo
//      para Wulfenita LLC / Níwami Resources). El reloj del dispositivo no
//      sirve para hacer trampa: la app recuerda la última fecha vista y nunca
//      retrocede.
//   2) Candado remoto (en línea, vía un archivo JSON propio en este mismo
//      repo): si alguien manipula este archivo para quitarse el candado
//      local, en cuanto el dispositivo tenga conexión esta capa revisa
//      "licencia.json" y, si está bloqueado o vencido, deshabilita solo el
//      botón de exportar (el resto de la app sigue funcionando). No hay
//      panel de administración dentro de la app: para bloquear o reactivar
//      remotamente, Wulfenita LLC / Níwami Resources edita y sube
//      "licencia.json" en el repo de GitHub de esta copia.
// ============================================================================
(function () {
  "use strict";

  // ======================= Candado local (offline) =========================
  var LS_KEY = "nwgeo_licencia_v1";
  var SECRET = "WLLC-NIWAMI-MXC-CONGRESO-LEON-2026-NO-COMPARTIR";
  var DIAS_PRESTAMO = 30;
  var DIAS_AVISO = 5;
  var MS_POR_DIA = 24 * 60 * 60 * 1000;

  function hoyISO(d) { return d.toISOString().slice(0, 10); }

  function leerEstado() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }
  function guardarEstado(st) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch (e) {}
  }
  function inicializarEstado() {
    var hoy = new Date();
    var exp = new Date(hoy); exp.setDate(exp.getDate() + DIAS_PRESTAMO);
    var st = { primeraApertura: hoyISO(hoy), expiry: hoyISO(exp), ultimaFechaVista: hoyISO(hoy) };
    guardarEstado(st);
    return st;
  }

  async function sha256hex(str) {
    var enc = new TextEncoder().encode(str);
    var buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  // Valida un código NW-AAAAMMDD-XXXXXXXXXX contra el mismo secreto que usa
  // "Generador de código · Terrazas". Devuelve la nueva fecha (YYYY-MM-DD) o
  // null si el código no es válido.
  async function validarCodigo(code) {
    var m = /^NW-(\d{8})-([0-9A-Fa-f]{10})$/.exec((code || "").trim().toUpperCase());
    if (!m) return null;
    var yyyymmdd = m[1], firma = m[2];
    var full = await sha256hex(yyyymmdd + SECRET);
    if (full.slice(0, 10).toUpperCase() !== firma) return null;
    return yyyymmdd.slice(0, 4) + "-" + yyyymmdd.slice(4, 6) + "-" + yyyymmdd.slice(6, 8);
  }

  var estado = leerEstado() || inicializarEstado();
  var hoyStr = hoyISO(new Date());
  // Anti-trampa: la fecha "vista" nunca retrocede, aunque adelanten o atrasen
  // el reloj del dispositivo.
  var efectivaStr = (estado.ultimaFechaVista || estado.primeraApertura) > hoyStr
    ? (estado.ultimaFechaVista || estado.primeraApertura) : hoyStr;
  if (efectivaStr !== estado.ultimaFechaVista) {
    estado.ultimaFechaVista = efectivaStr;
    guardarEstado(estado);
  }

  var diasRestantes = Math.floor((new Date(estado.expiry) - new Date(efectivaStr)) / MS_POR_DIA);
  var vencido = diasRestantes < 0;

  function crearOverlay() {
    var ov = document.createElement("div");
    ov.id = "nwLicenciaOverlay";
    ov.style.cssText = "position:fixed;inset:0;z-index:9999;display:none;flex-direction:column;" +
      "background:rgba(10,12,15,.97);color:#F6F3EC;font-family:-apple-system,BlinkMacSystemFont,sans-serif;" +
      "padding:20px;padding-top:calc(20px + env(safe-area-inset-top,0px));" +
      "padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));overflow:auto;";
    document.body.appendChild(ov);
    return ov;
  }
  var overlay = crearOverlay();

  function mostrarAviso() {
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div style="max-width:420px;margin:auto;text-align:center;">' +
      '<h2 style="color:#E4C765;margin-bottom:10px;">Préstamo por vencer</h2>' +
      '<p style="line-height:1.5;">Quedan <b>' + diasRestantes + ' día(s)</b> de esta copia de préstamo. ' +
      'Exporta tu CSV/GeoJSON antes de que termine el periodo.</p>' +
      '<button id="nwLicContinuar" style="margin-top:14px;padding:12px 20px;border:none;border-radius:10px;' +
      'background:#C9A227;color:#1b1500;font-weight:700;font-size:14px;">Entendido, continuar</button>' +
      "</div>";
    document.getElementById("nwLicContinuar").addEventListener("click", function () {
      overlay.style.display = "none";
    });
  }

  function mostrarBloqueo() {
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div style="max-width:420px;margin:auto;">' +
      '<h2 style="color:#E4C765;margin-bottom:10px;text-align:center;">Préstamo terminado</h2>' +
      "<p style=\"line-height:1.6;\">El periodo de préstamo de esta copia de <b>nwgeo Muestreo</b> terminó. " +
      "Para seguir usándola, contacta a Wulfenita LLC / Níwami Resources para recontratar el servicio.</p>" +
      "<p style=\"line-height:1.6;\">Mientras tanto puedes exportar lo ya capturado, pero no capturar datos " +
      "nuevos ni ver el plano.</p>" +
      '<button id="nwLicExportar" style="width:100%;margin-top:10px;padding:12px;border:none;border-radius:10px;' +
      'background:#262b33;color:#F6F3EC;border:1px solid #3a4048;font-size:14px;">' +
      "Exportar último CSV + GeoJSON</button>" +
      '<div style="margin-top:18px;border-top:1px solid #3a4048;padding-top:14px;">' +
      '<label style="font-size:11.5px;color:#7a8088;display:block;margin-bottom:4px;">Código de reactivación</label>' +
      '<input id="nwLicCodigo" placeholder="NW-AAAAMMDD-XXXXXXXXXX" style="width:100%;padding:10px;' +
      'border-radius:8px;border:1px solid #3a4048;background:#12151a;color:#F6F3EC;font-size:14px;">' +
      '<button id="nwLicActivar" style="width:100%;margin-top:8px;padding:12px;border:none;border-radius:10px;' +
      'background:#C9A227;color:#1b1500;font-weight:700;font-size:14px;">Reactivar</button>' +
      '<div id="nwLicMsg" style="margin-top:8px;font-size:12px;color:#B23A2E;"></div>' +
      "</div></div>";
    document.getElementById("nwLicExportar").addEventListener("click", function () {
      exportarEmergencia();
    });
    document.getElementById("nwLicActivar").addEventListener("click", async function () {
      var msg = document.getElementById("nwLicMsg");
      var val = document.getElementById("nwLicCodigo").value;
      var nuevaFecha = await validarCodigo(val);
      if (!nuevaFecha) { msg.style.color = "#B23A2E"; msg.textContent = "Código inválido."; return; }
      if (nuevaFecha <= efectivaStr) {
        msg.style.color = "#B23A2E";
        msg.textContent = "Ese código vence antes de hoy; pide uno con fecha futura.";
        return;
      }
      estado.expiry = nuevaFecha;
      guardarEstado(estado);
      msg.style.color = "#6fae6f";
      msg.textContent = "Reactivado hasta " + nuevaFecha + ". Recargando…";
      setTimeout(function () { location.reload(); }, 900);
    });
  }

  // Permite exportar el último CSV/GeoJSON aunque el candado local esté
  // vencido: usa el mismo botón de la app, saltando por un instante el
  // candado remoto (si estuviera también activo) para no bloquearse a sí
  // mismo en ese único clic de rescate.
  function exportarEmergencia() {
    var estabaBloqueadoRemoto = bloqueoRemotoActivo;
    bloqueoRemotoActivo = false;
    var btn = document.getElementById("btnExport");
    if (btn) btn.click();
    bloqueoRemotoActivo = estabaBloqueadoRemoto;
  }

  if (vencido) {
    mostrarBloqueo();
  } else if (diasRestantes <= DIAS_AVISO) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mostrarAviso);
    } else {
      mostrarAviso();
    }
  }

  // ======================= Candado remoto (en línea) ========================
  // Ya no depende de claude.ai: revisa un archivo propio "licencia.json"
  // servido junto con esta misma app en GitHub Pages. Para bloquear o
  // reactivar esta copia remotamente, Wulfenita LLC / Níwami Resources edita
  // ese archivo y lo sube al repo — no hace falta tocar código ni reinstalar
  // nada en el teléfono.
  var bloqueoRemotoActivo = false;

  function aplicarBloqueoExport() { bloqueoRemotoActivo = true; }
  function quitarBloqueoExport() { bloqueoRemotoActivo = false; }

  // Intercepta el clic del botón de exportar ANTES de que corra el código de
  // app.js, mientras el candado remoto esté activo.
  document.addEventListener("click", function (e) {
    if (!bloqueoRemotoActivo) return;
    var t = e.target;
    if (t && (t.id === "btnExport" || t.id === "btnExportBarreno")) {
      e.stopImmediatePropagation();
      e.preventDefault();
      alert("La exportación de esta copia está bloqueada remotamente. Contacta a Wulfenita LLC / Níwami Resources.");
    }
  }, true);

  function revisarLicenciaJSON(d) {
    if (!d) { quitarBloqueoExport(); return; }
    var bloqueadoManual = !!d.bloqueado;
    var expiradoRemoto = d.expiry && (new Date(d.expiry) < new Date());
    if (bloqueadoManual || expiradoRemoto) aplicarBloqueoExport();
    else quitarBloqueoExport();
  }

  async function revisarLicenciaOnline() {
    try {
      // "./licencia.json" para que funcione tanto en la raíz del sitio como
      // si el repo se sirve desde una subcarpeta de GitHub Pages.
      var resp = await fetch("./licencia.json", { cache: "no-store" });
      if (!resp.ok) return; // sin archivo o sin red: queda solo el candado local
      var d = await resp.json();
      revisarLicenciaJSON(d);
    } catch (e) {
      // sin conexión o archivo inalcanzable: no cambia el estado ya conocido
    }
  }

  // Revisa al cargar, al recuperar conexión, al volver a la pestaña/app y
  // cada 5 minutos mientras esté abierta.
  revisarLicenciaOnline();
  window.addEventListener("online", revisarLicenciaOnline);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") revisarLicenciaOnline();
  });
  setInterval(revisarLicenciaOnline, 5 * 60 * 1000);
})();
