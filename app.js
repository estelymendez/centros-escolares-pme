/* ============================================================
   Instrumento de consulta de Centros Escolares del PME
   Fuente: hoja oficial de Google Sheets (MINED)
   ============================================================ */

// --- Configuración de la fuente de datos ---------------------
const SHEET_ID = "1eGhVmPfOJcP57_LXYZZu4Z4TFWnrir8ow4zgbCSW_D4";
const SHEET_GID = "912175684";
// Exportación CSV pública de la hoja (permite fetch() desde cualquier
// origen porque Google entrega encabezado CORS "*" en este endpoint).
const DATA_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
const CACHE_KEY = "pme_centros_escolares_cache_v1";

// Etiquetas legibles para cada columna de la hoja (en el orden en que
// se mostrarán en el panel de detalle). Cualquier columna que no esté
// aquí pero tenga contenido en la hoja también se mostrará, con su
// encabezado original como etiqueta.
//
// NOTA sobre columnas repetidas: esta hoja tiene dos columnas llamadas
// "CÓD CE" y dos llamadas "ZONA" (Google Sheets lo permite, pero un mismo
// nombre de columna repetido causaría que la segunda pisara a la primera).
// Para evitar esa pérdida de datos, parseCsv() renombra automáticamente la
// segunda aparición de cualquier encabezado repetido agregándole " (2)".
// Por eso más abajo se hace referencia a "CÓD CE (2)" y "ZONA (2)".
const FIELD_LABELS = {
  "CÓD CE": "Código de centro escolar",
  "CÓD CE (2)": "Código de centro escolar (repetido en la hoja)",
  "NOMBRE CE": "Nombre del centro escolar",
  "DIRECCION": "Dirección",
  "TOTAL MATRICULA P": "Matrícula total",
  "mat 2026": "Matrícula 2026",
  "LATITUD": "Latitud",
  "LONGITUD": "Longitud",
  "CÓDIGO DEPTO": "Código de departamento",
  "NOMBRE DEPTO": "Departamento",
  "MUNICIPIO": "Municipio",
  "CÓDIGO DISTRITO": "Código de distrito",
  "NOMBRE DISTRITO": "Distrito",
  "PROPIEDAD": "Propiedad / propietario",
  "ALQUILADA": "Sede alquilada",
  "TIPO DE SEDE": "Tipo de sede",
  "DESCRIPCION TIPO": "Descripción del tipo",
  "CLASIFICACION": "Clasificación",
  "SUBVENCIONADA": "Subvencionada",
  "SECTOR": "Sector",
  "ZONA": "Región",
  "ZONA (2)": "Zona",
  "TURNO": "Turno",
  "MODALIDAD": "Modalidad",
  "SECCIONES": "Secciones",
  "DOCENTES": "Docentes",
  "AULAS": "Aulas",
  "INTERVENCION": "Intervención",
  "ESTATUS INTERVENCION": "Estatus de intervención",
  "RED INTERNA": "Red interna",
  "ESTATUS RED": "Estatus de la red",
  "ELECTRICIDAD": "Electricidad",
  "MOVISTAR": "Movistar",
  "STARLINK": "Starlink",
  "INAUGURACIONES": "Inauguraciones",
  "ESCALADA": "Escalada",
  "FASE": "Fase",
  "GRUPO (BLOQUE)": "Grupo",
  "SUBGRUPO": "Subgrupo",
  "GRUPO2": "Grupo 2",
   "COORDENADAS": "Coordenadas",
};

// Orden preferido de despliegue en el panel de detalle.
const DETAIL_ORDER = [
  "NOMBRE CE", "CÓD CE", "GRUPO (BLOQUE)", "DIRECCION", "NOMBRE DEPTO", "MUNICIPIO",
  "NOMBRE DISTRITO", "TOTAL MATRICULA P", "mat 2026", "SECCIONES",
  "DOCENTES", "AULAS", "TURNO", "MODALIDAD", "ZONA (2)", "ZONA", "SECTOR",
  "CLASIFICACION", "TIPO DE SEDE", "DESCRIPCION TIPO", "PROPIEDAD",
  "ALQUILADA", "SUBVENCIONADA", "ESTATUS INTERVENCION", "INTERVENCION",
  "RED INTERNA", "ESTATUS RED", "ELECTRICIDAD", "MOVISTAR", "STARLINK",
  "INAUGURACIONES", "LATITUD", "LONGITUD", "ESCALADA", "FASE",
  "SUBGRUPO", "GRUPO2", "CÓDIGO DEPTO", "CÓDIGO DISTRITO",
];

