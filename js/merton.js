// merton.js — módulo 2: saltos de Merton (rompe la continuidad).
// Mismo patrón que el GBM (app.js), más:
// - λ arranca en 0: el modelo ES el GBM, con las mismas Z. Al subir λ aparecen
//   saltos y la banda se abre; la línea punteada es el GBM (λ = 0) con las mismas
//   Z, así que la distancia entre ambas es el riesgo de evento.
// - calibración por umbral con un slider c: se ve cómo cambian λ̂, μ̂J, σ̂J y σ̂
//   según qué tan grande tiene que ser un movimiento para contarlo como salto.

const EJEMPLO_MERTON = { s0: 100, mu: 0.08, sigma: 0.2, lambda: 0, muJ: -0.05, sigmaJ: 0.08 };
let mercadoMerton = null; // { datos, cal } cuando hay una serie cargada

const CONTROLES_MERTON = ["mu", "sigma", "lambda", "muJ", "sigmaJ", "dias", "n"];

function leerControlesMerton() {
  const v = (id) => parseFloat($(`merton-${id}`).value);
  const c = {
    mu: v("mu"), sigma: v("sigma"), lambda: v("lambda"), muJ: v("muJ"), sigmaJ: v("sigmaJ"),
    dias: parseInt($("merton-dias").value, 10), n: parseInt($("merton-n").value, 10),
  };
  $("merton-mu-out").textContent = pct(c.mu);
  $("merton-sigma-out").textContent = pct(c.sigma);
  $("merton-lambda-out").textContent = c.lambda.toFixed(1) + " al año";
  $("merton-muJ-out").textContent = pct(c.muJ);
  $("merton-sigmaJ-out").textContent = pct(c.sigmaJ);
  $("merton-dias-out").textContent = c.dias + " días";
  $("merton-n-out").textContent = String(c.n);
  return c;
}

function simularYDibujarMerton() {
  const p = leerControlesMerton();
  const s0 = mercadoMerton ? mercadoMerton.cal.s0 : EJEMPLO_MERTON.s0;
  const Z = normalesComunes(semillaActual, p.n, p.dias);
  const caminos = simularMerton({ s0, ...p }, Z);
  // referencia: el mismo modelo sin saltos (λ = 0) = GBM, con las MISMAS Z
  const sinSaltos = simularGBM({ s0, mu: p.mu, sigma: p.sigma }, Z);
  const ref = bandasDe(sinSaltos);

  const opciones = {
    formato: formatoPrecio,
    referencia: { p5: ref.p5, p95: ref.p95, nombre: "GBM λ = 0 (90 %)", corto: "GBM" },
  };
  if (mercadoMerton) {
    const { precios, fechas } = mercadoMerton.datos;
    const desde = Math.max(0, precios.length - 252);
    opciones.historico = precios.slice(desde);
    opciones.fechasHistorico = fechas.slice(desde);
    opciones.marcas = mercadoMerton.cal.saltos.map((s) => s.i - desde);
  }
  dibujarAbanico($("merton-canvas"), caminos, opciones);

  // lectura: solo números de la simulación
  const conSalto = caminos.filter((c) => c.nSaltos > 0).length / caminos.length;
  const promedioSaltos = caminos.reduce((a, c) => a + c.nSaltos, 0) / caminos.length;
  const ancho = (cs) => {
    const f = cs.map((c) => c[c.length - 1]).sort((a, b) => a - b);
    return percentil(f, 0.95) - percentil(f, 0.05);
  };
  const origen = mercadoMerton
    ? `Partiendo del último cierre de ${mercadoMerton.datos.ticker} (${formatoPrecio(s0)})`
    : `Partiendo de ${s0} (ejemplo)`;
  const saltos = p.lambda === 0
    ? "Con λ = 0 no hay saltos: el modelo es exactamente el GBM y las dos bandas coinciden."
    : `El ${(conSalto * 100).toFixed(0)} % de los escenarios tuvo al menos un salto ` +
      `(${promedioSaltos.toFixed(1)} en promedio; λ·T = ${(p.lambda * p.dias / 252).toFixed(1)}). ` +
      `Al final, la banda del 90 % mide ${formatoPrecio(ancho(caminos))} con saltos y ` +
      `${formatoPrecio(ancho(sinSaltos))} sin ellos, con las mismas Z.`;
  $("merton-lectura").textContent =
    `${lecturaAbanico(caminos, s0, p.dias, p.n, origen)} ${saltos} ${textoSemilla()}`;
}

