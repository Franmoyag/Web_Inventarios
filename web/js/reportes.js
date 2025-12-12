import { api, $, $all } from './api.js';

// =======================
// Auth mínima REPORT/ADMIN
// =======================
(async () => {
  try {
    const me = await api('/api/auth/me');
    if (!me.user) location.href = '/login.html';
    $('#userInfo').textContent = `${me.user.nombre} (${me.user.role})`;
    if (!['ADMIN','REPORT'].includes(me.user.role)) {
      alert('No tienes permisos de Reportes');
      location.href = '/';
    }
  } catch {
    location.href = '/login.html';
  }
})();

// =======================
// Estado en memoria
// =======================
const state = {
  activos: [],
  movimientos: [],
  kpis: { total_activos: 0, prestados: 0, movimientos_mes: 0 },
  byCollaborator: [],
  byProject: [],
  peripheralsHealth: []
};

// =======================
// Utilidades DOM
// =======================
function safeGet(id) {
  return document.getElementById(id);
}

// =======================
// Carga de datos base
// =======================
async function loadData() {
  // KPIs desde backend
  try {
    const k = await api('/api/reports/kpis');
    if (k && (k.total_activos !== undefined)) state.kpis = k;
  } catch (e) {
    console.warn('No se pudo leer /reports/kpis, usando fallback.', e);
  }

  // Activos
  try {
    const assetsResp = await api('/api/assets');
    state.activos = assetsResp.items || [];
  } catch (e) {
    console.error('Error cargando activos', e);
  }

  // Si KPIs no vinieron, los calculamos
  if (!state.kpis.total_activos) {
    state.kpis.total_activos = state.activos.length;
  }
  if (!state.kpis.prestados) {
    state.kpis.prestados = state.activos
      .filter(a => String(a.estado || '').toUpperCase() === 'ASIGNADO').length;
  }

  // Movimientos
  try {
    const movResp = await api('/api/movements');
    state.movimientos = movResp.items || [];
  } catch (e) {
    console.warn('No se pudieron cargar movimientos (no crítico para gráficos básicos)', e);
  }

  if (!state.kpis.movimientos_mes && state.movimientos.length) {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    state.kpis.movimientos_mes = state.movimientos.filter(m => {
      const d = new Date(m.fecha_hora);
      const tag = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return tag === ym;
    }).length;
  }
}

