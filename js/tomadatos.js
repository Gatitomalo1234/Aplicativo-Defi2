// tomadatos.js — sección «Toma de datos»: el único lugar donde se bajan las series.
// - Series por modelo: menú con series recomendadas (y su «por qué»); el botón la baja
//   y la deja en uso en ese modelo. «Otro ticker…» lleva a «Bajar una serie».
// - Bajar una serie cualquiera de Yahoo, o cargar un CSV propio (regla del taller).
// - Series guardadas en datos/cache/: se abren sin internet.
// - Vista rápida: precio, retornos, cifras básicas y calidad; «Usar en…» y «Descargar CSV».
// Los módulos reciben la serie con usarSerieEn (app.js), que también la recuerda.

// Series recomendadas para cada modelo. Cada «por qué» sale de correr el aplicativo
// con esa serie (nov 2026): los números son aproximados y cambian con datos nuevos.
const SERIES_MODELO = [
  { prefijo: "gbm", nombre: "1 · Browniano geométrico", series: [
    { ticker: "NVDA", etiqueta: "NVIDIA · 3 años", anios: 3,
      porque: "Acción de volatilidad alta (σ ≈\u00a047\u00a0%). Con ella se construyó el módulo." },
    { ticker: "^GSPC", etiqueta: "S&P 500 · 5 años", anios: 5,
      porque: "Índice amplio: volatilidad mucho más baja (σ ≈\u00a017\u00a0%). Sirve para comparar con una acción sola." },
    { ticker: "AAPL", etiqueta: "Apple · 5 años", anios: 5,
      porque: "Acción grande y líquida, con volatilidad intermedia (σ ≈\u00a028\u00a0%)." },
    { ticker: "EC", etiqueta: "Ecopetrol (ADR) · 5 años", anios: 5,
      porque: "Acción colombiana que cotiza en Nueva York (σ ≈\u00a038\u00a0%)." },
  ] },
  { prefijo: "merton", nombre: "2 · Saltos de Merton", series: [
    { ticker: "NVDA", etiqueta: "NVIDIA · 3 años", anios: 3,
      porque: "Con ella se construyó el módulo: 9 días de salto con c\u00a0=\u00a03." },
    { ticker: "META", etiqueta: "Meta · 5 años", anios: 5,
      porque: "16 días de salto con c\u00a0=\u00a03 (λ̂ ≈\u00a03.2 al año)." },
    { ticker: "TSLA", etiqueta: "Tesla · 3 años", anios: 3,
      porque: "La más volátil de la lista (σ ≈\u00a058\u00a0%): 13 días de salto, λ̂ ≈\u00a04.4 al año." },
    { ticker: "^GSPC", etiqueta: "S&P 500 · 2006-09", desde: "2006-01-01", hasta: "2009-12-31",
      porque: "Crisis subprime: 22 días de salto en 4 años (λ̂ ≈\u00a05.5 al año)." },
  ] },
  { prefijo: "ou", nombre: "3 · Ornstein-Uhlenbeck", series: [
    { ticker: "^VIX", etiqueta: "VIX · 3 años", anios: 3,
      porque: "Índice de volatilidad: reversión rápida (vida media ≈\u00a07 días)." },
    { ticker: "^TNX", etiqueta: "Bono 10 años EE. UU. · 5 años", anios: 5,
      porque: "Tasa de interés, el uso clásico de OU (Vasicek). En esta ventana revierte lento (vida media ≈\u00a0118 días)." },
    { ticker: "^IRX", etiqueta: "Letra del Tesoro 13 semanas · 5 años", anios: 5,
      porque: "Tasa corta: pasó de casi 0\u00a0% a más de 5\u00a0% en 2022-23; reversión muy lenta (vida media ≈\u00a0230 días)." },
    { ticker: "COP=X", etiqueta: "TRM (peso/dólar) · 3 años", anios: 3,
      porque: "Tipo de cambio, como contraste: vida media ≈\u00a0159 días, una estimación poco precisa." },
  ] },
  { prefijo: "fbm", nombre: "4 · Browniano fraccional", series: [
    { ticker: "NVDA", etiqueta: "NVIDIA · 3 años", anios: 3,
      porque: "Ĥ ≈\u00a00.48: prácticamente sin memoria." },
    { ticker: "^GSPC", etiqueta: "S&P 500 · 10 años", anios: 10,
      porque: "Ĥ ≈\u00a00.41: algo antipersistente." },
    { ticker: "GLD", etiqueta: "Oro (GLD) · 10 años", anios: 10,
      porque: "Otro tipo de activo, una materia prima: Ĥ ≈\u00a00.47." },
    { ticker: "^VIX", etiqueta: "VIX · 10 años", anios: 10,
      porque: "Nivel antipersistente (Ĥ ≈\u00a00.37), coherente con la reversión que muestra OU." },
  ] },
  { prefijo: "manada", nombre: "5 · Manada", soloVista: true, nota: "en pausa: solo vista rápida", series: [
    { ticker: "GME", etiqueta: "GameStop · 2020-21", desde: "2020-06-01", hasta: "2021-06-30",
      porque: "La subida de enero de 2021." },
    { ticker: "AMC", etiqueta: "AMC · 2020-21", desde: "2020-06-01", hasta: "2021-07-31",
      porque: "Otra acción «meme» del mismo episodio." },
    { ticker: "^GSPC", etiqueta: "S&P 500 · 2006-09", desde: "2006-01-01", hasta: "2009-12-31",
      porque: "Crisis subprime." },
  ] },
];
const OTRO = "otro"; // última opción del menú: cualquier ticker, en «Bajar una serie»
const opcionModelo = {}; // prefijo -> opción elegida en su menú (se conserva al redibujar)

