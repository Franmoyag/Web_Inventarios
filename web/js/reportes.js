import { api, $, $all } from './api.js';

// --- Auth + rol mínimo REPORT/ADMIN ---
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

const state = {
  activos: [],
  movimientos: [],
  kpis: { total_activos: 0, prestados: 0, movimientos_mes: 0 }
};

async function loadData() {
  // 1) Intentar KPIs del backend
  try {
    const k = await api('/api/reports/kpis');
    if (k && (k.total_activos !== undefined)) state.kpis = k;
  } catch { /* seguimos con fallback */ }

  // 2) Datos crudos para agregaciones
  const assetsResp = await api('/api/assets');
  state.activos = assetsResp.items || [];

  // 3) Fallback KPIs si faltó algo
  if (!state.kpis.total_activos) state.kpis.total_activos = state.activos.length;
  if (!state.kpis.prestados) {
    state.kpis.prestados = state.activos.filter(a => String(a.estado||'').toUpperCase() === 'ASIGNADO').length;
  }
  if (!state.kpis.movimientos_mes) {
    try {
      const movResp = await api('/api/movements'); // limita 200, suficiente para un vistazo rápido
      state.movimientos = movResp.items || [];
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      state.kpis.movimientos_mes = state.movimientos.filter(m => {
        const d = new Date(m.fecha_hora);
        const tag = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        return tag === ym;
      }).length;
    } catch { /* sin movimientos */ }
  }
}

function groupCount(arr, keyFn) {
  const map = new Map();
  for (const it of arr) {
    const k = keyFn(it);
    if (!k) continue;
    map.set(k, (map.get(k)||0)+1);
  }
  return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]);
}

function makeDoughnut(id, labels, data) {
  const el = document.getElementById(id);
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

function makeBar(id, labels, data) {
  const el = document.getElementById(id);
  if (!el) return;
  return new Chart(el, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Cantidad', data }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxRotation: 0, minRotation: 0 } },
        y: { beginAtZero: true }
      }
    }
  });
}