// =======================
// Utilidades de agrupación y Chart.js
// =======================
function groupCount(arr, keyFn) {
  const map = new Map();
  for (const it of arr) {
    const k = keyFn(it);
    if (!k) continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function makeDoughnut(id, labels, data) {
  const el = safeGet(id);
  if (!el) return;
  return new Chart(el, {
    type: 'doughnut',
    data: { labels, datasets: [{ data }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function makeBar(id, labels, data, label = 'Cantidad') {
  const el = safeGet(id);
  if (!el) return;
  return new Chart(el, {
    type: 'bar',
    data: { labels, datasets: [{ label, data }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: !!label } },
      scales: {
        x: { ticks: { maxRotation: 0, minRotation: 0 } },
        y: { beginAtZero: true }
      }
    }
  });
}

// =======================
// Render básico (resumen)
// =======================
async function renderResumen() {
  await loadData();

  // KPIs
  const k = state.kpis;
  const kpiTotalEl = safeGet('kpiTotal');
  const kpiPrestadosEl = safeGet('kpiPrestados');
  const kpiMovMesEl = safeGet('kpiMovMes');

  if (kpiTotalEl) kpiTotalEl.textContent = k.total_activos;
  if (kpiPrestadosEl) kpiPrestadosEl.textContent = k.prestados;
  if (kpiMovMesEl) kpiMovMesEl.textContent = k.movimientos_mes;

  // Estados
  const porEstado = groupCount(state.activos, a => (a.estado || '').toUpperCase());
  makeDoughnut(
    'chartEstados',
    porEstado.map(([k]) => k || '—'),
    porEstado.map(([, v]) => v)
  );

  // Top 10 marcas
  const porMarca = groupCount(state.activos, a => (a.marca || '').trim().toUpperCase());
  const topMarca = porMarca.slice(0, 10);
  makeBar(
    'chartMarcas',
    topMarca.map(([k]) => k || '—'),
    topMarca.map(([, v]) => v),
    'Activos'
  );

  // Categorías
  const porCat = groupCount(state.activos, a => (a.categoria || '').trim().toUpperCase());
  makeBar(
    'chartCategorias',
    porCat.map(([k]) => k || '—'),
    porCat.map(([, v]) => v),
    'Activos'
  );

  // Snapshot actividad
  const ctx = safeGet('chartMov');
  if (ctx) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Total parque', 'Prestados', 'Mov. Mes'],
        datasets: [{
          label: 'Indicadores',
          data: [k.total_activos, k.prestados, k.movimientos_mes]
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } }
      }
    });
  }
}

// =======================
// Reporte: Activos por colaborador
// =======================
async function renderPorColaborador() {
  if (!state.byCollaborator.length) {
    try {
      const data = await api('/api/reports/assets-by-collaborator');
      state.byCollaborator = data || [];
    } catch (e) {
      console.error('Error /assets-by-collaborator', e);
      state.byCollaborator = [];
    }
  }
  const rows = state.byCollaborator.filter(r => (r.activos_asignados || 0) > 0);

  const labels = rows.map(r => r.colaborador || 'Sin colaborador');
  const data = rows.map(r => r.activos_asignados || 0);

  makeBar('chartColaboradores', labels, data, 'Activos asignados');

  const tbody = safeGet('tbodyColaboradores');
  if (!tbody) return;
  tbody.innerHTML = '';
  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${r.colaborador || 'Sin colaborador'}</td>
      <td class="text-end">${r.activos_asignados || 0}</td>
      <td class="text-end">${r.total || 0}</td>
    `;
    tbody.appendChild(tr);
  });
}

// =======================
// Reporte: Activos por proyecto
// =======================
async function renderPorProyecto() {
  if (!state.byProject.length) {
    try {
      const data = await api('/api/reports/assets-by-project');
      state.byProject = data || [];
    } catch (e) {
      console.error('Error /assets-by-project', e);
      state.byProject = [];
    }
  }
  const rows = state.byProject;

  const labels = rows.map(r => r.proyecto || 'Sin proyecto');
  const totales = rows.map(r => r.total || 0);
  const asignados = rows.map(r => r.activos_asignados || 0);
  const disponibles = rows.map(r => r.activos_disponibles || 0);

  const el = safeGet('chartProyectos');
  if (el) {
    new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Total', data: totales },
          { label: 'Asignados', data: asignados },
          { label: 'Disponibles', data: disponibles }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: false },
          y: { beginAtZero: true }
        }
      }
    });
  }

  const tbody = safeGet('tbodyProyectos');
  if (!tbody) return;
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.proyecto || 'Sin proyecto'}</td>
      <td class="text-end">${r.total || 0}</td>
      <td class="text-end">${r.activos_asignados || 0}</td>
      <td class="text-end">${r.activos_disponibles || 0}</td>
      <td class="text-end">${r.activos_fuera_servicio || 0}</td>
    `;
    tbody.appendChild(tr);
  });
}

