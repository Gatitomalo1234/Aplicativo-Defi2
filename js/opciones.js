// opciones.js — módulo 6: opciones reales (de modelar a decidir).
// Como lo presentaron los compañeros del curso: árbol binomial de Cox, Ross y Rubinstein
// (Venegas cap. 69) para una opción de abandono, más expansión y contracción.
// Arranca en el caso de la presentación (Venegas págs. 811–813). La σ se puede tomar de
// una empresa comparable elegida en «Toma de datos». Cálculo: arbolOpcionReal (modelos.js).

const CASO_PRESENTACION = {
  S0: 90, I0: 90, sigma: Math.log(2), r: Math.log(4 / 3), T: 3, n: 3, // u = 2, d = 0.5, e^r = 4/3
  V: 60, alfa: 0.5, Kexp: 40, gamma: 0.3, A: 25,
};
const PARAMS_OPCION = ["S0", "I0", "sigma", "r", "T", "n", "V", "alfa", "Kexp", "gamma", "A"];

let tipoOpcion = "abandono";
let comparable = null; // { datos, sigma } si la σ viene de una empresa comparable

const fmt2 = (v) => v.toFixed(2);

function leerOpciones() {
  const p = { tipo: tipoOpcion };
  for (const id of PARAMS_OPCION) p[id] = parseFloat($(`opciones-${id}`).value);
  const salida = {
    S0: fmt2(p.S0), I0: fmt2(p.I0), sigma: pct(p.sigma), r: pct(p.r), T: `${p.T} ${p.T === 1 ? "año" : "años"}`,
    n: String(p.n), V: fmt2(p.V), alfa: `${(p.alfa * 100).toFixed(0)} %`, Kexp: fmt2(p.Kexp),
    gamma: `${(p.gamma * 100).toFixed(0)} %`, A: fmt2(p.A),
  };
  for (const id of PARAMS_OPCION) $(`opciones-${id}-out`).textContent = salida[id];
  actualizarRangos();
  return p;
}

// el primer nodo (en el tiempo) donde conviene ejercer, explicado como en la presentación
function nodoClave(arbol, p) {
  const accion = TIPOS_OPCION[p.tipo].nombre.toLowerCase();
  const verbo = { abandono: "se abandona", expansion: "se amplía", contraccion: "se reduce" }[p.tipo];
  const n = arbol.nodos.length - 1;
  for (let t = 0; t <= n; t++) {
    const j = arbol.nodos[t].findIndex((x) => x.ejerce);
    if (j === -1) continue;
    const nodo = arbol.nodos[t][j];
    const seguir = t < n
      ? `e<sup>−rΔt</sup>[q·C<sub>u</sub> + (1 − q)·C<sub>d</sub>] = ${fmt2(arbol.fd)}·[${arbol.q.toFixed(3)}·${fmt2(arbol.nodos[t + 1][j].C)} + ${(1 - arbol.q).toFixed(3)}·${fmt2(arbol.nodos[t + 1][j + 1].C)}] = <b>${fmt2(nodo.continuar)}</b>`
      : `seguir sin ejercer, el proyecto vale S = <b>${fmt2(nodo.continuar)}</b>`;
    return `<p class="etiqueta">Nodo clave: t = ${t}, S = ${fmt2(nodo.S)}</p>
      <p>Continuar: ${seguir}</p>
      <p>Ejercer la opción de ${accion}: E = <b>${fmt2(nodo.E)}</b></p>
      <p class="decision">${fmt2(nodo.E)} &gt; ${fmt2(nodo.continuar)} ⟹ ${verbo} en t = ${t}</p>`;
  }
  return `<p class="etiqueta">Ningún nodo</p><p>Con estos parámetros nunca conviene ejercer: la opción vale c = 0 y el VPN modificado es igual al estático.</p>`;
}

