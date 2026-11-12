// app.js — navegación, piezas comunes de los módulos y el módulo GBM.
// Cada módulo (gbm aquí; merton en merton.js; luego OU, fBm, ...) se registra en
// MODULOS con dos funciones: conectar() una vez al abrir, y dibujar() cada vez
// que se muestra su sección o cambia el tamaño de la ventana.

const MODULOS = {};

// ---- navegación por hash ----
const SECCIONES = ["inicio", "datos", "gbm", "merton", "ou", "fbm", "manada", "opciones", "comparacion"];

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
  refrescarRiel();
  actualizarRangos();
  window.scrollTo(0, 0);
}

// ---- columna de iconos (riel): salta a una parte del módulo visible ----
// Las partes se marcan en el HTML con data-parte="ecuacion|datos|calibracion|simulador|explica".
// No se usan enlaces #, porque el # ya se usa para navegar entre módulos.
function parteVisible(nombre) {
  const el = document.getElementById(seccionActual()).querySelector(`[data-parte="${nombre}"]`);
  return el && !el.hidden ? el : null;
}

function refrescarRiel() {
  const seccion = document.getElementById(seccionActual());
  $("riel").hidden = !seccion.querySelector("[data-parte]");
  document.querySelectorAll("#riel button").forEach((b) => {
    b.classList.toggle("inactivo", !parteVisible(b.dataset.parte));
  });
}

// Sliders: la parte recorrida del riel se pinta con el acento (variable CSS --pct).
// Se llama después de cada cambio, también cuando un valor se fija desde el código.
function actualizarRangos() {
  document.querySelectorAll('input[type="range"]').forEach((el) => {
    const min = +el.min || 0, max = +el.max || 100;
    el.style.setProperty("--pct", `${((+el.value - min) / (max - min || 1)) * 100}%`);
  });
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
  const versiones = c.versiones ? ` · yfinance ${c.versiones.yfinance}, pandas ${c.versiones.pandas}` : "";
  return `${c.n_validos} precios válidos de ${c.n_recibidos} recibidos · ${detalle} · ` +
    `consultado ${c.consultado}${versiones}`;
}

// encabezado común de los paneles de calibración: serie, fuente y calidad
function encabezadoDatos(datos) {
  return `<p><b>${datos.ticker}</b>, ${datos.fechas[0]} a ${datos.fechas[datos.fechas.length - 1]}
       · fuente: ${datos.fuente}<br>
       <small>${resumenCalidad(datos)}</small></p>`;
}

// ---- serie en uso de cada módulo (los datos se eligen en «Toma de datos») ----
// Cada módulo registra cómo calibrarse con una serie: registrarDatos(prefijo, alCargar).
// La elección se recuerda en el navegador (localStorage): al reabrir la página, cada
// módulo vuelve a cargar su serie desde la copia guardada en datos/cache/, sin internet.
const CARGADORES = {};      // prefijo -> alCargar(datos)
const SOLTADORES = {};      // prefijo -> alSoltar(): vuelve a los parámetros de ejemplo
const SERIES_EN_USO = {};   // prefijo -> datos de la serie que está usando
const NOMBRES_MODULO = { gbm: "GBM", merton: "Merton", ou: "OU", fbm: "fBm", opciones: "Opciones" }; // reciben una serie
const NOMBRE_MANADA = "Manada"; // recibe una canasta (varias series)

// Una canasta es un grupo de series para el módulo de manada.
function construirCanasta(nombre, series) {
  return {
    tipo: "canasta", nombre, ticker: nombre, series,
    tickers: series.map((s) => s.ticker),
    archivos: series.map((s) => s.archivo).filter(Boolean),
  };
}
// ¿Esta serie guardada (archivo) la usa el módulo? (serie sola o dentro de una canasta)
const usaArchivo = (d, archivo) => d && (d.archivo === archivo || (d.archivos || []).includes(archivo));
const CLAVE_SELECCION = "romper-mercado.series-en-uso";

function leerSeleccion() {
  try { return JSON.parse(localStorage.getItem(CLAVE_SELECCION)) || {}; } catch { return {}; }
}
function guardarSeleccion(prefijo, archivo) {
  try {
    const sel = leerSeleccion();
    if (archivo) sel[prefijo] = archivo; else delete sel[prefijo];
    localStorage.setItem(CLAVE_SELECCION, JSON.stringify(sel));
  } catch { /* navegador sin almacenamiento: la elección dura solo esta sesión */ }
}

function registrarDatos(prefijo, alCargar, alSoltar) {
  CARGADORES[prefijo] = alCargar;
  SOLTADORES[prefijo] = alSoltar;
  pintarSerieEnUso(prefijo);
  const quitar = $(`${prefijo}-quitar`);
  if (quitar) quitar.addEventListener("click", () => soltarSerie(prefijo));
}

