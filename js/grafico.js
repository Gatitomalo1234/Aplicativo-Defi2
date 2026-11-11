// grafico.js — abanico de trayectorias en canvas, sin librerías.
// Dibuja: (opcional) el precio histórico real, y desde "hoy" en adelante la
// banda central del 90 % (p5–p95), la mediana y una muestra de caminos.
// Hover: en el tramo histórico muestra el precio real; en el simulado, p5 / mediana / p95.

const ESTILO_GRAFICO = {
  camino: "rgba(31, 110, 104, 0.16)",
  banda: "rgba(31, 110, 104, 0.10)",
  mediana: "#1F6E68",
  historico: "#232A2E",
  eje: "#8A949A",
  rejilla: "#E3E6E1",
  texto: "#5C676D",
  referencia: "#B5552B", // banda de comparación (GBM) y días de salto
  marca: "#B5552B",
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
//   marcas: [índices de historico]   -> puntos sobre días especiales (saltos) }
function dibujarAbanico(canvas, caminos, opciones = {}, hoverIndice = null) {
  const o = {
    formato: (v) => v.toFixed(1), historico: [], fechasHistorico: [],
    referencia: null, marcas: [], ...opciones,
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
  // los caminos de la muestra pueden salirse de la banda: se recortan al borde
  const holgura = (yMax - yMin) * 0.12 || 1;
  yMin = Math.max(0, yMin - holgura);
  yMax += holgura;

  const px = (k) => margen.izq + (k / (total - 1)) * W;
  const py = (v) => margen.arr + (1 - (v - yMin) / (yMax - yMin)) * H;

  ctx.clearRect(0, 0, ancho, alto);
  ctx.font = "11px -apple-system, 'Segoe UI', sans-serif";

  // rejilla + eje y
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const v = yMin + ((yMax - yMin) * g) / 4;
    ctx.strokeStyle = ESTILO_GRAFICO.rejilla;
    ctx.beginPath(); ctx.moveTo(margen.izq, py(v)); ctx.lineTo(ancho - margen.der, py(v)); ctx.stroke();
    ctx.fillStyle = ESTILO_GRAFICO.texto;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(o.formato(v), margen.izq - 6, py(v));
  }

  // eje x
  ctx.textBaseline = "top";
  if (desfase) {
    ctx.textAlign = "left";  ctx.fillText(`hace ${desfase} días`, px(0), alto - margen.aba + 6);
    ctx.textAlign = "center"; ctx.fillText("hoy", px(desfase), alto - margen.aba + 6);
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
    ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText("precio real", lx + 18, 10);
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
    ctx.fillRect(tx, margen.arr + 2, anchoTexto, 20);
    ctx.strokeRect(tx, margen.arr + 2, anchoTexto, 20);
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
  const dpr = window.devicePixelRatio || 1;
  const ancho = canvas.clientWidth, alto = canvas.clientHeight;
  canvas.width = ancho * dpr;
  canvas.height = alto * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ancho, alto);
  ctx.font = "11px -apple-system, 'Segoe UI', sans-serif";

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

  // leyenda
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillStyle = ESTILO_GRAFICO.mediana; ctx.fillRect(margen.izq, 6, 12, 10);
  ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText("días normales", margen.izq + 16, 11);
  ctx.fillStyle = ESTILO_GRAFICO.marca; ctx.fillRect(margen.izq + 110, 6, 12, 10);
  ctx.fillStyle = ESTILO_GRAFICO.texto; ctx.fillText("días de salto (fuera del umbral)", margen.izq + 126, 11);
  ctx.textAlign = "right";
  ctx.fillText("altura: √(número de días)", margen.izq + W, 11);
}