let serieEnVista = null;  // datos de la serie que muestra la vista rápida
let destinoDatos = null;  // módulo desde el que se llegó con «Elegir serie»

function estadoDatos(texto, clase = "") {
  const e = $("datos-estado");
  e.className = `estado ${clase}`.trim();
  e.textContent = texto;
}

const rangoTexto = (d) => `${d.fechas[0]} → ${d.fechas[d.fechas.length - 1]}`;

// ---- tarjetas de modelos ----
const porQue = (m, elegida) => elegida === OTRO
  ? "Escribe cualquier ticker de Yahoo Finance en «Bajar una serie» y luego «Usar en…»."
  : m.series[+elegida].porque;
const textoBoton = (m, elegida) => elegida === OTRO ? "Ir a «Bajar una serie»" : m.soloVista ? "Bajar y ver" : "Bajar y usar";
function pintarModelos() {
  $("datos-modelos").innerHTML = SERIES_MODELO.map((m) => {
    const enUso = SERIES_EN_USO[m.prefijo];
    const uso = m.soloVista
      ? `<span class="uso">${m.nota}</span>`
      : enUso
        ? `<span class="uso">en uso: <b>${enUso.ticker}</b> ${rangoTexto(enUso)}
             <button type="button" class="quitar-uso" data-soltar="${m.prefijo}">quitar</button></span>`
        : `<span class="uso">en uso: parámetros de ejemplo</span>`;
    const elegida = opcionModelo[m.prefijo] ?? "0";
    const opciones = m.series.map((s, i) =>
      `<option value="${i}"${String(i) === elegida ? " selected" : ""}>${s.etiqueta}</option>`).join("") +
      `<option value="${OTRO}"${elegida === OTRO ? " selected" : ""}>Otro ticker…</option>`;
    return `<div class="modelo-datos${destinoDatos === m.prefijo ? " destino" : ""}">
      <b>${m.nombre}</b>${uso}
      <select class="menu-serie" data-modelo="${m.prefijo}" aria-label="Serie recomendada para ${m.nombre}">${opciones}</select>
      <p class="por-que" id="porque-${m.prefijo}">${porQue(m, elegida)}</p>
      <button type="button" class="boton boton-principal boton-serie" data-modelo="${m.prefijo}">${textoBoton(m, elegida)}</button>
    </div>`;
  }).join("");
}

