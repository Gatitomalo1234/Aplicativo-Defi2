// app.js — navegación, piezas comunes de los módulos y el módulo GBM.
// Cada módulo (gbm aquí; merton en merton.js; luego OU, fBm, ...) se registra en
// MODULOS con dos funciones: conectar() una vez al abrir, y dibujar() cada vez
// que se muestra su sección o cambia el tamaño de la ventana.

const MODULOS = {};

// ---- navegación por hash ----
const SECCIONES = ["inicio", "gbm", "merton", "ou", "fbm", "manada", "opciones", "comparacion"];

function seccionActual() {
  const id = location.hash.replace("#", "") || "inicio";
  return SECCIONES.includes(id) ? id : "inicio";
}

function mostrarSeccion() {
  const actual = seccionActual();
  for (const s of SECCIONES) document.getElementById(s).hidden = s !== actual;
  document.querySelectorAll("#navegacion a").forEach((a) => {
    a.classList.toggle("activa", a.dataset.seccion === actual);
  });
  if (MODULOS[actual]) MODULOS[actual].dibujar();
  window.scrollTo(0, 0);
}

// ---- piezas comunes ----
const SEMILLA_BASE = 2026; // modo sustentación: todo reproducible con esta semilla
let semillaActual = SEMILLA_BASE; // una sola semilla para todo el aplicativo: mismas Z en todos los módulos

const $ = (id) => document.getElementById(id);
const pct = (x) => (x * 100).toFixed(1) + " %";
const formatoPrecio = (v) => (v >= 1000 ? v.toFixed(0) : v.toFixed(2));
const textoSemilla = () =>
  `Semilla ${semillaActual}${semillaActual === SEMILLA_BASE ? " (sustentación)" : ""}.`;

function fijarSlider(id, valor) {
  // si el valor calibrado se sale del rango del slider, el rango se amplía
  const el = $(id);
  if (valor < +el.min) el.min = Math.floor(valor * 10) / 10;
  if (valor > +el.max) el.max = Math.ceil(valor * 10) / 10;
  el.value = valor;
}

// resumen de calidad de los datos (reglas del taller). Las copias guardadas
// antes de nov 2026 no traen "calidad": se muestra lo que haya.
function resumenCalidad(datos) {
  const c = datos.calidad;
  if (!c) return "calidad: sin información (copia guardada de una versión anterior)";
  const d = c.descartes;
  const totalDescartes = d.duplicados + d.faltantes + d.no_positivos;
  const detalle = totalDescartes
    ? `${totalDescartes} descartados (${d.duplicados} fechas repetidas, ${d.faltantes} faltantes, ` +
      `${d.no_positivos} no positivos)`
    : "ningún dato descartado";
  return `${c.n_validos} precios válidos de ${c.n_recibidos} recibidos · ${detalle} · ` +
    `consultado ${c.consultado} · yfinance ${c.versiones.yfinance}, pandas ${c.versiones.pandas}`;
}

// encabezado común de los paneles de calibración: serie, fuente y calidad
function encabezadoDatos(datos) {
  return `<p><b>${datos.ticker}</b>, ${datos.fechas[0]} a ${datos.fechas[datos.fechas.length - 1]}
       · fuente: ${datos.fuente}<br>
       <small>${resumenCalidad(datos)}</small></p>`;
}

// Formulario "Datos de mercado" de un módulo. Espera en el HTML los ids
// <prefijo>-form, -ticker, -desde, -hasta, -cargar y -estado.
// alCargar(datos) calibra y dibuja; si lanza un error, se muestra en el estado.
function conectarFormularioDatos(prefijo, alCargar) {
  $(`${prefijo}-desde`).value = haceAnios(3);
  $(`${prefijo}-hasta`).value = fechaISO(new Date());
  $(`${prefijo}-form`).addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const ticker = $(`${prefijo}-ticker`).value.trim();
    const estado = $(`${prefijo}-estado`);
    const boton = $(`${prefijo}-cargar`);
    estado.className = "estado";
    estado.textContent = `Descargando ${ticker.toUpperCase()} desde Yahoo Finance…`;
    boton.disabled = true;
    try {
      const datos = await cargarHistorico(
        ticker, $(`${prefijo}-desde`).value, $(`${prefijo}-hasta`).value
      );
      semillaActual = SEMILLA_BASE;
      alCargar(datos);
      estado.className = datos.aviso ? "estado aviso" : "estado";
      estado.textContent = datos.aviso
        ? datos.aviso
        : `${datos.precios.length} precios de cierre cargados. Los sliders quedaron en los ` +
          `valores calibrados; muévelos para ver qué cambia.`;
    } catch (e) {
      estado.className = "estado error";
      estado.textContent = e.message;
    } finally {
      boton.disabled = false;
    }
  });
}

