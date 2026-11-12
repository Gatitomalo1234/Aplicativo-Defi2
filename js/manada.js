// manada.js — módulo 5: comportamiento en manada (rompe la independencia de los agentes).
// Como lo presentaron los compañeros del curso: las medidas CSSD (Christie y Huang, 1995)
// y CSAD (Chang, Cheng y Khorana, 2000) sobre una canasta de acciones reales, en su forma
// estándar. No simula: mide. Lo que se mueve es la ventana de fechas y la cola de CSSD.
// Cálculos en datos.js (alinearCanasta, calibrarManada, regresionNW).

// Canastas recomendadas (se eligen en «Toma de datos»). Los «por qué» salen de correr
// las pruebas con estos datos (nov 2026, cola de 5 %, período completo).
const CANASTAS = [
  { id: "meme", nombre: "Acciones meme 2020-21", tickers: ["GME", "AMC", "BB", "NOK", "KOSS"],
    desde: "2020-06-01", hasta: "2021-06-30",
    porque: "Las acciones del episodio de GameStop. Período completo: γ̂₂ < 0 con p ≈ 0.06, al borde del 5 %.",
    ventanas: [["Dic 2020 – mar 2021", "2020-12-01", "2021-03-31"], ["Ene – feb 2021", "2021-01-01", "2021-02-28"]] },
  { id: "bancos", nombre: "Bancos EE. UU. 2006-09", tickers: ["JPM", "BAC", "C", "WFC", "GS", "MS"],
    desde: "2006-01-01", hasta: "2009-12-31",
    porque: "Seis bancos grandes en la crisis subprime. Período completo: γ̂₂ < 0 pero no significativo (p ≈ 0.35).",
    ventanas: [["Antes de la crisis", "2006-01-01", "2007-06-30"], ["Sep 2008 – mar 2009", "2008-09-01", "2009-03-31"]] },
  { id: "tech", nombre: "Tecnológicas EE. UU. · 5 años", tickers: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META"],
    anios: 5,
    porque: "Contraste sin un episodio de manada conocido: γ̂₂ > 0, no significativo.",
    ventanas: [] },
];

let mercadoManada = null; // { canasta, c: canasta alineada, cal: resultado en la ventana }

const fmtNum = (x, d = 3) => (Math.abs(x) < 1e-3 && x !== 0 ? x.toExponential(2) : x.toFixed(d));
const fmtP = (p) => (p < 0.001 ? "< 0.001" : p.toFixed(3));
const pTexto = (p) => (p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);
const coef = (r, i, d) => `${fmtNum(r.beta[i], d)} · t = ${r.t[i].toFixed(2)} · ${pTexto(r.p[i])}`;

// Lectura de cada prueba. Significativo = p < 5 %.
function veredictoCSAD(r) {
  const g = r.beta[2], p = r.p[2];
  if (g < 0 && p < 0.05) return { clase: "si", corto: "evidencia de manada", texto: "γ̂₂ < 0 y significativo: en los días extremos la dispersión crece menos de lo que predice un mercado sin manada. Hay evidencia de comportamiento en manada en esta ventana." };
  if (g > 0 && p < 0.05) return { clase: "no", corto: "sin manada", texto: "γ̂₂ > 0 y significativo: en los días extremos la dispersión crece más que proporcionalmente. Es lo contrario de la manada." };
  return { clase: "neutro", corto: "sin evidencia", texto: `γ̂₂ ${g < 0 ? "es negativo" : "es positivo"}, pero no es significativo (${pTexto(p)}): no hay evidencia estadística de manada en esta ventana.` };
}
function veredictoCSSD(r) {
  const lado = (i, nombre) => {
    const b = r.beta[i], p = r.p[i];
    if (b < 0 && p < 0.05) return `en las ${nombre} la dispersión baja (β̂ < 0, significativo): evidencia de manada`;
    if (b > 0 && p < 0.05) return `en las ${nombre} la dispersión sube (β̂ > 0, significativo): sin manada`;
    return `en las ${nombre} el cambio no es significativo (${pTexto(p)})`;
  };
  const hay = (r.beta[1] < 0 && r.p[1] < 0.05) || (r.beta[2] < 0 && r.p[2] < 0.05);
  return { clase: hay ? "si" : "neutro", texto: `${lado(1, "caídas extremas")}; ${lado(2, "subidas extremas")}.` };
}

