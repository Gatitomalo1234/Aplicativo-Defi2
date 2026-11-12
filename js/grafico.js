// grafico.js — abanico de trayectorias en canvas, sin librerías.
// Dibuja: (opcional) el precio histórico real, y desde "hoy" en adelante la
// banda central del 90 % (p5–p95), la mediana y una muestra de caminos.
// Hover: en el tramo histórico muestra el precio real; en el simulado, p5 / mediana / p95.

const ESTILO_GRAFICO = {
  // misma paleta que css/estilos.css: azul para lo simulado, marino para lo real,
  // coral para referencias (banda de comparación) y eventos (días de salto)
  camino: "rgba(61, 111, 230, 0.15)",
  banda: "rgba(61, 111, 230, 0.11)",
  mediana: "#3D6FE6",
  historico: "#1D2D50",
  eje: "#9AA8BC",
  rejilla: "#E7EDF5",
  texto: "#6B7A91",
  referencia: "#D9644A",
  marca: "#D9644A",
  equilibrio: "#1D2D50", // θ en OU (punteado fino)
  fuente: "11.5px Geist, 'STIX Two Text', -apple-system, sans-serif",
  fuenteCifras: "11px 'Geist Mono', ui-monospace, Menlo, monospace",
  maxCaminosVisibles: 60,
};

// percentil con interpolación lineal; lo usan la banda del gráfico y el texto
// de lectura, para que ambos muestren exactamente los mismos números
function percentil(ordenado, p) {
  const i = (ordenado.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.min(lo + 1, ordenado.length - 1);
  return ordenado[lo] + (ordenado[hi] - ordenado[lo]) * (i - lo);
}

// p5, p50, p95 en cada paso, calculados con TODAS las trayectorias.
function bandasDe(caminos) {
  const n = caminos[0].length;
  const p5 = new Float64Array(n), p50 = new Float64Array(n), p95 = new Float64Array(n);
  const col = new Float64Array(caminos.length);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < caminos.length; i++) col[i] = caminos[i][j];
    const ord = Float64Array.from(col).sort();
    p5[j] = percentil(ord, 0.05);
    p50[j] = percentil(ord, 0.5);
    p95[j] = percentil(ord, 0.95);
  }
  return { p5, p50, p95 };
}