function recalcularOpciones() {
  const p = leerOpciones();
  let arbol;
  try {
    arbol = arbolOpcionReal(p);
  } catch (e) {
    $("opciones-clave").innerHTML = `<p class="estado error">${e.message}</p>`;
    $("opciones-fichas").innerHTML = "";
    pintarKPI("opciones", { titulo: "Valor de la opción c", nota: "árbol no válido", valor: "—", chips: [] });
    const lienzo = $("opciones-arbol");
    lienzo.getContext("2d").clearRect(0, 0, lienzo.width, lienzo.height);
    return;
  }
  const tipo = TIPOS_OPCION[p.tipo];
  dibujarArbol($("opciones-arbol"), arbol, tipo.accion);
  $("opciones-nota-arbol").textContent = `opción de ${tipo.nombre.toLowerCase()} · Δt = ${fmt2(arbol.dt)} años · ${p.n} pasos`;
  $("opciones-clave").innerHTML = nodoClave(arbol, p);
  pintarFichas("opciones", [
    { etiqueta: "u", valor: arbol.u.toFixed(3), nota: "e^(σ√Δt)" },
    { etiqueta: "d", valor: arbol.d.toFixed(3), nota: "1/u" },
    { etiqueta: "q", valor: arbol.q.toFixed(3), nota: "neutral al riesgo" },
    { etiqueta: "e^(−rΔt)", valor: arbol.fd.toFixed(3), nota: "factor de descuento" },
  ]);
  pintarKPI("opciones", {
    titulo: "Valor de la opción c", nota: `${tipo.nombre.toLowerCase()} · c = C₀ − S₀`, valor: fmt2(arbol.c),
    chips: [["VPN estático", fmt2(arbol.vpnEstatico)], ["C₀", fmt2(arbol.C0)], ["VPN modificado", fmt2(arbol.vpnModificado)]],
  });
  $("opciones-pasos").innerHTML = filasPasos([
    ["Δt = T/n", `${fmt2(arbol.dt)} años`],
    ["u = e<sup>σ√Δt</sup> · d = 1/u", `${arbol.u.toFixed(4)} · ${arbol.d.toFixed(4)}`],
    ["q = (e<sup>rΔt</sup> − d)/(u − d)", arbol.q.toFixed(4)],
    ["C<sub>0</sub> (inducción hacia atrás)", fmt2(arbol.C0)],
    ["VPN estático = S<sub>0</sub> − I<sub>0</sub>", fmt2(arbol.vpnEstatico)],
    ["c = C<sub>0</sub> − S<sub>0</sub>", fmt2(arbol.c)],
    ["VPN modificado = VPN estático + c", fmt2(arbol.vpnModificado)],
  ]);
  dibujarParadoja(p);
}

// c contra σ con lo demás fijo. Solo donde el árbol es válido: q en (0, 1), es decir σ > r·√Δt.
function dibujarParadoja(p) {
  const etiquetas = [], valores = [];
  let actual = 0, mejor = Infinity;
  for (let s = 0.02; s <= 1.5001; s += 0.02) {
    try {
      const c = arbolOpcionReal({ ...p, sigma: s, n: Math.min(p.n, 60) }).c;
      etiquetas.push(`σ ${(s * 100).toFixed(0)} %`);
      valores.push(c);
      if (Math.abs(s - p.sigma) < mejor) { mejor = Math.abs(s - p.sigma); actual = valores.length - 1; }
    } catch { /* σ demasiado baja para esta r: árbol no válido */ }
  }
  if (valores.length > 1) dibujarLinea($("opciones-paradoja"), etiquetas, valores, fmt2, null, { marcas: new Set([actual]) });
}

function elegirTipo(tipo) {
  tipoOpcion = tipo;
  document.querySelectorAll("#opciones-tipo button").forEach((b) => b.classList.toggle("activo", b.dataset.tipo === tipo));
  document.querySelectorAll("#opciones .param-tipo").forEach((d) => { d.hidden = d.dataset.paraTipo !== tipo; });
  recalcularOpciones();
}

function fijarCaso() {
  for (const id of PARAMS_OPCION) {
    if (id === "sigma" && comparable) continue; // la σ del comparable se conserva
    fijarSlider(`opciones-${id}`, CASO_PRESENTACION[id]);
  }
}

MODULOS.opciones = {
  dibujar: recalcularOpciones,
  conectar() {
    registrarDatos("opciones", (datos) => {
      const cal = calibrarGBM(datos.precios);
      comparable = { datos, sigma: cal.sigma };
      fijarSlider("opciones-sigma", cal.sigma);
      $("opciones-sigma-info").textContent =
        `σ de ${datos.ticker}: s · √252 = ${pct(cal.sigma)} (${cal.nRetornos} log-retornos). Se usa como σ del proyecto.`;
      $("opciones-sigma-info").hidden = false;
      recalcularOpciones();
    }, () => {
      comparable = null;
      fijarSlider("opciones-sigma", CASO_PRESENTACION.sigma);
      $("opciones-sigma-info").hidden = true;
      recalcularOpciones();
    });
    for (const id of PARAMS_OPCION) $(`opciones-${id}`).addEventListener("input", recalcularOpciones);
    $("opciones-tipo").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-tipo]");
      if (b) elegirTipo(b.dataset.tipo);
    });
    $("opciones-caso").addEventListener("click", () => {
      if (comparable) soltarSerie("opciones"); // el caso usa su propia σ = ln 2
      fijarCaso();
      elegirTipo("abandono");
    });
  },
};
