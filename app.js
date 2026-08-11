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
  "NOMBRE CE", "CÓD CE", "DIRECCION", "NOMBRE DEPTO", "MUNICIPIO",
  "NOMBRE DISTRITO", "TOTAL MATRICULA P", "mat 2026", "SECCIONES",
  "DOCENTES", "AULAS", "TURNO", "MODALIDAD", "ZONA (2)", "ZONA", "SECTOR",
  "CLASIFICACION", "TIPO DE SEDE", "DESCRIPCION TIPO", "PROPIEDAD",
  "ALQUILADA", "SUBVENCIONADA", "ESTATUS INTERVENCION", "INTERVENCION",
  "RED INTERNA", "ESTATUS RED", "ELECTRICIDAD", "MOVISTAR", "STARLINK",
  "INAUGURACIONES", "LATITUD", "LONGITUD", "ESCALADA", "FASE",
  "GRUPO (BLOQUE)", "SUBGRUPO", "GRUPO2", "CÓDIGO DEPTO", "CÓDIGO DISTRITO",
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

// --- Elementos del DOM -------------------------------------------
const els = {
  refreshBtn: document.getElementById("refresh-btn"),
  statusText: document.getElementById("status-text"),
  searchInput: document.getElementById("search-input"),
  filterDepto: document.getElementById("filter-depto"),
  filterMunicipio: document.getElementById("filter-municipio"),
  filterDistrito: document.getElementById("filter-distrito"),
  filterZona: document.getElementById("filter-zona"),
  filterRegion: document.getElementById("filter-region"),
  filterGrupo: document.getElementById("filter-grupo"),
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

    // Si la hoja no tiene capturado el grupo/subgrupo de este centro, se
    // rellena con un valor explícito en vez de dejarlo vacío, para que
    // siempre aparezca en el panel de detalle y se pueda filtrar por él.
    if (!clean["GRUPO (BLOQUE)"]) clean["GRUPO (BLOQUE)"] = "Sin grupo";
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
function uniqueSorted(schools, fieldKey) {
  const set = new Set();
  schools.forEach((s) => {
    const v = s.fields[fieldKey];
    if (v) set.add(v);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

function populateFilterOptions(schools) {
  fillSelect(els.filterDepto, uniqueSorted(schools, "NOMBRE DEPTO"), "Todos los departamentos");
  fillSelect(els.filterMunicipio, uniqueSorted(schools, "MUNICIPIO"), "Todos los municipios");
  fillSelect(els.filterDistrito, getDistritosForDepto(schools, ""), "Todos los distritos");
  fillSelect(els.filterZona, uniqueSorted(schools, "ZONA (2)"), "Toda zona");
  fillSelect(els.filterRegion, uniqueSorted(schools, "ZONA"), "Toda región");
  fillSelect(els.filterGrupo, uniqueSorted(schools, "GRUPO (BLOQUE)"), "Todo grupo");
}

// Distritos que pertenecen a un departamento dado (o todos si no se indica
// departamento). Usado para que el filtro de Distrito solo muestre las
// opciones que tienen sentido según el Departamento seleccionado.
function getDistritosForDepto(schools, depto) {
  const scoped = depto ? schools.filter((s) => s.fields["NOMBRE DEPTO"] === depto) : schools;
  return uniqueSorted(scoped, "NOMBRE DISTRITO");
}

// Departamento al que pertenece un distrito dado (los distritos son únicos
// dentro de un solo departamento). Usado para autocompletar el filtro de
// Departamento cuando se elige un Distrito directamente.
function getDeptoForDistrito(schools, distrito) {
  const match = schools.find((s) => s.fields["NOMBRE DISTRITO"] === distrito);
  return match ? match.fields["NOMBRE DEPTO"] : "";
}

function fillSelect(selectEl, values, placeholder) {
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
  if (values.includes(current)) selectEl.value = current;
}

function applyFilters() {
  const q = els.searchInput.value.trim().toLowerCase();
  const depto = els.filterDepto.value;
  const municipio = els.filterMunicipio.value;
  const distrito = els.filterDistrito.value;
  const zona = els.filterZona.value;
  const region = els.filterRegion.value;
  const grupo = els.filterGrupo.value;

  filteredSchools = allSchools.filter((s) => {
    if (depto && s.fields["NOMBRE DEPTO"] !== depto) return false;
    if (municipio && s.fields["MUNICIPIO"] !== municipio) return false;
    if (distrito && s.fields["NOMBRE DISTRITO"] !== distrito) return false;
    if (zona && s.fields["ZONA (2)"] !== zona) return false;
    if (region && s.fields["ZONA"] !== region) return false;
    if (grupo && s.fields["GRUPO (BLOQUE)"] !== grupo) return false;
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
  els.refreshBtn.addEventListener("click", () => loadData(true));
  els.searchInput.addEventListener("input", debounce(applyFilters, 150));

  // Departamento y Distrito están enlazados en ambos sentidos: elegir un
  // departamento limita la lista de distritos a los que pertenecen a él, y
  // elegir un distrito selecciona automáticamente su departamento.
  els.filterDepto.addEventListener("change", () => {
    fillSelect(els.filterDistrito, getDistritosForDepto(allSchools, els.filterDepto.value), "Todos los distritos");
    applyFilters();
  });
  els.filterDistrito.addEventListener("change", () => {
    const distrito = els.filterDistrito.value;
    if (distrito) {
      const depto = getDeptoForDistrito(allSchools, distrito);
      if (depto && els.filterDepto.value !== depto) {
        els.filterDepto.value = depto;
      }
      fillSelect(els.filterDistrito, getDistritosForDepto(allSchools, els.filterDepto.value), "Todos los distritos");
      els.filterDistrito.value = distrito;
    }
    applyFilters();
  });

  els.filterMunicipio.addEventListener("change", applyFilters);
  els.filterZona.addEventListener("change", applyFilters);
  els.filterRegion.addEventListener("change", applyFilters);
  els.filterGrupo.addEventListener("change", applyFilters);
  els.closeDetail.addEventListener("click", () => els.detailPanel.classList.add("hidden"));
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