// opciones: { formato, historico: [precios], fechasHistorico: [fechas],
//   referencia: { p5, p95, nombre }  -> banda de otro modelo en línea punteada
//                                      (Merton: el GBM con las mismas Z),
//   marcas: [índices de historico]   -> puntos sobre días especiales (saltos),
//   lineaH: { valor, nombre }        -> línea horizontal (OU: el equilibrio θ),
//   minimoCero: false                -> permite valores negativos en el eje (OU: niveles),
//   nombreHistorico: "valor real"    -> rótulo de la serie histórica en la leyenda }
function dibujarAbanico(canvas, caminos, opciones = {}, hoverIndice = null) {
  if (!canvas.clientWidth) return; // sección oculta: se dibuja al mostrarse
  const o = {
    formato: (v) => v.toFixed(1), historico: [], fechasHistorico: [],
    referencia: null, marcas: [], lineaH: null, minimoCero: true,
    nombreHistorico: "precio real", ...opciones,
  };
  const dpr = window.devicePixelRatio || 1;
  const ancho = canvas.clientWidth, alto = canvas.clientHeight;
  canvas.width = ancho * dpr;
  canvas.height = alto * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const hist = o.historico;
  const desfase = hist.length ? hist.length - 1 : 0; // índice de "hoy"
  const nSim = caminos[0].length;
  const total = desfase + nSim;
  const bandas = canvas._bandasCache && canvas._caminosCache === caminos
    ? canvas._bandasCache
    : bandasDe(caminos);
  canvas._caminosCache = caminos;
  canvas._bandasCache = bandas;

  // con banda de referencia la leyenda usa dos líneas: se deja más margen arriba
  const margen = { izq: 58, der: 14, arr: o.referencia ? 42 : 26, aba: 26 };
  const W = ancho - margen.izq - margen.der;
  const H = alto - margen.arr - margen.aba;

  let yMin = Infinity, yMax = -Infinity;
  for (const v of hist) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
  for (let j = 0; j < nSim; j++) {
    if (bandas.p5[j] < yMin) yMin = bandas.p5[j];
    if (bandas.p95[j] > yMax) yMax = bandas.p95[j];
    if (o.referencia) {
      if (o.referencia.p5[j] < yMin) yMin = o.referencia.p5[j];
      if (o.referencia.p95[j] > yMax) yMax = o.referencia.p95[j];
    }
  }
  if (o.lineaH) { yMin = Math.min(yMin, o.lineaH.valor); yMax = Math.max(yMax, o.lineaH.valor); }
  // los caminos de la muestra pueden salirse de la banda: se recortan al borde
  const holgura = (yMax - yMin) * 0.12 || 1;
  yMin = o.minimoCero ? Math.max(0, yMin - holgura) : yMin - holgura;
  yMax += holgura;

  const px = (k) => margen.izq + (k / (total - 1)) * W;
  const py = (v) => margen.arr + (1 - (v - yMin) / (yMax - yMin)) * H;

  ctx.clearRect(0, 0, ancho, alto);
  ctx.font = ESTILO_GRAFICO.fuente;

  // rejilla + eje y
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const v = yMin + ((yMax - yMin) * g) / 4;
    ctx.strokeStyle = ESTILO_GRAFICO.rejilla;
    ctx.beginPath(); ctx.moveTo(margen.izq, py(v)); ctx.lineTo(ancho - margen.der, py(v)); ctx.stroke();
    ctx.fillStyle = ESTILO_GRAFICO.texto;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.font = ESTILO_GRAFICO.fuenteCifras;
    ctx.fillText(o.formato(v), margen.izq - 6, py(v));
    ctx.font = ESTILO_GRAFICO.fuente;
  }

  // eje x
  ctx.textBaseline = "top";
  if (desfase) {
    ctx.textAlign = "left";  ctx.fillText(`hace ${desfase} días`, px(0), alto - margen.aba + 6);
    // «hoy» solo si no se pisa con «hace … días» (pronósticos largos dejan la historia angosta)
    if (px(desfase) - px(0) > 110) { ctx.textAlign = "center"; ctx.fillText("hoy", px(desfase), alto - margen.aba + 6); }
  } else {
    ctx.textAlign = "left"; ctx.fillText("hoy", px(0), alto - margen.aba + 6);
  }
  ctx.textAlign = "right"; ctx.fillText(`+${nSim - 1} días`, px(total - 1), alto - margen.aba + 6);

  ctx.save();
  ctx.beginPath(); ctx.rect(margen.izq, margen.arr, W, H); ctx.clip();

  // banda 5–95
  ctx.fillStyle = ESTILO_GRAFICO.banda;
  ctx.beginPath();
  ctx.moveTo(px(desfase), py(bandas.p95[0]));
  for (let j = 1; j < nSim; j++) ctx.lineTo(px(desfase + j), py(bandas.p95[j]));
  for (let j = nSim - 1; j >= 0; j--) ctx.lineTo(px(desfase + j), py(bandas.p5[j]));
  ctx.closePath(); ctx.fill();

  // muestra de caminos
  ctx.strokeStyle = ESTILO_GRAFICO.camino;
  ctx.lineWidth = 1;
  const paso = Math.max(1, Math.ceil(caminos.length / ESTILO_GRAFICO.maxCaminosVisibles));
  for (let i = 0; i < caminos.length; i += paso) {
    ctx.beginPath();
    ctx.moveTo(px(desfase), py(caminos[i][0]));
    for (let j = 1; j < nSim; j++) ctx.lineTo(px(desfase + j), py(caminos[i][j]));
    ctx.stroke();
  }

  // mediana simulada
  ctx.strokeStyle = ESTILO_GRAFICO.mediana;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px(desfase), py(bandas.p50[0]));
  for (let j = 1; j < nSim; j++) ctx.lineTo(px(desfase + j), py(bandas.p50[j]));
  ctx.stroke();

  // banda de referencia (otro modelo, mismas Z): solo sus bordes, punteados
  if (o.referencia) {
    ctx.strokeStyle = ESTILO_GRAFICO.referencia;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    for (const borde of [o.referencia.p5, o.referencia.p95]) {
      ctx.beginPath();
      ctx.moveTo(px(desfase), py(borde[0]));
      for (let j = 1; j < nSim; j++) ctx.lineTo(px(desfase + j), py(borde[j]));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // histórico real
  if (hist.length) {
    ctx.strokeStyle = ESTILO_GRAFICO.historico;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px(0), py(hist[0]));
    for (let k = 1; k < hist.length; k++) ctx.lineTo(px(k), py(hist[k]));
    ctx.stroke();
    // marcas sobre días especiales del histórico (p. ej. saltos detectados)
    ctx.fillStyle = ESTILO_GRAFICO.marca;
    for (const k of o.marcas) {
      if (k < 0 || k >= hist.length) continue;
      ctx.beginPath(); ctx.arc(px(k), py(hist[k]), 3.5, 0, 2 * Math.PI); ctx.fill();
    }
  }
  // línea horizontal (equilibrio θ en OU)
  if (o.lineaH) {
    ctx.strokeStyle = ESTILO_GRAFICO.equilibrio; ctx.lineWidth = 1.5; ctx.setLineDash([1, 3]);
    ctx.beginPath(); ctx.moveTo(margen.izq, py(o.lineaH.valor)); ctx.lineTo(margen.izq + W, py(o.lineaH.valor)); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  // línea de "hoy"
  if (desfase) {
    ctx.strokeStyle = ESTILO_GRAFICO.eje;
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(px(desfase), margen.arr); ctx.lineTo(px(desfase), margen.arr + H); ctx.stroke();
    ctx.setLineDash([]);
  }

  // leyenda (dos series: histórico real y simulación)
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  let lx = margen.izq;
  if (hist.length) {
    ctx.fillStyle = ESTILO_GRAFICO.historico; ctx.fillRect(lx, 9, 14, 2);
    ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText(o.nombreHistorico, lx + 18, 10);
    lx += 100;
  }
  ctx.fillStyle = ESTILO_GRAFICO.mediana; ctx.fillRect(lx, 9, 14, 2);
  ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText("mediana simulada", lx + 18, 10);
  lx += 128;
  ctx.fillStyle = ESTILO_GRAFICO.banda; ctx.fillRect(lx, 4, 14, 12);
  ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText("90 % de los escenarios", lx + 18, 10);
  if (o.referencia) { // segunda línea de la leyenda
    lx = margen.izq;
    ctx.strokeStyle = ESTILO_GRAFICO.referencia; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(lx, 26); ctx.lineTo(lx + 14, 26); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText(o.referencia.nombre || "referencia", lx + 18, 26);
    if (o.marcas.length) {
      lx += ctx.measureText(o.referencia.nombre || "referencia").width + 34;
      ctx.fillStyle = ESTILO_GRAFICO.marca;
      ctx.beginPath(); ctx.arc(lx + 7, 26, 3.5, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText("día de salto real", lx + 18, 26);
    }
    if (o.lineaH) {
      lx += ctx.measureText(o.referencia.nombre || "referencia").width + 34;
      ctx.strokeStyle = ESTILO_GRAFICO.equilibrio; ctx.lineWidth = 1.5; ctx.setLineDash([1, 3]);
      ctx.beginPath(); ctx.moveTo(lx, 26); ctx.lineTo(lx + 14, 26); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText(o.lineaH.nombre, lx + 18, 26);
    }
  }

  // hover
  if (hoverIndice !== null && hoverIndice >= 0 && hoverIndice < total) {
    const k = hoverIndice;
    ctx.strokeStyle = ESTILO_GRAFICO.eje;
    ctx.beginPath(); ctx.moveTo(px(k), margen.arr); ctx.lineTo(px(k), margen.arr + H); ctx.stroke();
    let texto;
    if (k < desfase) {
      const fecha = o.fechasHistorico[k] ? o.fechasHistorico[k] + " · " : "";
      texto = `${fecha}precio real ${o.formato(hist[k])}`;
    } else {
      const j = k - desfase;
      texto = `+${j} d · p5 ${o.formato(bandas.p5[j])} · mediana ${o.formato(bandas.p50[j])} · p95 ${o.formato(bandas.p95[j])}`;
      if (o.referencia) {
        texto += ` · ${o.referencia.corto || "ref."} ${o.formato(o.referencia.p5[j])}–${o.formato(o.referencia.p95[j])}`;
      }
    }
    const anchoTexto = ctx.measureText(texto).width + 12;
    // el recuadro puede usar todo el ancho del canvas (también el margen del eje y)
    const tx = Math.max(4, Math.min(px(k) - anchoTexto / 2, ancho - 4 - anchoTexto));
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = ESTILO_GRAFICO.rejilla;
    ctx.beginPath(); ctx.roundRect(tx, margen.arr + 1, anchoTexto, 22, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ESTILO_GRAFICO.historico;
    ctx.fillText(texto, tx + 6, margen.arr + 12);
  }

  canvas._estado = { caminos, opciones, margen, W, total };
  if (!canvas._hoverListo) {
    canvas._hoverListo = true;
    canvas.addEventListener("mousemove", (ev) => {
      const e = canvas._estado;
      const x = ev.clientX - canvas.getBoundingClientRect().left;
      const k = Math.round(((x - e.margen.izq) / e.W) * (e.total - 1));
      dibujarAbanico(canvas, e.caminos, e.opciones, k);
    });
    canvas.addEventListener("mouseleave", () => {
      const e = canvas._estado;
      dibujarAbanico(canvas, e.caminos, e.opciones);
    });
  }
}

// Histograma de retornos diarios (en %), sin librerías.
// opciones: { umbralInf, umbralSup } -> líneas verticales del umbral de salto;
//   las barras fuera del umbral se pintan con el color de "salto".
// La escala vertical es raíz cuadrada del conteo: así las colas (pocos días)
// se alcanzan a ver junto al centro (cientos de días). Se dice en el eje.
function dibujarHistograma(canvas, retornos, opciones = {}) {
  if (!canvas.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const ancho = canvas.clientWidth, alto = canvas.clientHeight;
  canvas.width = ancho * dpr;
  canvas.height = alto * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ancho, alto);
  ctx.font = ESTILO_GRAFICO.fuente;

  const margen = { izq: 14, der: 14, arr: 24, aba: 26 };
  const W = ancho - margen.izq - margen.der;
  const H = alto - margen.arr - margen.aba;
  let lim = 0;
  for (const r of retornos) lim = Math.max(lim, Math.abs(r));
  lim = Math.max(lim, Math.abs(opciones.umbralInf || 0), Math.abs(opciones.umbralSup || 0)) * 1.05;
  const nBarras = 61;
  const ancho1 = (2 * lim) / nBarras;
  const conteo = new Array(nBarras).fill(0);
  for (const r of retornos) {
    conteo[Math.min(nBarras - 1, Math.floor((r + lim) / ancho1))]++;
  }
  const maxRaiz = Math.sqrt(Math.max(...conteo)) || 1;
  const px = (r) => margen.izq + ((r + lim) / (2 * lim)) * W;

  for (let b = 0; b < nBarras; b++) {
    if (!conteo[b]) continue;
    const centro = -lim + (b + 0.5) * ancho1;
    const fuera = centro < opciones.umbralInf || centro > opciones.umbralSup;
    ctx.fillStyle = fuera ? ESTILO_GRAFICO.marca : ESTILO_GRAFICO.mediana;
    const h = (Math.sqrt(conteo[b]) / maxRaiz) * H;
    ctx.fillRect(px(-lim + b * ancho1) + 0.5, margen.arr + H - h, W / nBarras - 1, h);
  }

  // eje x en %
  ctx.strokeStyle = ESTILO_GRAFICO.eje; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(margen.izq, margen.arr + H); ctx.lineTo(margen.izq + W, margen.arr + H); ctx.stroke();
  ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.textBaseline = "top";
  for (const v of [-lim * 0.9, -lim * 0.45, 0, lim * 0.45, lim * 0.9]) {
    ctx.textAlign = "center";
    ctx.fillText(`${(v * 100).toFixed(0)} %`, px(v), margen.arr + H + 6);
  }

  // umbrales
  ctx.strokeStyle = ESTILO_GRAFICO.marca; ctx.setLineDash([4, 3]);
  for (const u of [opciones.umbralInf, opciones.umbralSup]) {
    if (u === undefined) continue;
    ctx.beginPath(); ctx.moveTo(px(u), margen.arr); ctx.lineTo(px(u), margen.arr + H); ctx.stroke();
  }
  ctx.setLineDash([]);

  // leyenda (solo cuando hay umbral de salto)
  if (opciones.umbralInf !== undefined) {
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = ESTILO_GRAFICO.mediana; ctx.fillRect(margen.izq, 6, 12, 10);
    ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText("días normales", margen.izq + 16, 11);
    ctx.fillStyle = ESTILO_GRAFICO.marca; ctx.fillRect(margen.izq + 110, 6, 12, 10);
    ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText("días de salto (fuera del umbral)", margen.izq + 126, 11);
  }
  ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillStyle = ESTILO_GRAFICO.texto;
  ctx.fillText("altura: √(número de días)", margen.izq + W, 11);
}

// Gráfico log-log del escalamiento de la varianza (browniano fraccional).
// puntos: [{ k, sd }]; ajuste: { H, c } -> recta sd = c·k^H;
// también se dibuja la recta de pendiente 0.5 (sin memoria) por el punto k = 1.
function dibujarLogLog(canvas, puntos, ajuste) {
  if (!canvas.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const ancho = canvas.clientWidth, alto = canvas.clientHeight;
  canvas.width = ancho * dpr;
  canvas.height = alto * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ancho, alto);
  ctx.font = ESTILO_GRAFICO.fuente;

  const margen = { izq: 58, der: 14, arr: 26, aba: 34 };
  const W = ancho - margen.izq - margen.der;
  const H = alto - margen.arr - margen.aba;
  const lk = puntos.map((p) => Math.log(p.k)), ls = puntos.map((p) => Math.log(p.sd));
  const ref = (k) => Math.log(puntos[0].sd) + 0.5 * Math.log(k); // pendiente 0.5
  const fit = (k) => Math.log(ajuste.c) + ajuste.H * Math.log(k);
  const xMin = 0, xMax = Math.max(...lk);
  const kMax = puntos[puntos.length - 1].k;
  let yMin = Math.min(...ls, ref(1), fit(1)), yMax = Math.max(...ls, ref(kMax), fit(kMax));
  const holg = (yMax - yMin) * 0.08;
  yMin -= holg; yMax += holg;
  const px = (x) => margen.izq + ((x - xMin) / (xMax - xMin || 1)) * W;
  const py = (y) => margen.arr + (1 - (y - yMin) / (yMax - yMin)) * H;

  // ejes: k en días (escala log) y sd en % (escala log)
  ctx.strokeStyle = ESTILO_GRAFICO.rejilla; ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.lineWidth = 1;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const p of puntos) {
    ctx.beginPath(); ctx.moveTo(px(Math.log(p.k)), margen.arr); ctx.lineTo(px(Math.log(p.k)), margen.arr + H); ctx.stroke();
    ctx.fillText(String(p.k), px(Math.log(p.k)), margen.arr + H + 6);
  }
  ctx.fillText("k (días por bloque, escala logarítmica)", margen.izq + W / 2, margen.arr + H + 20);
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let g = 0; g <= 3; g++) {
    const y = yMin + ((yMax - yMin) * g) / 3;
    ctx.fillText(`${(Math.exp(y) * 100).toFixed(1)} %`, margen.izq - 6, py(y));
  }

  const recta = (f, color, guion) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash(guion);
    ctx.beginPath(); ctx.moveTo(px(0), py(f(1))); ctx.lineTo(px(xMax), py(f(kMax))); ctx.stroke();
    ctx.setLineDash([]);
  };
  recta(ref, ESTILO_GRAFICO.referencia, [5, 4]);
  recta(fit, ESTILO_GRAFICO.mediana, []);
  ctx.fillStyle = ESTILO_GRAFICO.historico;
  for (let i = 0; i < puntos.length; i++) {
    ctx.beginPath(); ctx.arc(px(lk[i]), py(ls[i]), 3.5, 0, 2 * Math.PI); ctx.fill();
  }

  // leyenda
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  let lx = margen.izq;
  ctx.fillStyle = ESTILO_GRAFICO.historico; ctx.beginPath(); ctx.arc(lx + 5, 10, 3.5, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText("desviación de las sumas de k días", lx + 14, 10);
  lx += 200;
  ctx.fillStyle = ESTILO_GRAFICO.mediana; ctx.fillRect(lx, 9, 14, 2);
  ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText(`ajuste: pendiente Ĥ = ${ajuste.H.toFixed(2)}`, lx + 18, 10);
  lx += 160;
  ctx.strokeStyle = ESTILO_GRAFICO.referencia; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(lx, 10); ctx.lineTo(lx + 14, 10); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillText("pendiente 0.5 (sin memoria)", lx + 18, 10);
}

// Línea de precio en el tiempo (sección «Toma de datos»), con hover: fecha y valor.
// opciones: { sombra: [i0, i1] -> franja resaltada (ventana), marcas: Set de índices -> puntos,
//   horizontal: { valor, nombre } -> línea de referencia punteada (Vasicek: tasa constante) }
function dibujarLinea(canvas, fechas, valores, formato = (v) => v.toFixed(2), hoverIndice = null, opciones = {}) {
  if (!canvas.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const ancho = canvas.clientWidth, alto = canvas.clientHeight;
  canvas.width = ancho * dpr;
  canvas.height = alto * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ancho, alto);
  ctx.font = ESTILO_GRAFICO.fuente;

  const margen = { izq: 58, der: 14, arr: 14, aba: 26 };
  const W = ancho - margen.izq - margen.der;
  const H = alto - margen.arr - margen.aba;
  const n = valores.length;
  let yMin = Math.min(...valores), yMax = Math.max(...valores);
  if (opciones.horizontal) {
    yMin = Math.min(yMin, opciones.horizontal.valor);
    yMax = Math.max(yMax, opciones.horizontal.valor);
  }
  const holgura = (yMax - yMin) * 0.08 || Math.abs(yMax) * 0.1 || 1;
  const positivos = yMin >= 0;
  yMin -= holgura; yMax += holgura;
  if (positivos) yMin = Math.max(0, yMin); // una serie positiva (precio, CSAD) no muestra eje negativo
  const px = (i) => margen.izq + (i / Math.max(n - 1, 1)) * W;
  const py = (v) => margen.arr + (1 - (v - yMin) / (yMax - yMin)) * H;

  // rejilla y eje y
  for (let g = 0; g <= 4; g++) {
    const v = yMin + ((yMax - yMin) * g) / 4;
    ctx.strokeStyle = ESTILO_GRAFICO.rejilla; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(margen.izq, py(v)); ctx.lineTo(ancho - margen.der, py(v)); ctx.stroke();
    ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.font = ESTILO_GRAFICO.fuenteCifras; ctx.fillText(formato(v), margen.izq - 6, py(v));
    ctx.font = ESTILO_GRAFICO.fuente;
  }
  // eje x: primera, del medio y última fecha
  ctx.textBaseline = "top";
  [[0, "left"], [Math.floor((n - 1) / 2), "center"], [n - 1, "right"]].forEach(([i, al]) => {
    ctx.textAlign = al; ctx.fillText(fechas[i], px(i), alto - margen.aba + 7);
  });

  // franja de la ventana elegida
  if (opciones.sombra) {
    const [a, b] = opciones.sombra;
    ctx.fillStyle = "rgba(61, 111, 230, 0.08)";
    ctx.fillRect(px(a), margen.arr, Math.max(px(b) - px(a), 1), H);
  }

  // área suave bajo la línea y la línea
  const grad = ctx.createLinearGradient(0, margen.arr, 0, margen.arr + H);
  grad.addColorStop(0, "rgba(61, 111, 230, 0.18)");
  grad.addColorStop(1, "rgba(61, 111, 230, 0)");
  ctx.beginPath(); ctx.moveTo(px(0), py(valores[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(px(i), py(valores[i]));
  ctx.lineTo(px(n - 1), margen.arr + H); ctx.lineTo(px(0), margen.arr + H); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.moveTo(px(0), py(valores[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(px(i), py(valores[i]));
  ctx.strokeStyle = ESTILO_GRAFICO.historico; ctx.lineWidth = opciones.sombra ? 1.2 : 1.5; ctx.stroke();

  // línea de referencia horizontal con su nombre
  if (opciones.horizontal) {
    const yh = py(opciones.horizontal.valor);
    ctx.strokeStyle = ESTILO_GRAFICO.referencia; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(margen.izq, yh); ctx.lineTo(margen.izq + W, yh); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ESTILO_GRAFICO.referencia; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
    ctx.fillText(opciones.horizontal.nombre, margen.izq + W, yh - 4);
  }

  // puntos en días especiales (manada: días extremos de la prueba CSSD)
  if (opciones.marcas) {
    ctx.fillStyle = ESTILO_GRAFICO.marca;
    for (const i of opciones.marcas) {
      ctx.beginPath(); ctx.arc(px(i), py(valores[i]), 2.6, 0, 2 * Math.PI); ctx.fill();
    }
  }

  // hover
  if (hoverIndice !== null && hoverIndice >= 0 && hoverIndice < n) {
    const i = hoverIndice;
    ctx.strokeStyle = ESTILO_GRAFICO.eje; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px(i), margen.arr); ctx.lineTo(px(i), margen.arr + H); ctx.stroke();
    ctx.fillStyle = ESTILO_GRAFICO.mediana;
    ctx.beginPath(); ctx.arc(px(i), py(valores[i]), 4, 0, 2 * Math.PI); ctx.fill();
    const texto = `${fechas[i]} · ${formato(valores[i])}`;
    const a = ctx.measureText(texto).width + 12;
    const tx = Math.max(4, Math.min(px(i) - a / 2, ancho - 4 - a));
    ctx.fillStyle = "#FFFFFF"; ctx.strokeStyle = ESTILO_GRAFICO.rejilla;
    ctx.beginPath(); ctx.roundRect(tx, margen.arr + 1, a, 22, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ESTILO_GRAFICO.historico; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(texto, tx + 6, margen.arr + 12);
  }

  canvas._linea = { fechas, valores, formato, margen, W, n, opciones };
  if (!canvas._hoverLinea) {
    canvas._hoverLinea = true;
    canvas.addEventListener("mousemove", (ev) => {
      const e = canvas._linea;
      const x = ev.clientX - canvas.getBoundingClientRect().left;
      const i = Math.round(((x - e.margen.izq) / e.W) * (e.n - 1));
      dibujarLinea(canvas, e.fechas, e.valores, e.formato, i, e.opciones);
    });
    canvas.addEventListener("mouseleave", () => {
      const e = canvas._linea;
      dibujarLinea(canvas, e.fechas, e.valores, e.formato, null, e.opciones);
    });
  }
}

// Manada: CSAD de cada día contra el retorno del mercado de la canasta (la figura
// clásica de Chang, Cheng y Khorana). Curva = ajuste α + γ1|R_m| + γ2·R_m²; punteada =
// la misma sin el término γ2 (lo que daría la dispersión sin curvatura).
// x, y: arreglos de la ventana; beta: [α, γ1, γ2]; extremos: arreglo de booleanos.
function dibujarDispersionCSAD(canvas, x, y, beta, extremos) {
  if (!canvas.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const ancho = canvas.clientWidth, alto = canvas.clientHeight;
  canvas.width = ancho * dpr;
  canvas.height = alto * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ancho, alto);
  ctx.font = ESTILO_GRAFICO.fuente;

  const margen = { izq: 58, der: 14, arr: 26, aba: 30 };
  const W = ancho - margen.izq - margen.der;
  const H = alto - margen.arr - margen.aba;
  const xMax = Math.max(...x.map(Math.abs)) * 1.05 || 0.01;
  const curva = (r) => beta[0] + beta[1] * Math.abs(r) + beta[2] * r * r;
  const lineal = (r) => beta[0] + beta[1] * Math.abs(r);
  let yMax = Math.max(...y, curva(xMax), curva(-xMax), lineal(xMax)) * 1.08;
  const yMin = 0;
  const px = (r) => margen.izq + ((r + xMax) / (2 * xMax)) * W;
  const py = (v) => margen.arr + (1 - (v - yMin) / (yMax - yMin)) * H;

  // rejilla y ejes (en %)
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const v = yMin + ((yMax - yMin) * g) / 4;
    ctx.strokeStyle = ESTILO_GRAFICO.rejilla;
    ctx.beginPath(); ctx.moveTo(margen.izq, py(v)); ctx.lineTo(margen.izq + W, py(v)); ctx.stroke();
    ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.font = ESTILO_GRAFICO.fuenteCifras; ctx.fillText(`${(v * 100).toFixed(1)} %`, margen.izq - 6, py(v));
  }
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const r of [-xMax * 0.9, -xMax * 0.45, 0, xMax * 0.45, xMax * 0.9]) {
    ctx.fillText(`${(r * 100).toFixed(1)} %`, px(r), margen.arr + H + 6);
  }
  ctx.font = ESTILO_GRAFICO.fuente;
  ctx.fillText("retorno del mercado de la canasta, R_m", margen.izq + W / 2, margen.arr + H + 19);

  // puntos: cada día de la ventana (coral = día extremo de la prueba CSSD)
  for (let i = 0; i < x.length; i++) {
    ctx.fillStyle = extremos[i] ? ESTILO_GRAFICO.marca : "rgba(29, 45, 80, 0.35)";
    ctx.beginPath(); ctx.arc(px(x[i]), py(y[i]), extremos[i] ? 3 : 2.2, 0, 2 * Math.PI); ctx.fill();
  }

  // curvas
  const trazar = (f, color, guion, grosor) => {
    ctx.strokeStyle = color; ctx.lineWidth = grosor; ctx.setLineDash(guion);
    ctx.beginPath();
    for (let k = 0; k <= 120; k++) {
      const r = -xMax + (2 * xMax * k) / 120;
      k === 0 ? ctx.moveTo(px(r), py(f(r))) : ctx.lineTo(px(r), py(f(r)));
    }
    ctx.stroke(); ctx.setLineDash([]);
  };
  ctx.save(); ctx.beginPath(); ctx.rect(margen.izq, margen.arr, W, H); ctx.clip();
  trazar(lineal, ESTILO_GRAFICO.eje, [5, 4], 1.4);
  trazar(curva, ESTILO_GRAFICO.mediana, [], 2.2);
  ctx.restore();

  // leyenda
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  let lx = margen.izq;
  ctx.fillStyle = "rgba(29, 45, 80, 0.5)"; ctx.beginPath(); ctx.arc(lx + 5, 10, 3, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText("un día", lx + 12, 10);
  lx += 62;
  ctx.fillStyle = ESTILO_GRAFICO.marca; ctx.beginPath(); ctx.arc(lx + 5, 10, 3, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText("día extremo (CSSD)", lx + 12, 10);
  lx += 132;
  ctx.fillStyle = ESTILO_GRAFICO.mediana; ctx.fillRect(lx, 9, 14, 2);
  ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText("ajuste CSAD", lx + 18, 10);
  lx += 92;
  ctx.strokeStyle = ESTILO_GRAFICO.eje; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(lx, 10); ctx.lineTo(lx + 14, 10); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillText("sin el término γ₂", lx + 18, 10);
}

// Opciones reales: árbol binomial con S y C en cada nodo (como en la presentación).
// Los nodos donde conviene ejercer la opción van en ámbar. Hasta MAX_PASOS_DIBUJO pasos;
// con más, solo se escribe un aviso (los resultados se muestran aparte).
const MAX_PASOS_DIBUJO = 6;
function dibujarArbol(canvas, arbol, accion, formato = (v) => v.toFixed(2)) {
  if (!canvas.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const ancho = canvas.clientWidth, alto = canvas.clientHeight;
  canvas.width = ancho * dpr;
  canvas.height = alto * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ancho, alto);
  const n = arbol.nodos.length - 1;
  if (n > MAX_PASOS_DIBUJO) {
    ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.font = ESTILO_GRAFICO.fuente;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(`El árbol tiene ${n} pasos (${((n + 1) * (n + 2)) / 2} nodos): se dibuja hasta ${MAX_PASOS_DIBUJO} pasos.`, ancho / 2, alto / 2 - 10);
    ctx.fillText("Los resultados de abajo usan el árbol completo.", ancho / 2, alto / 2 + 12);
    return;
  }
  const angosto = ancho < 520; // celular: menos margen y cajas solo con los números
  const lado = angosto ? 30 : 52;
  const margen = { izq: lado, der: lado, arr: 48, aba: 40 }; // espacio para «t = …» arriba y el rótulo de abajo
  const caja = { w: Math.min(92, (ancho - margen.izq - margen.der) / (n + 1) - 6), h: 40 };
  const conRotulo = caja.w >= 78; // «S = 720.00» cabe; si no, solo el número
  const px = (t) => margen.izq + (n === 0 ? 0 : (t / n) * (ancho - margen.izq - margen.der));
  const py = (t, j) => { // nivel = subidas − bajadas, de +n (arriba) a −n (abajo)
    const nivel = t - 2 * j;
    return margen.arr + ((n - nivel) / (2 * n || 1)) * (alto - margen.arr - margen.aba);
  };
  // encabezados t = 0, 1, ...
  ctx.font = "600 11.5px Geist, sans-serif"; ctx.fillStyle = ESTILO_GRAFICO.texto;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (let t = 0; t <= n; t++) ctx.fillText(`t = ${t}`, px(t), 4);
  // ramas
  ctx.strokeStyle = "#B8C4D4"; ctx.lineWidth = 1.2;
  for (let t = 0; t < n; t++) {
    for (let j = 0; j <= t; j++) {
      for (const k of [j, j + 1]) {
        ctx.beginPath(); ctx.moveTo(px(t), py(t, j)); ctx.lineTo(px(t + 1), py(t + 1, k)); ctx.stroke();
      }
    }
  }
  // nodos
  for (let t = 0; t <= n; t++) {
    arbol.nodos[t].forEach((nodo, j) => {
      const x = px(t) - caja.w / 2, y = py(t, j) - caja.h / 2;
      ctx.fillStyle = nodo.ejerce ? "#FDF1D6" : t === 0 ? "#EAF1FD" : "#FFFFFF";
      ctx.strokeStyle = nodo.ejerce ? "#E3A63B" : t === 0 ? ESTILO_GRAFICO.mediana : "#9DB3D6";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.roundRect(x, y, caja.w, caja.h, 9); ctx.fill(); ctx.stroke();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.font = "10.5px 'Geist Mono', monospace";
      ctx.font = conRotulo ? "10.5px 'Geist Mono', monospace" : "9.5px 'Geist Mono', monospace";
      ctx.fillText(conRotulo ? `S = ${formato(nodo.S)}` : formato(nodo.S), px(t), py(t, j) - 9);
      ctx.fillStyle = nodo.ejerce ? "#9A5B00" : ESTILO_GRAFICO.historico; ctx.font = "600 11.5px 'Geist Mono', monospace";
      if (!conRotulo) ctx.font = "600 10.5px 'Geist Mono', monospace";
      ctx.fillText(conRotulo ? `C = ${formato(nodo.C)}` : formato(nodo.C), px(t), py(t, j) + 7);
      if (nodo.ejerce) {
        ctx.font = "600 9px Geist, sans-serif"; ctx.fillStyle = "#9A5B00";
        ctx.fillText(accion, px(t), y + caja.h + 8);
      }
    });
  }
}