// Campos usados para la búsqueda de texto libre.
const SEARCH_FIELDS = ["NOMBRE CE", "CÓD CE", "DIRECCION", "MUNICIPIO", "NOMBRE DEPTO"];

// Columnas que NO deben mostrarse en el panel de detalle de cada centro
// escolar. Agregue aquí, entre comillas y separado por comas, el nombre
// EXACTO de la columna tal como aparece en la hoja de Google Sheets
// (respetando mayúsculas y tildes; si la columna está repetida en la hoja,
// use el nombre con el sufijo " (2)" que agrega parseCsv()). Ejemplo:
// const HIDDEN_FIELDS = ["CÓDIGO DISTRITO"];
const HIDDEN_FIELDS = ["CÓD CE (2)", "mat 2026", "TIPO DE SEDE", "DESCRIPCION TIPO",
                      "ESCALADA", "CÓDIGO DEPTO", "CÓDIGO DISTRITO", "ARK", "CAF",
                       "EVALUACION", "CAF intervenc", "LXP", "KIRA", "CHK", "XAI", "chk", 
                       "MOVISTAR", "STARLINK"
                      ];

// --- Estado global ---------------------------------------------
let allSchools = [];
let filteredSchools = [];
let map, markerClusterGroup;
let markersById = new Map();
let activeSchoolId = null;

// Definición de los filtros de selección múltiple (Departamento, Distrito,
// Región, Grupo y Fase). Cada uno permite elegir una, varias o todas las
// opciones mediante casillas de verificación. `sort` es opcional; si no se
// indica, se usa el orden alfabético normal (localeCompare en español). El
// filtro de Grupo usa `naturalCompare` para que "B10" no quede antes que
// "B2" (orden natural/numérico: B1, B2, ..., B9, B10, B11, ..., B16).
const FILTER_DEFS = [
  { name: "depto", fieldKey: "NOMBRE DEPTO", baseId: "filter-depto", allLabel: "Todos los departamentos", noneLabel: "Ningún departamento" },
  { name: "distrito", fieldKey: "NOMBRE DISTRITO", baseId: "filter-distrito", allLabel: "Todos los distritos", noneLabel: "Ningún distrito" },
  { name: "region", fieldKey: "ZONA", baseId: "filter-region", allLabel: "Todas las regiones", noneLabel: "Ninguna región" },
  { name: "grupo", fieldKey: "GRUPO (BLOQUE)", baseId: "filter-grupo", allLabel: "Todo grupo", noneLabel: "Ningún grupo", sort: naturalCompare },
  { name: "fase", fieldKey: "FASE", baseId: "filter-fase", allLabel: "Toda fase", noneLabel: "Ninguna fase" },
];

// Se llena en initMultiselects(): filters["depto"], filters["distrito"], etc.
// Cada entrada tiene forma { def, values: [...], selected: null|Set, els: {...} }.
// `selected === null` significa "todos" (sin filtrar); un Set con valores
// concretos significa que el usuario eligió una o varias opciones puntuales.
let filters = {};

// --- Elementos del DOM -------------------------------------------
const els = {
  refreshBtn: document.getElementById("refresh-btn"),
  statusText: document.getElementById("status-text"),
  searchInput: document.getElementById("search-input"),
  exportFilteredBtn: document.getElementById("export-filtered-btn"),
  exportAllBtn: document.getElementById("export-all-btn"),
  resultsCount: document.getElementById("results-count"),
  schoolList: document.getElementById("school-list"),
  detailPanel: document.getElementById("detail-panel"),
  detailContent: document.getElementById("detail-content"),
  closeDetail: document.getElementById("close-detail"),
};

// ------------------------------------------------------------------
// Inicialización del mapa
// ------------------------------------------------------------------
function initMap() {
  map = L.map("map", { zoomControl: true }).setView([13.7942, -88.8965], 9); // El Salvador
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  markerClusterGroup = L.markerClusterGroup({ maxClusterRadius: 45, chunkedLoading: true });
  map.addLayer(markerClusterGroup);
}