// ---- lista de series guardadas ----
async function refrescarGuardadas() {
  const caja = $("datos-guardadas");
  let series;
  try {
    series = await listarGuardados();
  } catch (e) {
    caja.innerHTML = `<p class="vacio">${e.message}</p>`;
    return;
  }
  if (!series.length) {
    caja.innerHTML = `<p class="vacio">Todavía no hay series guardadas. Baja una arriba o con los botones de cada modelo.</p>`;
    return;
  }
  caja.innerHTML = series.map((s) => {
    const usos = Object.entries(SERIES_EN_USO)
      .filter(([, d]) => d.archivo === s.archivo)
      .map(([p]) => `<i>${NOMBRES_MODULO[p]}</i>`).join("");
    const activa = serieEnVista && serieEnVista.archivo === s.archivo ? " activa" : "";
    const csv = /CSV/.test(s.fuente) ? `<i class="csv">CSV</i>` : "";
    return `<div class="fila-serie${activa}">
      <button type="button" class="fs-abrir" data-archivo="${s.archivo}">
        <span class="fs-ticker">${s.ticker}${csv}</span>
        <span class="fs-rango">${s.primera} → ${s.ultima} · ${s.n} precios</span>
        <span class="fs-consulta">consultada ${s.consultado}</span>
      </button>
      <span class="fs-usos">${usos}</span>
      <button type="button" class="fs-borrar" data-borrar="${s.archivo}" data-ticker="${s.ticker}"
        title="Borrar esta copia del computador" aria-label="Borrar ${s.ticker} ${s.primera} a ${s.ultima}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>
      </button>
    </div>`;
  }).join("");
}

// ---- vista rápida ----
function mostrarVista(datos) {
  serieEnVista = datos;
  const r = logRetornos(datos.precios);
  const n = r.length;
  const media = r.reduce((a, b) => a + b, 0) / n;
  const s = Math.sqrt(r.reduce((a, b) => a + (b - media) ** 2, 0) / Math.max(n - 1, 1));
  let iMin = 0, iMax = 0;
  r.forEach((x, i) => { if (x < r[iMin]) iMin = i; if (x > r[iMax]) iMax = i; });

  $("datos-vista").hidden = false;
  $("datos-vista-titulo").textContent = `Vista rápida · ${datos.ticker}`;
  $("datos-vista-rango").textContent = `${rangoTexto(datos)} · ${datos.precios.length} precios · ${datos.fuente}`;
  $("datos-vista-calidad").textContent = resumenCalidad(datos);
  const ultimo = datos.precios[datos.precios.length - 1];
  pintarFichas("datos", [
    { etiqueta: "último precio", valor: formatoPrecio(ultimo), nota: datos.fechas[datos.fechas.length - 1] },
    { etiqueta: "volatilidad anual", valor: pct(s * Math.sqrt(DIAS_HABILES)), nota: "s · √252" },
    { etiqueta: "peor día", valor: pct(r[iMin]), nota: datos.fechas[iMin + 1] },
    { etiqueta: "mejor día", valor: pct(r[iMax]), nota: datos.fechas[iMax + 1] },
  ]);
  dibujarVista();
  pintarBotonesUsar();
  refrescarGuardadas();
}

function dibujarVista() {
  if (!serieEnVista) return;
  dibujarLinea($("datos-linea"), serieEnVista.fechas, serieEnVista.precios, formatoPrecio);
  dibujarHistograma($("datos-hist"), logRetornos(serieEnVista.precios));
}

function pintarBotonesUsar() {
  // OU está pensado para niveles: si la serie es (o puede ser) un precio, su botón se
  // marca y debajo aparece la recomendación con las series sugeridas para OU
  const aviso = serieEnVista ? avisoOU(serieEnVista) : null;
  $("datos-usar").innerHTML = Object.entries(NOMBRES_MODULO).map(([p, nombre]) => {
    const enUso = SERIES_EN_USO[p] && serieEnVista && SERIES_EN_USO[p].archivo === serieEnVista.archivo;
    const marcado = p === "ou" && aviso;
    const titulo = enUso ? `Clic para que ${nombre} deje de usar esta serie`
      : marcado ? "Se puede usar, pero OU está pensado para niveles (ver la recomendación abajo)"
      : `Usar esta serie en ${nombre}`;
    return `<button type="button" class="boton${enUso ? " en-uso" : ""}${marcado ? " con-aviso" : ""}" data-usar="${p}"
      title="${titulo}">${enUso ? "✓ " : marcado ? "⚠ " : ""}${nombre}</button>`;
  }).join("");

  const caja = $("datos-usar-aviso");
  caja.hidden = !aviso;
  if (aviso) {
    const ou = SERIES_MODELO.find((m) => m.prefijo === "ou");
    caja.innerHTML = `<p><b>Para OU:</b> ${aviso.replace(/^Ojo: /, "")}</p>
      <p class="recomendadas"><span>Recomendadas para OU:</span>${ou.series.map((s, i) =>
        `<button type="button" class="chip-rec" data-rec="${i}">${s.etiqueta}</button>`).join("")}</p>`;
  }
}

