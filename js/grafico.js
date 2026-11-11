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
  maxCaminosVisibles: 60,
};

function _percentil(ordenado, p) {
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
    p5[j] = _percentil(ord, 0.05);
    p50[j] = _percentil(ord, 0.5);
    p95[j] = _percentil(ord, 0.95);
  }
  return { p5, p50, p95 };
}

// opciones: { formato, historico: [precios], fechasHistorico: [fechas] }
function dibujarAbanico(canvas, caminos, opciones = {}, hoverIndice = null) {
  const o = { formato: (v) => v.toFixed(1), historico: [], fechasHistorico: [], ...opciones };
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

  const margen = { izq: 58, der: 14, arr: 26, aba: 26 };
  const W = ancho - margen.izq - margen.der;
  const H = alto - margen.arr - margen.aba;

  let yMin = Infinity, yMax = -Infinity;
  for (const v of hist) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
  for (let j = 0; j < nSim; j++) {
    if (bandas.p5[j] < yMin) yMin = bandas.p5[j];
    if (bandas.p95[j] > yMax) yMax = bandas.p95[j];
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

  // histórico real
  if (hist.length) {
    ctx.strokeStyle = ESTILO_GRAFICO.historico;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px(0), py(hist[0]));
    for (let k = 1; k < hist.length; k++) ctx.lineTo(px(k), py(hist[k]));
    ctx.stroke();
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
      texto = `día +${j} · p5 ${o.formato(bandas.p5[j])} · mediana ${o.formato(bandas.p50[j])} · p95 ${o.formato(bandas.p95[j])}`;
    }
    const anchoTexto = ctx.measureText(texto).width + 12;
    const tx = Math.min(Math.max(px(k) - anchoTexto / 2, margen.izq), margen.izq + W - anchoTexto);
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