// ------------------------------------------------------------------
// Descarga y procesamiento de datos
// ------------------------------------------------------------------
async function fetchSchoolData() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo consultar la fuente oficial (HTTP ${res.status})`);
  const csvText = await res.text();
  return parseCsv(csvText);
}

function parseCsv(csvText) {
  // Se parsea sin "header: true" porque esta hoja tiene encabezados
  // repetidos (por ejemplo, dos columnas llamadas "CÓD CE" y dos llamadas
  // "ZONA" con significados distintos). Con "header: true", Papa Parse
  // crearía un objeto por fila usando el nombre de columna como llave, y la
  // segunda columna repetida pisaría silenciosamente a la primera. Para
  // evitarlo, se deduplican los encabezados a mano antes de armar los
  // objetos: la primera aparición conserva su nombre y las siguientes se
  // renombran agregando " (2)", " (3)", etc.
  const parsed = Papa.parse(csvText, { header: false, skipEmptyLines: true });
  const allRows = parsed.data;
  if (!allRows.length) return [];

  const rawHeaders = allRows[0].map((h) => (h ?? "").toString().trim());
  const seenCount = {};
  const headers = rawHeaders.map((h) => {
    if (!h) return h;
    seenCount[h] = (seenCount[h] || 0) + 1;
    return seenCount[h] === 1 ? h : `${h} (${seenCount[h]})`;
  });

  const dataRows = allRows.slice(1);
  const schools = [];
  dataRows.forEach((rowArr, idx) => {
    const clean = {};
    headers.forEach((key, colIdx) => {
      if (!key) return; // columna sin encabezado
      const value = (rowArr[colIdx] ?? "").toString().trim();
      clean[key] = value;
    });

    const codigo = clean["CÓD CE"];
    const nombre = clean["NOMBRE CE"];
    // Descarta filas vacías, incompletas, o basura residual de la hoja
    // (por ejemplo, alguna fila de referencia/prueba cuyo "nombre" es solo
    // un número, sin ninguna letra, lo cual nunca ocurre en un nombre real
    // de centro escolar).
    if (!codigo || !nombre) return;
    if (!/[a-zA-ZÁÉÍÓÚÑÜáéíóúñü]/.test(nombre)) return;

    let lat = parseFloat(clean["LATITUD"]);
    let lon = parseFloat(clean["LONGITUD"]);
    // El Salvador está aproximadamente entre lat 13.0–14.6 y lon -90.3 a
    // -87.5. Si una coordenada cae muy fuera de ese rango, probablemente es
    // un error de captura en la hoja; se descarta la coordenada (el centro
    // sigue apareciendo en el listado, solo no se grafica en el mapa).
    if (!(lat >= 12.5 && lat <= 15) || !(lon >= -91 && lon <= -87)) {
      lat = NaN;
      lon = NaN;
    }

    // Se excluyen del instrumento los centros que no tienen un grupo
    // asignado en la hoja (no forman parte de ningún grupo de
    // intervención/construcción). Si en el futuro se quiere volver a
    // incluirlos, basta con cambiar este "return" por la línea de abajo,
    // comentada, que los mostraría con la etiqueta "Sin grupo".
    if (!clean["GRUPO (BLOQUE)"]) return;
    // if (!clean["GRUPO (BLOQUE)"]) clean["GRUPO (BLOQUE)"] = "Sin grupo";
    if (!clean["SUBGRUPO"]) clean["SUBGRUPO"] = "Sin subgrupo";

    schools.push({
      id: `${codigo}-${idx}`,
      codigo,
      nombre,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      fields: clean,
    });
  });

  return schools;
}

// ------------------------------------------------------------------
// Carga principal (usada al iniciar y al presionar Actualizar)
// ------------------------------------------------------------------
async function loadData(isManualRefresh) {
  setLoading(true, isManualRefresh);
  try {
    const schools = await fetchSchoolData();
    if (!schools.length) throw new Error("La fuente respondió sin datos utilizables.");
    allSchools = schools;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ schools, ts: Date.now() }));
    } catch (e) { /* almacenamiento no disponible; se ignora */ }

    populateFilterOptions(schools);
    applyFilters();
    plotAllMarkers(schools);
    setStatus(`Datos actualizados · ${schools.length.toLocaleString("es-SV")} centros escolares · ${formatTimestamp(Date.now())}`);
  } catch (err) {
    console.error(err);
    const cached = loadFromCache();
    if (cached && cached.schools.length) {
      allSchools = cached.schools;
      populateFilterOptions(allSchools);
      applyFilters();
      plotAllMarkers(allSchools);
      setStatus(`No se pudo consultar la fuente oficial ahora. Mostrando la última copia guardada (${formatTimestamp(cached.ts)}).`, true);
    } else {
      setStatus(`Error al consultar la fuente oficial: ${err.message}`, true);
    }
  } finally {
    setLoading(false, isManualRefresh);
  }
}

function loadFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  return d.toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" });
}

function setStatus(msg, isError) {
  els.statusText.textContent = msg;
  els.statusText.style.color = isError ? "#ffd7d7" : "#cfe3f4";
}

function setLoading(loading, isManualRefresh) {
  els.refreshBtn.disabled = loading;
  const svg = els.refreshBtn.querySelector("svg");
  if (svg) svg.classList.toggle("spin", loading);
  if (loading) setStatus(isManualRefresh ? "Consultando la fuente oficial…" : "Cargando datos…");
}

// ------------------------------------------------------------------
// Filtros
// ------------------------------------------------------------------

// Comparador "natural": separa cada valor en tramos de dígitos y de texto,
// y compara los tramos numéricos como números en vez de como texto. Así
// "B10" queda después de "B9" en vez de entre "B1" y "B2" (que es lo que
// pasaría con un orden alfabético normal). Se usa para el filtro de Grupo:
// B1, B2, B3, ..., B9, B10, B11, ..., B16.
function naturalCompare(a, b) {
  const re = /(\d+)|(\D+)/g;
  const ax = String(a).match(re) || [];
  const bx = String(b).match(re) || [];
  const len = Math.max(ax.length, bx.length);
  for (let i = 0; i < len; i++) {
    const av = ax[i] ?? "";
    const bv = bx[i] ?? "";
    const an = /^\d+$/.test(av);
    const bn = /^\d+$/.test(bv);
    if (an && bn) {
      const diff = parseInt(av, 10) - parseInt(bv, 10);
      if (diff !== 0) return diff;
    } else {
      const cmp = av.localeCompare(bv, "es");
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

function uniqueSorted(schools, fieldKey, compareFn) {
  const set = new Set();
  schools.forEach((s) => {
    const v = s.fields[fieldKey];
    if (v) set.add(v);
  });
  return Array.from(set).sort(compareFn || ((a, b) => a.localeCompare(b, "es")));
}

// ------------------------------------------------------------------
// Filtros de selección múltiple (una, varias o todas las opciones)
// ------------------------------------------------------------------

// Crea el estado y conecta los eventos de los cinco filtros (Departamento,
// Distrito, Región, Grupo y Fase). Se llama una sola vez, al arrancar.
function initMultiselects() {
  filters = {};
  FILTER_DEFS.forEach((def) => {
    const filterEls = {
      toggle: document.getElementById(`${def.baseId}-toggle`),
      label: document.getElementById(`${def.baseId}-label`),
      panel: document.getElementById(`${def.baseId}-panel`),
      all: document.getElementById(`${def.baseId}-all`),
      options: document.getElementById(`${def.baseId}-options`),
    };
    const f = { def, values: [], selected: null, els: filterEls };
    filters[def.name] = f;

    filterEls.toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      filterEls.panel.classList.toggle("hidden");
    });
    filterEls.all.addEventListener("change", () => {
      f.selected = filterEls.all.checked ? null : new Set();
      renderMultiselectOptions(f);
      onFilterChanged(f);
    });
  });

  // Cierra cualquier panel abierto al hacer clic fuera de él.
  document.addEventListener("click", (e) => {
    Object.values(filters).forEach((f) => {
      if (!f.els.panel.classList.contains("hidden") && !e.target.closest(`#${f.def.baseId}`)) {
        f.els.panel.classList.add("hidden");
      }
    });
  });
}