// línea "Serie: ..." de la tarjeta de datos del módulo
function pintarSerieEnUso(prefijo) {
  const caja = $(`${prefijo}-serie`);
  if (!caja) return;
  const d = SERIES_EN_USO[prefijo];
  if (d && d.tipo === "canasta") {
    caja.innerHTML = `<b>${d.nombre}</b><span>${d.tickers.join(", ")}</span><span>${d.tickers.length} acciones</span>`;
  } else {
    caja.innerHTML = d
      ? `<b>${d.ticker}</b><span>${d.fechas[0]} → ${d.fechas[d.fechas.length - 1]}</span>
         <span>${d.precios.length} precios</span><span>${d.fuente}</span>`
      : prefijo === "manada"
        ? `<b>Sin canasta</b><span>elige una en Toma de datos</span>`
      : prefijo === "opciones"
        ? `<b>Sin comparable</b><span>σ fijada a mano</span>`
        : `<b>Sin serie</b><span>el simulador usa parámetros de ejemplo</span>`;
  }
  const quitar = $(`${prefijo}-quitar`);
  if (quitar) quitar.hidden = !d;
}

// Manda una serie a un módulo: calibra, dibuja y recuerda la elección.
function usarSerieEn(prefijo, datos, { restaurada = false } = {}) {
  const estado = $(`${prefijo}-estado`);
  if (datos.tipo !== "canasta" && datos.precios.length < MINIMO_CALIBRAR) {
    throw new Error(`${datos.ticker} tiene ${datos.precios.length} precios; para calibrar se necesitan al menos ${MINIMO_CALIBRAR}.`);
  }
  semillaActual = SEMILLA_BASE;
  CARGADORES[prefijo](datos); // si la calibración falla, lanza el error y no se guarda nada
  SERIES_EN_USO[prefijo] = datos;
  if (datos.tipo === "canasta") guardarSeleccion(prefijo, { nombre: datos.nombre, archivos: datos.archivos });
  else if (datos.archivo) guardarSeleccion(prefijo, datos.archivo);
  pintarSerieEnUso(prefijo);
  refrescarRiel();
  actualizarRangos();
  estado.className = datos.aviso ? "estado aviso" : "estado";
  estado.textContent = datos.aviso
    ? datos.aviso
    : restaurada && datos.tipo === "canasta"
      ? "Canasta restaurada desde las copias guardadas (sin internet)."
      : restaurada
      ? `Serie restaurada desde la copia guardada (consultada ${datos.calidad?.consultado || "antes"}). Sliders en los valores calibrados.`
      : datos.tipo === "canasta"
        ? `Canasta cargada desde Toma de datos. Mueve la ventana de fechas para ver cómo cambian las pruebas.`
        : `Serie cargada desde Toma de datos. Los sliders quedaron en los valores calibrados; muévelos para ver qué cambia.`;
}

// Deja de usar la serie: el módulo vuelve a los parámetros de ejemplo
// (OU: el ejercicio del taller) y la elección se olvida.
function soltarSerie(prefijo) {
  delete SERIES_EN_USO[prefijo];
  guardarSeleccion(prefijo, null);
  semillaActual = SEMILLA_BASE;
  if (SOLTADORES[prefijo]) SOLTADORES[prefijo]();
  pintarSerieEnUso(prefijo);
  refrescarRiel();
  actualizarRangos();
  const estado = $(`${prefijo}-estado`);
  if (estado) {
    estado.className = "estado";
    estado.textContent = prefijo === "ou"
      ? "Sin serie: volvió al ejercicio 3 del taller (liquidez en millones de USD)."
      : prefijo === "opciones"
        ? "Sin comparable: σ volvió a la del caso de la presentación (ln 2 ≈ 69.3 %)."
      : prefijo === "manada"
        ? "Sin canasta: elige una en Toma de datos."
        : "Sin serie: el simulador volvió a los parámetros de ejemplo.";
  }
}