// manda la serie de la vista (o una recién bajada) a un módulo
function asignar(prefijo, datos) {
  try {
    usarSerieEn(prefijo, datos);
    const aviso = prefijo === "ou" ? avisoOU(datos) : null;
    estadoDatos(`${datos.ticker} quedó en uso en ${NOMBRES_MODULO[prefijo]}.${aviso ? " " + aviso : ""}`, aviso ? "aviso" : "");
  } catch (e) {
    estadoDatos(e.message, "error");
  }
  pintarModelos();
  pintarBotonesUsar();
  refrescarGuardadas();
}

// el módulo deja de usar su serie y vuelve a los parámetros de ejemplo
function quitar(prefijo) {
  soltarSerie(prefijo);
  estadoDatos(`${NOMBRES_MODULO[prefijo]} ya no usa ninguna serie: volvió a los parámetros de ejemplo.`);
  pintarModelos();
  pintarBotonesUsar();
  refrescarGuardadas();
}

// borra una copia guardada; los módulos que la usaban vuelven a los parámetros de ejemplo
function borrarSerie(archivo, ticker) {
  const usan = Object.entries(SERIES_EN_USO).filter(([, d]) => d.archivo === archivo).map(([p]) => p);
  const aviso = usan.length
    ? `\n\nLa usa${usan.length > 1 ? "n" : ""} ${usan.map((p) => NOMBRES_MODULO[p]).join(", ")}: volverá${usan.length > 1 ? "n" : ""} a los parámetros de ejemplo.`
    : "";
  if (!confirm(`¿Borrar del computador la copia guardada de ${ticker}?${aviso}\n\nSe puede volver a bajar después (con internet).`)) return;
  ocupado(async () => {
    try {
      await borrarGuardado(archivo);
      usan.forEach((p) => soltarSerie(p));
      if (serieEnVista && serieEnVista.archivo === archivo) {
        serieEnVista = null;
        $("datos-vista").hidden = true;
      }
      estadoDatos(`Se borró la copia guardada de ${ticker}.`);
      pintarModelos();
      await refrescarGuardadas();
    } catch (e) {
      estadoDatos(e.message, "error");
    }
  });
}

// bloquea los botones mientras se espera al servidor
async function ocupado(tarea) {
  const botones = document.querySelectorAll("#datos button");
  botones.forEach((b) => (b.disabled = true));
  try { await tarea(); } finally { botones.forEach((b) => (b.disabled = false)); }
}

async function bajar(ticker, desde, hasta, prefijo = null) {
  estadoDatos(`Bajando ${ticker.toUpperCase()} desde Yahoo Finance…`);
  try {
    const datos = await cargarHistorico(ticker, desde, hasta);
    estadoDatos(datos.aviso || `${datos.ticker}: ${datos.precios.length} precios (${datos.fuente}). Quedó guardada en el computador.`,
      datos.aviso ? "aviso" : "");
    mostrarVista(datos);
    if (prefijo) asignar(prefijo, datos);
    $("datos-vista").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    estadoDatos(e.message, "error");
  }
}