function renderMultiselectOptions(f) {
  f.els.options.innerHTML = "";
  f.values.forEach((v) => {
    const checked = f.selected === null || f.selected.has(v);
    const label = document.createElement("label");
    label.className = "multiselect-option";
    label.innerHTML = `<input type="checkbox" value="${escapeHtml(v)}" ${checked ? "checked" : ""}><span>${escapeHtml(v)}</span>`;
    label.querySelector("input").addEventListener("change", (e) => onOptionToggle(f, v, e.target.checked));
    f.els.options.appendChild(label);
  });
  updateAllCheckbox(f);
  updateFilterLabel(f);
}

function onOptionToggle(f, value, checked) {
  // Si venía de "todos" (null), se convierte en un conjunto explícito con
  // todos los valores actuales antes de aplicar el cambio puntual.
  if (f.selected === null) f.selected = new Set(f.values);
  if (checked) f.selected.add(value);
  else f.selected.delete(value);
  if (f.selected.size === f.values.length) f.selected = null; // vuelve a "todos"
  updateAllCheckbox(f);
  updateFilterLabel(f);
  onFilterChanged(f);
}

function updateAllCheckbox(f) {
  const allSelected = f.selected === null;
  f.els.all.checked = allSelected;
  f.els.all.indeterminate = !allSelected && f.selected.size > 0;
}