async function render() {
  await loadData();

  // KPIs
  const k = state.kpis;
  $('#kpiTotal').textContent = k.total_activos;
  $('#kpiPrestados').textContent = k.prestados;
  $('#kpiMovMes').textContent = k.movimientos_mes;

  // ======= Gráficos =======

  // 1) Estados (Disponible/Asignado/Mantención/Baja/Obsoleto, etc.)
  const porEstado = groupCount(state.activos, a => (a.estado||'').toUpperCase());
  makeDoughnut('chartEstados',
    porEstado.map(([k])=>k||'—'),
    porEstado.map(([,v])=>v)
  );

  // 2) Top 10 Marcas
  const porMarca = groupCount(state.activos, a => (a.marca||'').trim().toUpperCase());
  const topMarca = porMarca.slice(0,10);
  makeBar('chartMarcas',
    topMarca.map(([k])=>k||'—'),
    topMarca.map(([,v])=>v)
  );

  // 3) Categorías/Tipo
  const porCat = groupCount(state.activos, a => (a.categoria||'').trim().toUpperCase());
  makeBar('chartCategorias',
    porCat.map(([k])=>k||'—'),
    porCat.map(([,v])=>v)
  );

  // 4) Indicadores simples (tu demo original)
  const ctx = document.getElementById('chartMov');
  new Chart(ctx, {
    type: 'bar',
    data: { labels: ['Total', 'Prestados', 'Mov. Mes'],
            datasets: [{ label: 'Indicadores', data: [k.total_activos, k.prestados, k.movimientos_mes] }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}

render();


// ======== GENERADOR DE REPORTES (client-side CSV) ========
const ui = {
  tipo: $('#repTipo'),
  estado: $('#fEstado'),
  categoria: $('#fCategoria'),
  marca: $('#fMarca'),
  desde: $('#fDesde'),
  hasta: $('#fHasta'),
  boxDesde: $('#boxFechaDesde'),
  boxHasta: $('#boxFechaHasta'),
  colsActivos: $('#colsActivos'),
  colsMov: $('#colsMovimientos'),
  btnExport: $('#btnExportCSV')
};

// Campos sugeridos (puedes ajustar etiquetas y llaves según tu data real)
const COLS_ACTIVOS = [
  ['id','ID'], ['categoria','Categoría'], ['estado','Estado'],
  ['nombre','Nombre'], ['marca','Marca'], ['modelo','Modelo'],
  ['serial_imei','Serie/IMEI'], ['hostname','Hostname'],
  ['ubicacion','Ubicación'], ['propietario','Propietario'],
  ['observaciones','Observaciones'], ['fecha_creacion','Fecha creación']
];

const COLS_MOVIMIENTOS = [
  ['id','ID mov.'], ['asset_id','ID activo'], ['tipo','Tipo'],
  ['fecha_hora','Fecha/Hora'], ['usuario_responsable','Responsable'],
  ['asignado_a','Asignado a'], ['ubicacion','Ubicación'],
  ['condicion_salida','Cond. salida'], ['condicion_entrada','Cond. entrada'],
  ['notas','Notas']
];

function buildOptions(select, values) {
  // Limpia dejando "Todos"
  select.innerHTML = '<option value="">Todos</option>';
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v || '—';
    select.appendChild(opt);
  }
}

function uniqSorted(values) {
  return Array.from(new Set(values.filter(v => v!=null && v!=='')))
    .map(v => String(v).trim())
    .filter(v => v.length>0)
    .sort((a,b)=>a.localeCompare(b));
}

function populateFilters() {
  // A partir de state.activos (para tener catálogo)
  const est = uniqSorted(state.activos.map(a => (a.estado||'').toUpperCase()));
  const cat = uniqSorted(state.activos.map(a => (a.categoria||'').toUpperCase()));
  const mar = uniqSorted(state.activos.map(a => (a.marca||'').toUpperCase()));
  buildOptions(ui.estado, est);
  buildOptions(ui.categoria, cat);
  buildOptions(ui.marca, mar);
}

function checkboxGroup(container, cols, key) {
  container.innerHTML = '';
  for (const [k, label] of cols) {
    const id = `${key}_${k}`;
    const wrap = document.createElement('div');
    wrap.className = 'form-check form-check-inline';
    wrap.innerHTML = `
      <input class="form-check-input" type="checkbox" id="${id}" data-key="${k}" checked>
      <label class="form-check-label" for="${id}">${label}</label>
    `;
    container.appendChild(wrap);
  }
}

function getCheckedCols(container, cols) {
  const checks = $all('input[type="checkbox"]', container);
  const selected = [];
  for (const c of checks) {
    if (c.checked) {
      const def = cols.find(([k]) => k === c.dataset.key);
      if (def) selected.push(def);
    }
  }
  return selected;
}

function toggleTipoUI() {
  const tipo = ui.tipo.value;
  const isMov = (tipo === 'movimientos');
  ui.boxDesde.classList.toggle('d-none', !isMov);
  ui.boxHasta.classList.toggle('d-none', !isMov);
  ui.colsActivos.classList.toggle('d-none', isMov);
  ui.colsMov.classList.toggle('d-none', !isMov);
}

function sanitizeForCSV(value) {
  if (value == null) return '';
  let s = String(value).replace(/\r?\n/g, ' ').trim();
  // Evita fórmulas en Excel (=, +, -, @)
  if (/^[=\+\-@]/.test(s)) s = `'${s}`;
  // Escapar comillas
  if (s.includes('"') || s.includes(';') || s.includes(',')) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCSV(rows, delimiter = ',') {
  return rows.map(r => r.map(v => sanitizeForCSV(v)).join(delimiter)).join('\r\n');
}

function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

function applyFiltersActivos() {
  const e = (ui.estado.value||'').toUpperCase();
  const c = (ui.categoria.value||'').toUpperCase();
  const m = (ui.marca.value||'').toUpperCase();
  return state.activos.filter(a => {
    const okE = !e || (String(a.estado||'').toUpperCase() === e);
    const okC = !c || (String(a.categoria||'').toUpperCase() === c);
    const okM = !m || (String(a.marca||'').toUpperCase() === m);
    return okE && okC && okM;
  });
}

function applyFiltersMovimientos() {
  const e = (ui.estado.value||'').toUpperCase();      // opcional: si tu endpoint join trae estado del activo
  const c = (ui.categoria.value||'').toUpperCase();   // opcional
  const m = (ui.marca.value||'').toUpperCase();       // opcional

  let arr = state.movimientos.length ? state.movimientos : [];
  // Filtra por fecha
  const d1 = ui.desde.value ? new Date(ui.desde.value + 'T00:00:00') : null;
  const d2 = ui.hasta.value ? new Date(ui.hasta.value + 'T23:59:59') : null;

  arr = arr.filter(row => {
    // fecha
    if (row.fecha_hora) {
      const d = new Date(row.fecha_hora);
      if (d1 && d < d1) return false;
      if (d2 && d > d2) return false;
    }
    // si tienes estado/categoria/marca en el join, aplica:
    if (e && String(row.estado||'').toUpperCase() !== e) return false;
    if (c && String(row.categoria||'').toUpperCase() !== c) return false;
    if (m && String(row.marca||'').toUpperCase() !== m) return false;
    return true;
  });
  return arr;
}

function buildRows(data, cols) {
  const header = cols.map(([,label]) => label);
  const rows = [header];
  for (const it of data) {
    rows.push(cols.map(([key]) => it[key]));
  }
  return rows;
}

function exportar() {
  const tipo = ui.tipo.value;

  if (tipo === 'activos') {
    const cols = getCheckedCols(ui.colsActivos, COLS_ACTIVOS);
    const data = applyFiltersActivos();
    const rows = buildRows(data, cols);
    downloadCSV(`reporte-activos-${new Date().toISOString().slice(0,10)}.csv`, toCSV(rows));
  }

  if (tipo === 'movimientos') {
    const cols = getCheckedCols(ui.colsMov, COLS_MOVIMIENTOS);
    // si no cargaste movimientos antes, tráelos una vez
    const ensureMovs = async () => {
      if (!state.movimientos.length) {
        try { const resp = await api('/api/movements'); state.movimientos = resp.items || []; }
        catch { /* ignore */ }
      }
    };
    ensureMovs().then(() => {
      const data = applyFiltersMovimientos();
      const rows = buildRows(data, cols);
      downloadCSV(`reporte-movimientos-${new Date().toISOString().slice(0,10)}.csv`, toCSV(rows));
    });
  }
}

// Inicializa UI cuando ya cargaste datos en render()
(async function initReportBuilder(){
  // Espera a que loadData de render() haya llenado state.activos
  await new Promise(r => setTimeout(r, 100)); // simple defer
  populateFilters();
  checkboxGroup(ui.colsActivos, COLS_ACTIVOS, 'a');
  checkboxGroup(ui.colsMov, COLS_MOVIMIENTOS, 'm');
  toggleTipoUI();

  ui.tipo.addEventListener('change', toggleTipoUI);
  ui.btnExport.addEventListener('click', exportar);
})();