// lectura común del abanico: solo números que salen de la simulación misma
function lecturaAbanico(caminos, s0, dias, n, origen) {
  const finales = caminos.map((c) => c[c.length - 1]).sort((a, b) => a - b);
  const p = (q) => formatoPrecio(percentil(finales, q)); // mismo cálculo que la banda
  const pPerdida = finales.filter((v) => v < s0).length / finales.length;
  return (
    `${origen}: a ${dias} días, el 90 % central de los ${n} escenarios termina entre ` +
    `${p(0.05)} y ${p(0.95)}, con mediana ${p(0.5)}. ` +
    `En el ${(pPerdida * 100).toFixed(0)} % de los escenarios el precio termina por debajo del inicial.`
  );
}

// ---- módulo GBM ----
const EJEMPLO_GBM = { s0: 100, mu: 0.08, sigma: 0.25 };
let mercadoGBM = null; // { datos, cal } cuando hay una serie cargada

function leerControlesGBM() {
  const mu = parseFloat($("gbm-mu").value);
  const sigma = parseFloat($("gbm-sigma").value);
  const dias = parseInt($("gbm-dias").value, 10);
  const n = parseInt($("gbm-n").value, 10);
  $("gbm-mu-out").textContent = pct(mu);
  $("gbm-sigma-out").textContent = pct(sigma);
  $("gbm-dias-out").textContent = dias + " días";
  $("gbm-n-out").textContent = String(n);
  return { mu, sigma, dias, n };
}

function simularYDibujarGBM() {
  const { mu, sigma, dias, n } = leerControlesGBM();
  const s0 = mercadoGBM ? mercadoGBM.cal.s0 : EJEMPLO_GBM.s0;
  const Z = normalesComunes(semillaActual, n, dias);
  const caminos = simularGBM({ s0, mu, sigma }, Z);

  // se muestra el último año de historia real antes del abanico
  const opciones = { formato: formatoPrecio };
  if (mercadoGBM) {
    const { precios, fechas } = mercadoGBM.datos;
    opciones.historico = precios.slice(-252);
    opciones.fechasHistorico = fechas.slice(-252);
  }
  dibujarAbanico($("gbm-canvas"), caminos, opciones);

  const origen = mercadoGBM
    ? `Partiendo del último cierre de ${mercadoGBM.datos.ticker} (${formatoPrecio(s0)})`
    : `Partiendo de ${s0} (ejemplo)`;
  $("gbm-lectura").textContent = `${lecturaAbanico(caminos, s0, dias, n, origen)} ${textoSemilla()}`;
}

function mostrarCalibracionGBM({ datos, cal }) {
  // el cálculo paso a paso, en texto plano, igual que en el taller
  $("gbm-calibracion").innerHTML = `
    ${encabezadoDatos(datos)}
    <ul>
      <li>n = ${cal.nRetornos} log-retornos diarios, r = ln(S<sub>t</sub> / S<sub>t−1</sub>)</li>
      <li>media diaria x̄ = ${cal.media.toFixed(5)} &nbsp;·&nbsp; desviación diaria s = ${cal.s.toFixed(5)}</li>
      <li>σ̂ = s · √252 = ${pct(cal.sigma)}</li>
      <li>μ̂ = 252 · x̄ + σ̂²/2 = ${pct(cal.mu)}</li>
      <li>S₀ = último cierre = ${cal.s0.toFixed(2)}</li>
    </ul>`;
  $("gbm-calibracion").hidden = false;
}

function modoSustentacionGBM() {
  semillaActual = SEMILLA_BASE;
  const base = mercadoGBM ? mercadoGBM.cal : EJEMPLO_GBM;
  fijarSlider("gbm-mu", base.mu);
  fijarSlider("gbm-sigma", base.sigma);
  $("gbm-dias").value = 252;
  $("gbm-n").value = 200;
  simularYDibujarGBM();
}

MODULOS.gbm = {
  dibujar: simularYDibujarGBM,
  conectar() {
    conectarFormularioDatos("gbm", (datos) => {
      const cal = calibrarGBM(datos.precios);
      mercadoGBM = { datos, cal };
      fijarSlider("gbm-mu", cal.mu);
      fijarSlider("gbm-sigma", cal.sigma);
      mostrarCalibracionGBM(mercadoGBM);
      simularYDibujarGBM();
    });
    for (const id of ["gbm-mu", "gbm-sigma", "gbm-dias", "gbm-n"]) {
      $(id).addEventListener("input", simularYDibujarGBM);
    }
    $("gbm-semilla").addEventListener("click", () => {
      semillaActual = Math.floor(Math.random() * 100000);
      simularYDibujarGBM();
    });
    $("gbm-reiniciar").addEventListener("click", modoSustentacionGBM);
  },
};

// ---- arranque ----
// Los <script> van al final del body: DOMContentLoaded llega cuando ya se
// cargaron todos los módulos (también los que están en otros archivos).
document.addEventListener("DOMContentLoaded", () => {
  for (const m of Object.values(MODULOS)) m.conectar();
  window.addEventListener("hashchange", mostrarSeccion);
  window.addEventListener("resize", () => {
    const m = MODULOS[seccionActual()];
    if (m) m.dibujar();
  });
  mostrarSeccion();
});