function updateFilterLabel(f) {
  if (f.selected === null) {
    f.els.label.textContent = f.def.allLabel;
  } else if (f.selected.size === 0) {
    f.els.label.textContent = f.def.noneLabel;
  } else if (f.selected.size === 1) {
    f.els.label.textContent = Array.from(f.selected)[0];
  } else {
    f.els.label.textContent = `${f.selected.size} seleccionados`;
  }
}

// Reemplaza la lista de opciones disponibles de un filtro (por ejemplo, al
// cargar datos nuevos, o al re-acotar Distrito según el Departamento
// elegido). Si había una selección puntual (no "todos"), se conserva
// quitando los valores que ya no existan; si con eso no queda ninguno, se
// vuelve a "todos" (igual que se hacía antes solo para Grupo).
function setFilterValues(f, newValues) {
  if (f.selected !== null) {
    const kept = new Set(Array.from(f.selected).filter((v) => newValues.includes(v)));
    f.selected = kept.size > 0 ? kept : null;
  }
  f.values = newValues;
  renderMultiselectOptions(f);
}

function matchesFilter(f, value) {
  if (f.selected === null) return true;
  return f.selected.has(value);
}

function onFilterChanged(f) {
  // Departamento y Distrito están enlazados en un solo sentido: elegir uno o
  // varios departamentos acota las opciones de Distrito a las que
  // pertenecen a esos departamentos. (No se hace al revés porque, al
  // permitir selección múltiple en ambos filtros, "autoseleccionar" el
  // departamento correspondiente a cada distrito elegido dejaría de tener
  // un resultado único y sería confuso).
  if (f.def.name === "depto") {
    updateDistritoOptionsForDepto();
  }
  applyFilters();
}

function updateDistritoOptionsForDepto() {
  const deptoFilter = filters.depto;
  const distritoFilter = filters.distrito;
  const scoped = deptoFilter.selected === null
    ? allSchools
    : allSchools.filter((s) => deptoFilter.selected.has(s.fields["NOMBRE DEPTO"]));
  setFilterValues(distritoFilter, uniqueSorted(scoped, "NOMBRE DISTRITO"));
}

function populateFilterOptions(schools) {
  setFilterValues(filters.depto, uniqueSorted(schools, "NOMBRE DEPTO"));
  updateDistritoOptionsForDepto();
  setFilterValues(filters.region, uniqueSorted(schools, "ZONA"));
  setFilterValues(filters.grupo, uniqueSorted(schools, "GRUPO (BLOQUE)", naturalCompare));
  setFilterValues(filters.fase, uniqueSorted(schools, "FASE"));
}