MODULOS.datos = {
  dibujar() {
    pintarModelos();
    refrescarGuardadas();
    dibujarVista();
  },
  conectar() {
    $("datos-desde").value = haceAnios(3);
    $("datos-hasta").value = fechaISO(new Date());
    pintarModelos();

    // los botones «Elegir serie» de cada módulo marcan el modelo de destino
    document.querySelectorAll("a[data-para]").forEach((a) => {
      a.addEventListener("click", () => { destinoDatos = a.dataset.para; });
    });

    // menú de cada modelo: al cambiar la opción, se actualizan el «por qué» y el botón
    $("datos-modelos").addEventListener("change", (ev) => {
      const sel = ev.target.closest(".menu-serie");
      if (!sel) return;
      const m = SERIES_MODELO.find((x) => x.prefijo === sel.dataset.modelo);
      opcionModelo[m.prefijo] = sel.value;
      $(`porque-${m.prefijo}`).textContent = porQue(m, sel.value);
      sel.parentElement.querySelector(".boton-serie").textContent = textoBoton(m, sel.value);
    });

    // botón de cada modelo: bajar la serie elegida, mostrarla y dejarla en uso
    $("datos-modelos").addEventListener("click", (ev) => {
      const b = ev.target.closest(".boton-serie");
      if (!b) return;
      const m = SERIES_MODELO.find((x) => x.prefijo === b.dataset.modelo);
      const elegida = opcionModelo[m.prefijo] ?? "0";
      if (elegida === OTRO) {
        destinoDatos = m.soloVista ? null : m.prefijo;
        $("datos-form").scrollIntoView({ behavior: "smooth", block: "center" });
        $("datos-ticker").focus();
        $("datos-ticker").select();
        return;
      }
      const s = m.series[+elegida];
      const desde = s.desde || haceAnios(s.anios);
      const hasta = s.hasta || fechaISO(new Date());
      ocupado(() => bajar(s.ticker, desde, hasta, m.soloVista ? null : m.prefijo));
    });

    $("datos-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      ocupado(() => bajar($("datos-ticker").value.trim(), $("datos-desde").value, $("datos-hasta").value));
    });

    $("datos-csv-archivo").addEventListener("change", () => {
      const f = $("datos-csv-archivo").files[0];
      $("datos-csv-elegido").textContent = f ? f.name : "Elegir archivo…";
    });

    $("datos-csv-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const archivo = $("datos-csv-archivo").files[0];
      const nombre = $("datos-csv-nombre").value.trim();
      if (!archivo) return estadoDatos("Elige un archivo CSV.", "error");
      ocupado(async () => {
        try {
          const tabla = leerCSV(await archivo.text());
          const datos = await importarSerie(nombre || archivo.name.replace(/\.csv$/i, "").slice(0, 20), archivo.name, tabla);
          const d = datos.calidad.descartes;
          estadoDatos(`CSV «${archivo.name}» (columna «${tabla.columna}»): ${datos.precios.length} precios válidos; ` +
            `descartados ${d.duplicados + d.faltantes + d.no_positivos}. Quedó guardado como ${datos.ticker}.`);
          mostrarVista(datos);
        } catch (e) {
          estadoDatos(e.message, "error");
        }
      });
    });

    $("datos-guardadas").addEventListener("click", (ev) => {
      const borrar = ev.target.closest("[data-borrar]");
      if (borrar) return borrarSerie(borrar.dataset.borrar, borrar.dataset.ticker);
      const b = ev.target.closest(".fs-abrir");
      if (!b) return;
      ocupado(async () => {
        try {
          mostrarVista(await cargarGuardado(b.dataset.archivo));
        } catch (e) {
          estadoDatos(e.message, "error");
        }
      });
    });

    $("datos-usar").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-usar]");
      if (!b || !serieEnVista) return;
      const p = b.dataset.usar;
      if (SERIES_EN_USO[p] && SERIES_EN_USO[p].archivo === serieEnVista.archivo) quitar(p);
      else asignar(p, serieEnVista);
    });

    // «quitar» en la tarjeta de un modelo
    $("datos-modelos").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-soltar]");
      if (b) quitar(b.dataset.soltar);
    });

    // recomendación bajo «Usar en»: baja la serie sugerida y la deja en uso en OU
    $("datos-usar-aviso").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-rec]");
      if (!b) return;
      const ou = SERIES_MODELO.find((m) => m.prefijo === "ou");
      const s = ou.series[+b.dataset.rec];
      opcionModelo.ou = b.dataset.rec; // el menú de OU queda en esa opción
      ocupado(() => bajar(s.ticker, s.desde || haceAnios(s.anios), s.hasta || fechaISO(new Date()), "ou"));
    });

    $("datos-csv-bajar").addEventListener("click", () => {
      if (serieEnVista) exportarCSV(serieEnVista);
    });
  },
};