function leerVentana() {
  const ini = $("manada-inicio"), fin = $("manada-fin");
  // la ventana nunca baja de DIAS_MIN_MANADA días
  if (+fin.value - +ini.value < DIAS_MIN_MANADA - 1) {
    if (document.activeElement === ini) ini.value = Math.max(0, +fin.value - DIAS_MIN_MANADA + 1);
    else fin.value = Math.min(+fin.max, +ini.value + DIAS_MIN_MANADA - 1);
    if (+fin.value - +ini.value < DIAS_MIN_MANADA - 1) ini.value = +fin.value - DIAS_MIN_MANADA + 1;
  }
  const { c } = mercadoManada;
  $("manada-inicio-out").textContent = c.fechas[+ini.value];
  $("manada-fin-out").textContent = c.fechas[+fin.value];
  $("manada-cola-out").textContent = `${$("manada-cola").value} %`;
  actualizarRangos();
  return { inicio: +ini.value, fin: +fin.value, cola: +$("manada-cola").value / 100 };
}

function recalcularManada() {
  if (!mercadoManada) return;
  try {
    mercadoManada.cal = calibrarManada(mercadoManada.c, leerVentana());
  } catch (e) {
    $("manada-estado").className = "estado error";
    $("manada-estado").textContent = e.message;
    return;
  }
  dibujarManada();
}

function pintarKPIManada() {
  if (!mercadoManada || !mercadoManada.cal) {
    pintarKPI("manada", { titulo: "Prueba CSAD · γ̂₂", nota: "sin canasta", valor: "—", chips: [["N", "—"]] });
    return;
  }
  const { cal, c } = mercadoManada;
  const v = veredictoCSAD(cal.csad);
  pintarKPI("manada", {
    titulo: "Prueba CSAD · γ̂₂", nota: v.corto, valor: fmtNum(cal.csad.beta[2]),
    chips: [["t", cal.csad.t[2].toFixed(2)], ["p", fmtP(cal.csad.p[2])], ["N", c.N]],
  });
}