function applyFilters() {
  const q = els.searchInput.value.trim().toLowerCase();

  filteredSchools = allSchools.filter((s) => {
    if (!matchesFilter(filters.depto, s.fields["NOMBRE DEPTO"])) return false;
    if (!matchesFilter(filters.distrito, s.fields["NOMBRE DISTRITO"])) return false;
    if (!matchesFilter(filters.region, s.fields["ZONA"])) return false;
    if (!matchesFilter(filters.grupo, s.fields["GRUPO (BLOQUE)"])) return false;
    if (!matchesFilter(filters.fase, s.fields["FASE"])) return false;
    if (q) {
      const haystack = SEARCH_FIELDS.map((f) => (s.fields[f] || "")).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  renderList(filteredSchools);
  updateMapVisibility(filteredSchools);
  els.resultsCount.textContent = `${filteredSchools.length.toLocaleString("es-SV")} de ${allSchools.length.toLocaleString("es-SV")} centros escolares`;
}

// ------------------------------------------------------------------
// Exportar a Excel
// ------------------------------------------------------------------
// Columnas a incluir en el archivo exportado: las mismas que se ven en el
// panel de detalle (DETAIL_ORDER, sin las que están en HIDDEN_FIELDS), más
// cualquier otra columna de la hoja que no esté oculta explícitamente
// (para no dejar fuera algo nuevo que aparezca en la fuente oficial).
function getExportColumns() {
  const cols = [];
  const seen = new Set();
  DETAIL_ORDER.forEach((key) => {
    if (HIDDEN_FIELDS.includes(key)) return;
    cols.push(key);
    seen.add(key);
  });
  const extra = new Set();
  allSchools.forEach((s) => {
    Object.keys(s.fields).forEach((key) => {
      if (!seen.has(key) && !HIDDEN_FIELDS.includes(key)) extra.add(key);
    });
  });
  cols.push(...Array.from(extra).sort((a, b) => a.localeCompare(b, "es")));
  return cols;
}

function exportToExcel(schools, filename) {
  if (!schools.length) {
    alert("No hay centros escolares para exportar con los filtros actuales.");
    return;
  }
  // Si la librería que arma el archivo Excel (SheetJS, cargada desde un
  // CDN en index.html) no llegó a cargar -por ejemplo, por una conexión
  // lenta, un bloqueador de contenido, o porque falta la línea <script>
  // correspondiente en index.html- antes esto fallaba en silencio (no
  // pasaba nada visible). Ahora se avisa explícitamente en pantalla.
  if (typeof XLSX === "undefined") {
    alert(
      "No se pudo generar el Excel porque no cargó la librería necesaria (SheetJS).\n\n" +
      "Revisa tu conexión a internet y recarga la página. Si el problema persiste, " +
      "confirma que index.html incluya la línea:\n" +
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>\n' +
      "justo antes de <script src=\"app.js\"></script>."
    );
    return;
  }
  try {
    const cols = getExportColumns();
    const header = cols.map((key) => FIELD_LABELS[key] || key);
    const rows = schools.map((s) => cols.map((key) => s.fields[key] || ""));
    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Centros escolares");
    XLSX.writeFile(workbook, filename);
  } catch (err) {
    console.error(err);
    alert(`No se pudo generar el Excel: ${err.message}`);
  }
}

function dateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

// ------------------------------------------------------------------
// Listado
// ------------------------------------------------------------------
const LIST_RENDER_LIMIT = 400; // por rendimiento, se pagina la lista visual

function renderList(schools) {
  els.schoolList.innerHTML = "";
  const toRender = schools.slice(0, LIST_RENDER_LIMIT);
  const frag = document.createDocumentFragment();

  toRender.forEach((s) => {
    const item = document.createElement("div");
    item.className = "school-item" + (s.id === activeSchoolId ? " active" : "");
    item.dataset.id = s.id;
    item.innerHTML = `
      <div class="name">${escapeHtml(s.nombre)}</div>
      <div class="meta"><span class="code">${escapeHtml(s.codigo)}</span>${escapeHtml(s.fields["MUNICIPIO"] || "")}, ${escapeHtml(s.fields["NOMBRE DEPTO"] || "")}</div>
    `;
    item.addEventListener("click", () => selectSchool(s.id, true));
    frag.appendChild(item);
  });
  els.schoolList.appendChild(frag);

  if (schools.length > LIST_RENDER_LIMIT) {
    const more = document.createElement("div");
    more.className = "results-count";
    more.style.padding = "10px 14px";
    more.textContent = `Mostrando los primeros ${LIST_RENDER_LIMIT.toLocaleString("es-SV")} resultados. Use la búsqueda o los filtros para acotar.`;
    els.schoolList.appendChild(more);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ------------------------------------------------------------------
// Mapa: marcadores
// ------------------------------------------------------------------
function plotAllMarkers(schools) {
  markerClusterGroup.clearLayers();
  markersById = new Map();

  schools.forEach((s) => {
    if (s.lat === null || s.lon === null) return;
    const marker = L.marker([s.lat, s.lon]);
    marker.bindPopup(buildPopupHtml(s));
    marker.on("click", () => selectSchool(s.id, false));
    marker.__schoolId = s.id;
    markersById.set(s.id, marker);
  });

  updateMapVisibility(filteredSchools.length ? filteredSchools : schools);
}

function updateMapVisibility(visibleSchools) {
  if (!markerClusterGroup) return;
  markerClusterGroup.clearLayers();
  const visibleIds = new Set(visibleSchools.map((s) => s.id));
  const toAdd = [];
  markersById.forEach((marker, id) => {
    if (visibleIds.has(id)) toAdd.push(marker);
  });
  markerClusterGroup.addLayers(toAdd);
}

function buildPopupHtml(s) {
  return `<b>${escapeHtml(s.nombre)}</b><br>${escapeHtml(s.codigo)}<br>${escapeHtml(s.fields["DIRECCION"] || "")}`;
}

// ------------------------------------------------------------------
// Selección de centro escolar (desde lista o mapa)
// ------------------------------------------------------------------
function selectSchool(id, panToMap) {
  activeSchoolId = id;
  const school = allSchools.find((s) => s.id === id);
  if (!school) return;

  // Resaltar en la lista.
  document.querySelectorAll(".school-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === id);
  });

  // Mostrar detalle.
  showDetail(school);

  // Centrar mapa.
  const marker = markersById.get(id);
  if (marker && panToMap) {
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: true });
    if (markerClusterGroup.hasLayer(marker)) {
      markerClusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
    } else {
      marker.openPopup();
    }
  } else if (marker) {
    marker.openPopup();
  }
}

function showDetail(school) {
  const rows = [];
  const seen = new Set();

  DETAIL_ORDER.forEach((key) => {
    if (HIDDEN_FIELDS.includes(key)) return;
    const val = school.fields[key];
    if (val) {
      rows.push([FIELD_LABELS[key] || key, val]);
      seen.add(key);
    }
  });
  // Cualquier otro campo disponible en la hoja que no esté en el orden preferido.
  Object.keys(school.fields).forEach((key) => {
    if (seen.has(key)) return;
    if (HIDDEN_FIELDS.includes(key)) return;
    const val = school.fields[key];
    if (!val) return;
    rows.push([FIELD_LABELS[key] || key, val]);
  });

  const tableRows = rows.map(([label, val]) =>
    `<tr><td class="label">${escapeHtml(label)}</td><td class="value">${escapeHtml(val)}</td></tr>`
  ).join("");

  els.detailContent.innerHTML = `
    <h2>${escapeHtml(school.nombre)}</h2>
    <span class="detail-code">${escapeHtml(school.codigo)}</span>
    <table class="detail-table">${tableRows}</table>
  `;
  els.detailPanel.classList.remove("hidden");
}

// ------------------------------------------------------------------
// Eventos
// ------------------------------------------------------------------
function wireEvents() {
  initMultiselects();

  els.refreshBtn.addEventListener("click", () => loadData(true));
  els.searchInput.addEventListener("input", debounce(applyFilters, 150));

  els.closeDetail.addEventListener("click", () => els.detailPanel.classList.add("hidden"));

  els.exportFilteredBtn.addEventListener("click", () => {
    exportToExcel(filteredSchools, `centros_escolares_filtrado_${dateStamp()}.xlsx`);
  });
  els.exportAllBtn.addEventListener("click", () => {
    exportToExcel(allSchools, `centros_escolares_completo_${dateStamp()}.xlsx`);
  });
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ------------------------------------------------------------------
// Arranque
// ------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  wireEvents();
  loadData(false);
});