function mostrarCalibracionMerton() {
  const { datos, cal } = mercadoMerton;
  const r = (x) => pct(x);
  const sinSaltos = cal.saltos.length === 0;
  $("merton-calibracion").innerHTML = `
    ${encabezadoDatos(datos)}
    <ul>
      <li>n = ${cal.nRetornos} log-retornos diarios (${cal.anios.toFixed(2)} años) ·
          media x̄ = ${cal.media.toFixed(5)} · desviación s = ${cal.s.toFixed(5)}</li>
      <li>umbral: un día es salto si |r − x̄| &gt; c · s = ${cal.c.toFixed(1)} · ${cal.s.toFixed(5)}
          = ${r(cal.corte)}</li>
      <li>saltos detectados: ${cal.saltos.length} → λ̂ = ${cal.saltos.length} / ${cal.anios.toFixed(2)}
          = ${cal.lambda.toFixed(2)} saltos por año</li>
      ${sinSaltos
        ? "<li>Sin saltos con este umbral: λ̂ = 0 y el modelo es el GBM.</li>"
        : `<li>tamaño del salto (log): μ̂J = media = ${r(cal.muJ)} · σ̂J = desviación = ${r(cal.sigmaJ)}</li>`}
      <li>σ̂ difusiva = desviación de los ${cal.nRetornos - cal.saltos.length} días sin salto · √252
          = ${r(cal.sigma)} &nbsp;(el GBM, que mezcla todo, ve σ = ${r(cal.sigmaTotal)})</li>
      <li>k̂ = e^(μ̂J + σ̂J²/2) − 1 = ${r(cal.k)} &nbsp;·&nbsp;
          μ̂ = 252 · x̄ + σ̂²/2 + λ̂ · (k̂ − μ̂J) = ${r(cal.mu)}</li>
      <li>S₀ = último cierre = ${cal.s0.toFixed(2)}</li>
    </ul>`;
  $("merton-calibracion").hidden = false;

  // histograma de retornos reales con el umbral
  $("merton-hist-caja").hidden = false;
  dibujarHistograma($("merton-hist"), cal.retornos, {
    umbralInf: cal.media - cal.corte, umbralSup: cal.media + cal.corte,
  });

  // tabla de días de salto: el equipo completa qué noticia hubo ese día
  $("merton-saltos").innerHTML = sinSaltos
    ? "<p>Con este umbral no se detecta ningún salto.</p>"
    : `<table>
        <thead><tr><th>Fecha</th><th>Log-retorno</th><th>¿Qué pasó ese día?</th></tr></thead>
        <tbody>${cal.saltos.map((s) => `
          <tr><td>${s.fecha}</td><td class="${s.r < 0 ? "negativo" : ""}">${r(s.r)}</td>
              <td><em>[completar: noticia o earnings]</em></td></tr>`).join("")}
        </tbody></table>`;
}

function calibrarYFijarMerton() {
  const { datos } = mercadoMerton;
  const c = parseFloat($("merton-umbral").value);
  $("merton-umbral-out").textContent = c.toFixed(1) + " s";
  const cal = calibrarMerton(datos.precios, datos.fechas, c);
  mercadoMerton.cal = cal;
  for (const id of ["mu", "sigma", "lambda", "muJ", "sigmaJ"]) fijarSlider(`merton-${id}`, cal[id]);
  mostrarCalibracionMerton();
  simularYDibujarMerton();
}

function modoSustentacionMerton() {
  semillaActual = SEMILLA_BASE;
  const base = mercadoMerton ? mercadoMerton.cal : EJEMPLO_MERTON;
  for (const id of ["mu", "sigma", "lambda", "muJ", "sigmaJ"]) fijarSlider(`merton-${id}`, base[id]);
  $("merton-dias").value = 252;
  $("merton-n").value = 200;
  simularYDibujarMerton();
}

MODULOS.merton = {
  dibujar() {
    simularYDibujarMerton();
    if (mercadoMerton) mostrarCalibracionMerton(); // el histograma se redibuja al ancho actual
  },
  conectar() {
    conectarFormularioDatos("merton", (datos) => {
      mercadoMerton = { datos, cal: null };
      $("merton-umbral-caja").hidden = false;
      calibrarYFijarMerton();
    });
    for (const id of CONTROLES_MERTON) {
      $(`merton-${id}`).addEventListener("input", simularYDibujarMerton);
    }
    $("merton-umbral").addEventListener("input", calibrarYFijarMerton);
    $("merton-sin-saltos").addEventListener("click", () => {
      $("merton-lambda").value = 0;
      simularYDibujarMerton();
    });
    $("merton-semilla").addEventListener("click", () => {
      semillaActual = Math.floor(Math.random() * 100000);
      simularYDibujarMerton();
    });
    $("merton-reiniciar").addEventListener("click", modoSustentacionMerton);
  },
};