// =======================
// Reporte: Salud periféricos
// =======================
async function renderPerifericos() {
  if (!state.peripheralsHealth.length) {
    try {
      const data = await api('/api/reports/peripherals-health');
      state.peripheralsHealth = data || [];
    } catch (e) {
      console.error('Error /peripherals-health', e);
      state.peripheralsHealth = [];
    }
  }

  const rows = state.peripheralsHealth;
  const labels = rows.map(r => r.categoria || 'Sin categoría');
  const stockActual = rows.map(r => r.stock_actual || 0);
  const stockMin = rows.map(r => r.stock_minimo || 0);

  const el = safeGet('chartPerifericos');
  if (el) {
    new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Stock actual', data: stockActual },
          { label: 'Stock mínimo', data: stockMin }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: false },
          y: { beginAtZero: true }
        }
      }
    });
  }

  const tbody = safeGet('tbodyPerifericos');
  if (!tbody) return;
  tbody.innerHTML = '';
  rows.forEach(r => {
    const faltante = r.faltante || 0;
    const cls = faltante > 0 ? 'text-danger fw-semibold' : 'text-success';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.categoria || 'Sin categoría'}</td>
      <td class="text-end">${r.stock_actual || 0}</td>
      <td class="text-end">${r.stock_minimo || 0}</td>
      <td class="text-end ${cls}">${faltante}</td>
    `;
    tbody.appendChild(tr);
  });
}

// =======================
// Sidebar: cambio de vistas
// =======================
const views = {
  resumen        : safeGet('viewResumen'),
  estados        : safeGet('viewEstados'),
  marcas         : safeGet('viewMarcas'),
  categorias     : safeGet('viewCategorias'),
  'por-colaborador': safeGet('viewPorColaborador'),
  'por-proyecto' : safeGet('viewPorProyecto'),
  perifericos    : safeGet('viewPerifericos'),
  generator      : safeGet('viewGenerator')
};

function showView(key) {
  Object.entries(views).forEach(([name, el]) => {
    if (!el) return;
    el.classList.toggle('d-none', name !== key);
  });

  const nav = safeGet('reportNav');
  if (!nav) return;
  $all('[data-report]', nav).forEach(btn => {
    const v = btn.getAttribute('data-report');
    btn.classList.toggle('active', v === key);
  });

  // Render perezoso según vista
  if (key === 'resumen') renderResumen();
  if (key === 'por-colaborador') renderPorColaborador();
  if (key === 'por-proyecto') renderPorProyecto();
  if (key === 'perifericos') renderPerifericos();
}

const nav = safeGet('reportNav');
if (nav) {
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-report]');
    if (!btn) return;
    const key = btn.getAttribute('data-report');
    if (!key) return;
    showView(key);
  });
}

// =======================
// Generador de reportes (CSV client-side)
// =======================
const ui = {
  tipo: safeGet('repTipo'),
  estado: safeGet('fEstado'),
  categoria: safeGet('fCategoria'),
  marca: safeGet('fMarca'),
  desde: safeGet('fDesde'),
  hasta: safeGet('fHasta'),
  boxDesde: safeGet('boxFechaDesde'),
  boxHasta: safeGet('boxFechaHasta'),
  colsActivos: safeGet('colsActivos'),
  colsMov: safeGet('colsMovimientos'),
  btnExport: safeGet('btnExportCSV')
};

const COLS_ACTIVOS = [
  ['id', 'ID'],
  ['categoria', 'Categoría'],
  ['estado', 'Estado'],
  ['nombre', 'Nombre'],
  ['marca', 'Marca'],
  ['modelo', 'Modelo'],
  ['serial_imei', 'Serie/IMEI'],
  ['hostname', 'Hostname'],
  ['ubicacion', 'Ubicación'],
  ['propietario', 'Propietario'],
  ['colaborador_actual', 'Colaborador actual'],
  ['proyecto_id', 'ID Proyecto'],
  ['fecha_creacion', 'Fecha creación']
];

const COLS_MOVIMIENTOS = [
  ['id', 'ID mov.'],
  ['asset_id', 'ID activo'],
  ['tipo', 'Tipo'],
  ['fecha_hora', 'Fecha/Hora'],
  ['usuario_responsable', 'Responsable'],
  ['asignado_a', 'Asignado a'],
  ['ubicacion', 'Ubicación'],
  ['condicion_salida', 'Cond. salida'],
  ['condicion_entrada', 'Cond. entrada'],
  ['notas', 'Notas']
];

function uniqSorted(values) {
  return Array.from(new Set(values.filter(v => v != null && v !== '')))
    .map(v => String(v).trim())
    .filter(v => v.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function buildOptions(select, values) {
  if (!select) return;
  select.innerHTML = '<option value="">Todos</option>';
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v || '—';
    select.appendChild(opt);
  });
}

function populateFilters() {
  const est = uniqSorted(state.activos.map(a => (a.estado || '').toUpperCase()));
  const cat = uniqSorted(state.activos.map(a => (a.categoria || '').toUpperCase()));
  const mar = uniqSorted(state.activos.map(a => (a.marca || '').toUpperCase()));
  buildOptions(ui.estado, est);
  buildOptions(ui.categoria, cat);
  buildOptions(ui.marca, mar);
}

function checkboxGroup(container, cols, keyPrefix) {
  if (!container) return;
  container.innerHTML = '';
  cols.forEach(([k, label]) => {
    const id = `${keyPrefix}_${k}`;
    const wrap = document.createElement('div');
    wrap.className = 'form-check form-check-inline';
    wrap.innerHTML = `
      <input class="form-check-input" type="checkbox" id="${id}" data-key="${k}" checked>
      <label class="form-check-label" for="${id}">${label}</label>
    `;
    container.appendChild(wrap);
  });
}

function getCheckedCols(container, cols) {
  if (!container) return [];
  const checks = $all('input[type="checkbox"]', container);
  const selected = [];
  checks.forEach(c => {
    if (c.checked) {
      const def = cols.find(([k]) => k === c.dataset.key);
      if (def) selected.push(def);
    }
  });
  return selected;
}

function toggleTipoUI() {
  if (!ui.tipo) return;
  const tipo = ui.tipo.value;
  const isMov = (tipo === 'movimientos');
  if (ui.boxDesde) ui.boxDesde.classList.toggle('d-none', !isMov);
  if (ui.boxHasta) ui.boxHasta.classList.toggle('d-none', !isMov);
  if (ui.colsActivos) ui.colsActivos.classList.toggle('d-none', isMov);
  if (ui.colsMov) ui.colsMov.classList.toggle('d-none', !isMov);
}

function sanitizeForCSV(value) {
  if (value == null) return '';
  let s = String(value).replace(/\r?\n/g, ' ').trim();
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (s.includes('"') || s.includes(';') || s.includes(',')) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCSV(rows, delimiter = ',') {
  return rows
    .map(r => r.map(v => sanitizeForCSV(v)).join(delimiter))
    .join('\r\n');
}

function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

function applyFiltersActivos() {
  const e = (ui.estado?.value || '').toUpperCase();
  const c = (ui.categoria?.value || '').toUpperCase();
  const m = (ui.marca?.value || '').toUpperCase();

  return state.activos.filter(a => {
    const okE = !e || (String(a.estado || '').toUpperCase() === e);
    const okC = !c || (String(a.categoria || '').toUpperCase() === c);
    const okM = !m || (String(a.marca || '').toUpperCase() === m);
    return okE && okC && okM;
  });
}

function applyFiltersMovimientos() {
  const e = (ui.estado?.value || '').toUpperCase();
  const c = (ui.categoria?.value || '').toUpperCase();
  const m = (ui.marca?.value || '').toUpperCase();

  let arr = state.movimientos || [];

  const d1 = ui.desde?.value ? new Date(ui.desde.value + 'T00:00:00') : null;
  const d2 = ui.hasta?.value ? new Date(ui.hasta.value + 'T23:59:59') : null;

  arr = arr.filter(row => {
    if (row.fecha_hora) {
      const d = new Date(row.fecha_hora);
      if (d1 && d < d1) return false;
      if (d2 && d > d2) return false;
    }
    if (e && String(row.estado || '').toUpperCase() !== e) return false;
    if (c && String(row.categoria || '').toUpperCase() !== c) return false;
    if (m && String(row.marca || '').toUpperCase() !== m) return false;
    return true;
  });

  return arr;
}

function buildRows(data, cols) {
  const header = cols.map(([, label]) => label);
  const rows = [header];
  data.forEach(it => {
    rows.push(cols.map(([key]) => it[key]));
  });
  return rows;
}

function exportar() {
  const tipo = ui.tipo?.value;

  if (tipo === 'activos') {
    const cols = getCheckedCols(ui.colsActivos, COLS_ACTIVOS);
    const data = applyFiltersActivos();
    const rows = buildRows(data, cols);
    downloadCSV(
      `reporte-activos-${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(rows)
    );
  }

  if (tipo === 'movimientos') {
    const cols = getCheckedCols(ui.colsMov, COLS_MOVIMIENTOS);

    const ensureMovs = async () => {
      if (!state.movimientos.length) {
        try {
          const resp = await api('/api/movements');
          state.movimientos = resp.items || [];
        } catch (e) {
          console.error('Error recargando movimientos', e);
        }
      }
    };

    ensureMovs().then(() => {
      const data = applyFiltersMovimientos();
      const rows = buildRows(data, cols);
      downloadCSV(
        `reporte-movimientos-${new Date().toISOString().slice(0, 10)}.csv`,
        toCSV(rows)
      );
    });
  }
}

// =======================
// Init
// =======================
(async function init() {
  await renderResumen();  // llena KPIs y gráficos básicos
  populateFilters();
  checkboxGroup(ui.colsActivos, COLS_ACTIVOS, 'a');
  checkboxGroup(ui.colsMov, COLS_MOVIMIENTOS, 'm');
  toggleTipoUI();

  if (ui.tipo) ui.tipo.addEventListener('change', toggleTipoUI);
  if (ui.btnExport) ui.btnExport.addEventListener('click', exportar);

  // Vista inicial
  showView('resumen');
})();