function dibujarManada() {
  pintarKPIManada();
  if (!mercadoManada || !mercadoManada.cal) return;
  const { c, cal } = mercadoManada;
  const idx = [];
  for (let t = cal.inicio; t <= cal.fin; t++) idx.push(t);

  dibujarDispersionCSAD($("manada-dispersion"), idx.map((t) => c.rm[t]), idx.map((t) => c.csad[t]),
    cal.csad.beta, idx.map((t) => cal.extremos.has(t)));
  dibujarLinea($("manada-tiempo"), c.fechas, Array.from(c.csad), (v) => `${(v * 100).toFixed(1)} %`, null,
    { sombra: [cal.inicio, cal.fin], marcas: cal.extremos });

  let tMax = cal.inicio;
  for (const t of idx) if (Math.abs(c.rm[t]) > Math.abs(c.rm[tMax])) tMax = t;
  const csadMedio = idx.reduce((s, t) => s + c.csad[t], 0) / idx.length;
  pintarFichas("manada", [
    { etiqueta: "días en la ventana", valor: cal.dias, nota: `${c.fechas[cal.inicio]} → ${c.fechas[cal.fin]}` },
    { etiqueta: "CSAD promedio", valor: pct(csadMedio), nota: "dispersión típica de un día" },
    { etiqueta: "día más extremo", valor: pct(c.rm[tMax]), nota: c.fechas[tMax] },
    { etiqueta: "días extremos (CSSD)", valor: cal.nBaja + cal.nAlta, nota: `${cal.nBaja} caídas · ${cal.nAlta} subidas` },
  ]);

  const vA = veredictoCSAD(cal.csad), vS = veredictoCSSD(cal.cssd);
  $("manada-resultados-nota").textContent =
    `${c.fechas[cal.inicio]} → ${c.fechas[cal.fin]} · errores de Newey-West con L = ${cal.csad.L} rezagos`;
  $("manada-pruebas").innerHTML = `
    <div>
      <h3 class="sin-margen">CSAD · Chang, Cheng y Khorana (2000)</h3>
      ${filasPasos([
        ["días en la ventana · acciones en la canasta", `${cal.dias} · ${c.N}`],
        ["α̂ (dispersión base)", coef(cal.csad, 0, 4)],
        ["γ̂₁ (término |R<sub>m</sub>|)", coef(cal.csad, 1, 3)],
        ["γ̂₂ (término R<sub>m</sub>²)", coef(cal.csad, 2, 3)],
        ["R² de la regresión", cal.csad.r2.toFixed(3)],
      ])}
      <p class="veredicto ${vA.clase}">${vA.texto}</p>
    </div>
    <div>
      <h3 class="sin-margen">CSSD · Christie y Huang (1995)</h3>
      ${filasPasos([
        [`cola ${Math.round(cal.cola * 100)} %: días con R<sub>m</sub> ≤ ${pct(cal.qBaja)} y ≥ ${pct(cal.qAlta)}`, `${cal.nBaja} + ${cal.nAlta} días`],
        ["α̂ (dispersión en días normales)", coef(cal.cssd, 0, 4)],
        ["β̂<sub>L</sub> (días de caída extrema)", coef(cal.cssd, 1, 4)],
        ["β̂<sub>U</sub> (días de subida extrema)", coef(cal.cssd, 2, 4)],
        ["R² de la regresión", cal.cssd.r2.toFixed(3)],
      ])}
      <p class="veredicto ${vS.clase}">${vS.texto.charAt(0).toUpperCase() + vS.texto.slice(1)}</p>
    </div>`;
}

// atajos de ventana: los episodios de cada canasta recomendada, más «todo el período»
function pintarAtajos() {
  const def = CANASTAS.find((k) => k.nombre === mercadoManada.canasta.nombre);
  const ventanas = [["Todo el período", null, null], ...(def ? def.ventanas : [])];
  $("manada-atajos").innerHTML = ventanas.map(([nombre, d, h], i) =>
    `<button type="button" data-ventana="${i}" data-desde="${d || ""}" data-hasta="${h || ""}">${nombre}</button>`).join("");
}

function fijarVentana(desde, hasta) {
  const { c } = mercadoManada;
  let ini = desde ? c.fechas.findIndex((f) => f >= desde) : 0;
  let fin = hasta ? c.fechas.length - 1 - [...c.fechas].reverse().findIndex((f) => f <= hasta) : c.T - 1;
  if (ini < 0) ini = 0;
  if (fin < 0 || fin >= c.T) fin = c.T - 1;
  $("manada-inicio").value = ini;
  $("manada-fin").value = fin;
  recalcularManada();
}

MODULOS.manada = {
  dibujar() {
    if (mercadoManada) dibujarManada();
    else pintarKPIManada();
  },
  conectar() {
    registrarDatos("manada", (canasta) => {
      const c = alinearCanasta(canasta.series);
      if (c.T < DIAS_MIN_MANADA) throw new Error(`La canasta tiene ${c.T} días en común; se necesitan al menos ${DIAS_MIN_MANADA}.`);
      mercadoManada = { canasta, c, cal: null };
      for (const id of ["manada-inicio", "manada-fin"]) $(id).max = c.T - 1;
      $("manada-ventana-tarjeta").hidden = false;
      $("manada-resultados").hidden = false;
      pintarAtajos();
      fijarVentana(null, null);
    }, () => {
      mercadoManada = null;
      $("manada-ventana-tarjeta").hidden = true;
      $("manada-resultados").hidden = true;
      pintarKPIManada();
    });
    for (const id of ["manada-inicio", "manada-fin", "manada-cola"]) $(id).addEventListener("input", recalcularManada);
    $("manada-atajos").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-ventana]");
      if (b) fijarVentana(b.dataset.desde || null, b.dataset.hasta || null);
    });
    pintarKPIManada();
  },
};