// Al abrir la página: cada módulo recupera la serie que tenía elegida.
async function restaurarSelecciones() {
  for (const [prefijo, eleccion] of Object.entries(leerSeleccion())) {
    if (!CARGADORES[prefijo]) continue;
    try {
      const datos = typeof eleccion === "string"
        ? await cargarGuardado(eleccion)
        : construirCanasta(eleccion.nombre, await Promise.all(eleccion.archivos.map(cargarGuardado)));
      usarSerieEn(prefijo, datos, { restaurada: true });
    } catch (e) {
      guardarSeleccion(prefijo, null); // la copia ya no existe o no hay servidor
      const estado = $(`${prefijo}-estado`);
      if (estado) { estado.className = "estado aviso"; estado.textContent = `No se pudo restaurar la serie anterior: ${e.message}`; }
    }
  }
  const m = MODULOS[seccionActual()];
  if (m) m.dibujar();
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

// Fichas bajo el gráfico: las cifras clave de la lectura, grandes.
// items: [{ etiqueta, valor, nota? }]
function pintarFichas(prefijo, items) {
  const caja = $(`${prefijo}-fichas`);
  if (!caja) return;
  caja.innerHTML = items.map((f) => `
    <div class="ficha"><span>${f.etiqueta}</span><b>${f.valor}</b>${f.nota ? `<small>${f.nota}</small>` : ""}</div>`).join("");
}

// fichas comunes de un abanico de precios: p5, mediana, p95 y probabilidad de pérdida
function fichasDe(caminos, s0, formato = formatoPrecio) {
  const finales = caminos.map((c) => c[c.length - 1]).sort((a, b) => a - b);
  const pPerdida = finales.filter((v) => v < s0).length / finales.length;
  return [
    { etiqueta: "p5", valor: formato(percentil(finales, 0.05)), nota: "escenario malo" },
    { etiqueta: "mediana", valor: formato(percentil(finales, 0.5)), nota: "escenario central" },
    { etiqueta: "p95", valor: formato(percentil(finales, 0.95)), nota: "escenario bueno" },
    { etiqueta: "termina abajo", valor: `${(pPerdida * 100).toFixed(0)} %`, nota: "del valor inicial" },
  ];
}
const fichasAbanico = (prefijo, caminos, s0) => pintarFichas(prefijo, fichasDe(caminos, s0));

// Tarjeta de cifra grande (como el saldo de una app bancaria).
// { titulo, valor, nota, chips: [[símbolo, valor]] }
function pintarKPI(prefijo, k) {
  $(`${prefijo}-kpi`).innerHTML = `
    <div class="tarjeta-cabeza"><h2>${k.titulo}</h2><span class="nota-cabeza">${k.nota}</span></div>
    <p class="kpi-valor">${k.valor}</p>
    <div class="chips">${k.chips.map(([sim, val]) => {
      // símbolos (una letra o griego) en cursiva matemática; palabras en letra normal
      const esSimbolo = /^[A-Za-z]$|[\u0370-\u03FF]/.test(sim.replace(/<[^>]+>/g, "").replace(/\u0302/g, ""));
      return `<span class="chip">${esSimbolo ? `<i>${sim}</i>` : `<span class="chip-texto">${sim}</span>`}${val}</span>`;
    }).join("")}</div>`;
}

// ---- módulo GBM ----
const EJEMPLO_GBM = { s0: 100, mu: 0.08, sigma: 0.25 };
let mercadoGBM = null; // { datos, cal } cuando hay una serie cargada

function leerControlesGBM() {
  actualizarRangos(); // relleno de los sliders, también si el valor se fijó desde el código
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
  fichasAbanico("gbm", caminos, s0);
  if (!mercadoGBM) {
    pintarKPI("gbm", {
      titulo: "Precio inicial", nota: "parámetros de ejemplo", valor: formatoPrecio(s0),
      chips: [["μ", pct(mu)], ["σ", pct(sigma)]],
    });
  }
}

// filas de un cálculo paso a paso: [[paso, valor]]
const filasPasos = (filas) =>
  `<ol class="pasos">${filas.map(([paso, valor]) => `<li><span>${paso}</span><b>${valor}</b></li>`).join("")}</ol>`;

function mostrarCalibracionGBM({ datos, cal }) {
  // el cálculo paso a paso, igual que en el taller
  $("gbm-calibracion").innerHTML = `
    <div class="tarjeta-cabeza"><h2>Calibración paso a paso</h2><span class="nota-cabeza">método del taller de valoración</span></div>
    ${encabezadoDatos(datos)}
    ${filasPasos([
      ["n log-retornos diarios, r = ln(S<sub>t</sub> / S<sub>t−1</sub>)", cal.nRetornos],
      ["media diaria x̄", cal.media.toFixed(5)],
      ["desviación diaria s", cal.s.toFixed(5)],
      ["σ̂ = s · √252", pct(cal.sigma)],
      ["μ̂ = 252 · x̄ + σ̂²/2", pct(cal.mu)],
      ["S₀ = último cierre", cal.s0.toFixed(2)],
    ])}`;
  $("gbm-calibracion").hidden = false;
  pintarKPI("gbm", {
    titulo: `Último cierre · ${datos.ticker}`, nota: datos.fechas[datos.fechas.length - 1],
    valor: formatoPrecio(cal.s0),
    chips: [["μ̂", pct(cal.mu)], ["σ̂", pct(cal.sigma)], ["n", cal.nRetornos]],
  });
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
    registrarDatos("gbm", (datos) => {
      const cal = calibrarGBM(datos.precios);
      mercadoGBM = { datos, cal };
      fijarSlider("gbm-mu", cal.mu);
      fijarSlider("gbm-sigma", cal.sigma);
      mostrarCalibracionGBM(mercadoGBM);
      simularYDibujarGBM();
    }, () => {
      mercadoGBM = null;
      $("gbm-calibracion").hidden = true;
      modoSustentacionGBM(); // parámetros de ejemplo y semilla 2026
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

// ---- entrada al aplicativo (solo al abrir en Inicio) ----
// Primero se ve solo la tarjeta principal; con un clic, la rueda, deslizar o el teclado
// aparecen la barra y las demás tarjetas (la animación está en estilos.css).
function entrarAplicativo() {
  if (!document.body.classList.contains("portada")) return;
  window.scrollTo(0, 0);
  document.body.classList.add("entrando");
  document.body.classList.remove("portada");
  setTimeout(() => document.body.classList.remove("entrando"), 900);
}

// Cuánto subir la barra (escondida) para que el hero quede a 14 px del borde de arriba.
// Se mide de nuevo cuando cargan las fuentes y al cambiar el tamaño de la ventana, porque
// el alto de la barra cambia con la fuente (Geist llega después del primer dibujo).
function ajustarPortada() {
  if (!document.body.classList.contains("portada")) return;
  const barra = document.querySelector(".barra");
  document.documentElement.classList.add("sin-animar");
  const alto = barra.offsetHeight + parseFloat(getComputedStyle(barra).marginBottom) - 14;
  document.documentElement.style.setProperty("--alto-barra", `${alto}px`);
  void document.body.offsetHeight; // aplica el estilo antes de reactivar la animación
  // el navegador «ancla» el desplazamiento cuando la barra cambia de alto: se vuelve arriba
  window.scrollTo(0, 0);
  requestAnimationFrame(() => document.documentElement.classList.remove("sin-animar"));
}

function prepararEntrada() {
  if (seccionActual() !== "inicio") return; // abierto directo en un módulo: sin transición
  document.body.classList.add("portada");
  ajustarPortada();
  if (document.fonts) document.fonts.ready.then(ajustarPortada);
  window.addEventListener("resize", ajustarPortada);

  let toqueY = null;
  const alDeslizar = (ev) => { if (ev.deltaY > 0) entrarAplicativo(); };
  const alTocar = (ev) => { toqueY = ev.touches[0].clientY; };
  const alMover = (ev) => { if (toqueY !== null && toqueY - ev.touches[0].clientY > 30) entrarAplicativo(); };
  const alTeclear = (ev) => {
    if (["ArrowDown", "PageDown", " ", "Enter"].includes(ev.key)) { ev.preventDefault(); entrarAplicativo(); }
  };
  window.addEventListener("wheel", alDeslizar, { passive: true });
  window.addEventListener("touchstart", alTocar, { passive: true });
  window.addEventListener("touchmove", alMover, { passive: true });
  window.addEventListener("keydown", alTeclear);
  document.querySelector(".hero-inicio").addEventListener("click", entrarAplicativo);
  // si se navega a otra sección (p. ej. con atrás), se entra sin animación
  window.addEventListener("hashchange", () => document.body.classList.remove("portada", "entrando"));
  const limpiar = new MutationObserver(() => {
    if (document.body.classList.contains("portada")) return;
    window.removeEventListener("wheel", alDeslizar);
    window.removeEventListener("touchstart", alTocar);
    window.removeEventListener("touchmove", alMover);
    window.removeEventListener("keydown", alTeclear);
    window.removeEventListener("resize", ajustarPortada);
    limpiar.disconnect();
  });
  limpiar.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

// ---- arranque ----
// Los <script> van al final del body: DOMContentLoaded llega cuando ya se
// cargaron todos los módulos (también los que están en otros archivos).
document.addEventListener("DOMContentLoaded", () => {
  prepararEntrada();
  for (const m of Object.values(MODULOS)) m.conectar();
  restaurarSelecciones();
  window.addEventListener("hashchange", mostrarSeccion);
  document.querySelectorAll("#riel button").forEach((b) => {
    b.addEventListener("click", () => {
      const el = parteVisible(b.dataset.parte);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.matches('input[type="range"]')) actualizarRangos();
  });
  // los gráficos (canvas) usan Geist: se redibujan cuando las fuentes terminan de cargar
  if (document.fonts) {
    document.fonts.ready.then(() => {
      const m = MODULOS[seccionActual()];
      if (m) m.dibujar();
    });
  }
  window.addEventListener("resize", () => {
    const m = MODULOS[seccionActual()];
    if (m) m.dibujar();
  });
  mostrarSeccion();
});
