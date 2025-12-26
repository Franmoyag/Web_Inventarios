import { api, $, $all, showToast } from './api.js';

// --- sesión / navbar ---
(async () => {
  try {
    const me = await api('/api/auth/me');
    if (!me.user) {
      location.href = '/login.html';
      return;
    }
    $('#userInfo').textContent = `${me.user.nombre} (${me.user.role})`;
  } catch {
    location.href = '/login.html';
  }
})();

$('#btnLogout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.href = '/login.html';
});

// --- refs de la UI ---
const formMov = $('#formMovimiento');
const msgMov = $('#msgMov');
const btnGuardarMov = $('#btnGuardarMov');
const cmbTipo = $('#cmbTipo');

// búsqueda de activos
const txtBuscarActivo = $('#txtBuscarActivo');
const btnBuscarActivo = $('#btnBuscarActivo');
const tbodyResultadosActivos = $('#tbodyResultadosActivos');

// activo seleccionado
const txtActivoSel = $('#txtActivoSel');
const hiddenActivoId = $('#activo_id_hidden');
const hiddenActivoSerial = $('#activo_serial_hidden');
const btnHistorialActivo = $('#btnHistorialActivo');


// autocompletar colaborador
const inputAsignadoA = $('#inputAsignadoA');
const listaColaboradores = $('#listaColaboradores');

const inputParqueProyecto = $('#inputParqueProyecto');
const inputEncargado      = $('#inputEncargado');

// historial general
const btnVerHistorial = $('#btnVerHistorial');
const tbodyHistorialModal = $('#tbodyHistorialModal');
const historialMsg = $('#historialMsg');
const btnExportCSV = $('#btnExportCSV');

// historial de un activo
const tbodyHistorialActivo = $('#tbodyHistorialActivo');
const historialActivoMsg = $('#historialActivoMsg');
const histActivoHeader = $('#histActivoHeader');
const btnExportCSVActivo = $('#btnExportCSVActivo');

// --- buscador de colaboradores ---
const txtBuscarColab = $('#txtBuscarColab');
const btnBuscarColab = $('#btnBuscarColab');
const tbodyColabResultados = $('#tbodyColabResultados');

const colabHistorialWrapper = $('#colabHistorialWrapper');
const colabResumen = $('#colabResumen');
const tbodyColabActivosActuales = $('#tbodyColabActivosActuales');
const tbodyColabMovimientos = $('#tbodyColabMovimientos');
const hiddenColaboradorId = $('#colaborador_id_hidden');5

// historial de cambios técnicos
const tbodyHistorialCambios = $('#tbodyHistorialCambios');
const historialCambiosMsg = $('#historialCambiosMsg');

let historialCambiosCache = [];

let historialCache = [];        // historial general
let historialActivoCache = [];  // historial de un activo



// --- helpers ---
function setBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = busy;
  btn.classList.toggle('disabled', busy);
}

function applyTipoVisibility(tipo) {
  const isSalida = tipo === 'SALIDA';
  const isEntrada = tipo === 'ENTRADA';

  $all('[data-mov="salida"]').forEach(el => {
    el.style.display = isSalida ? '' : 'none';
  });
  $all('[data-mov="entrada"]').forEach(el => {
    el.style.display = isEntrada ? '' : 'none';
  });
}

// inicializar visibilidad del formulario
applyTipoVisibility(cmbTipo.value);
cmbTipo.addEventListener('change', e => {
  applyTipoVisibility(e.target.value);
});

// --- buscar activos ---
async function buscarActivos() {
  const q = txtBuscarActivo.value.trim();
  if (!q) {
    tbodyResultadosActivos.innerHTML = `
      <tr><td colspan="5" class="text-secondary text-center py-3">
        Ingresa IMEI / Serie / Hostname / Modelo y presiona Buscar.
      </td></tr>`;
    return;
  }

  try {
    const data = await api(`/api/assets?q=${encodeURIComponent(q)}`);
    const items = data.items || [];

    if (!items.length) {
      tbodyResultadosActivos.innerHTML = `
        <tr><td colspan="5" class="text-warning text-center py-3">
          Sin resultados.
        </td></tr>`;
      return;
    }

    tbodyResultadosActivos.innerHTML = '';
    for (const act of items) {
      const tr = document.createElement('tr');

      const resumen = `[${act.categoria}] ${act.marca || ''} ${act.modelo || ''}`.trim();

      tr.innerHTML = `
        <td style="width:1%;">
          <button type="button"
                  class="btn btn-sm btn-info btnUsarActivo"
                  data-id="${act.id}"
                  data-label="${resumen} — ${act.serial_imei || ''}"
                  data-serial="${act.serial_imei || ''}">
            Usar
          </button>
        </td>
        <td>${act.categoria || ''}</td>
        <td>${act.marca || ''} ${act.modelo || ''}</td>
        <td>${act.serial_imei || ''}</td>
        <td>${act.estado || ''}</td>
      `;

      tbodyResultadosActivos.appendChild(tr);
    }

  } catch (err) {
    console.error('Error buscando activos:', err);
    showToast('No pude buscar activos', 'danger');
  }
}

// Botón Buscar
btnBuscarActivo.addEventListener('click', buscarActivos);

// ENTER en campo de búsqueda
txtBuscarActivo.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    buscarActivos();
  }
});

// Seleccionar un activo -> llenar selección
tbodyResultadosActivos.addEventListener('click', e => {
  const btn = e.target.closest('.btnUsarActivo');
  if (!btn) return;

  const assetId = btn.getAttribute('data-id');
  const label = btn.getAttribute('data-label');
  const serial = btn.getAttribute('data-serial') || '';

  // guardamos internamente
  hiddenActivoId.value = assetId;
  hiddenActivoSerial.value = serial;

  // reflejamos en pantalla
  txtActivoSel.value = label;

  // habilitar botón historial de este activo
  btnHistorialActivo.disabled = false;

  showToast('Activo seleccionado ✅', 'success');
});

// --- guardar movimiento SALIDA / ENTRADA ---
btnGuardarMov.addEventListener('click', async () => {
  msgMov.textContent = '';

  const fd = new FormData(formMov);
  const body = Object.fromEntries(fd.entries());

  // aseguramos id real (viene del hidden)
  body.activo_id = hiddenActivoId.value;

  // ✅ asegurar colaborador_id desde hidden (aunque el FormData no lo tome por algún motivo)
  // (si no existe el hidden, no rompe)
  if (typeof hiddenColaboradorId !== 'undefined' && hiddenColaboradorId) {
    body.colaborador_id = hiddenColaboradorId.value || body.colaborador_id || '';
  }

  if (!body.activo_id) {
    msgMov.textContent = 'Debes seleccionar un activo primero.';
    showToast('Selecciona un activo', 'danger');
    return;
  }

  if (!body.tipo) {
    msgMov.textContent = 'Debes elegir tipo de movimiento.';
    showToast('Selecciona tipo de movimiento', 'danger');
    return;
  }

  // ✅ Validación crítica: en SALIDA debes seleccionar colaborador desde autocompletado
  if (body.tipo === 'SALIDA') {
    if (!body.asignado_a || !body.asignado_a.trim()) {
      msgMov.textContent = 'Debes seleccionar un colaborador.';
      showToast(msgMov.textContent, 'warning');
      return;
    }

    if (!body.colaborador_id) {
      msgMov.textContent = 'Selecciona el colaborador desde la lista (autocompletado).';
      showToast(msgMov.textContent, 'warning');
      return;
    }
  }

  setBusy(btnGuardarMov, true);

  try {
    await api('/api/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    showToast('Movimiento registrado ✅', 'success');

    // limpiar campos editables
    formMov.reset();
    hiddenActivoId.value = '';
    hiddenActivoSerial.value = '';
    txtActivoSel.value = '';
    btnHistorialActivo.disabled = true;

    // ✅ limpiar también el hidden del colaborador (para no dejar un id pegado)
    if (typeof hiddenColaboradorId !== 'undefined' && hiddenColaboradorId) {
      hiddenColaboradorId.value = '';
    }

    applyTipoVisibility(cmbTipo.value);

  } catch (err) {
    console.error('Error guardando movimiento:', err);
    msgMov.textContent = err.message || 'Error al guardar movimiento';
    showToast(msgMov.textContent, 'danger');
  } finally {
    setBusy(btnGuardarMov, false);
  }
});


// --- HISTORIAL GENERAL (modal grande) ---
async function cargarHistorialGeneral() {
  historialMsg.textContent = 'Cargando...';
  tbodyHistorialModal.innerHTML = '';
  historialCache = [];

  try {
    const data = await api('/api/movements');
    const items = data.items || [];
    historialCache = items;

    if (!items.length) {
      historialMsg.textContent = 'No hay movimientos registrados.';
      return;
    }

    historialMsg.textContent = `Mostrando ${items.length} movimientos recientes.`;

    for (const m of items) {
      const condicion = m.tipo === 'SALIDA'
        ? (m.condicion_salida || '')
        : (m.condicion_entrada || '');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${m.fecha_hora}</td>
        <td>${m.tipo}</td>
        <td>[${m.categoria}] ${m.marca ?? ''} ${m.modelo ?? ''} (${m.serial_imei ?? ''})</td>
        <td>${m.asignado_a ?? ''}</td>
        <td>${m.ubicacion ?? ''}</td>
        <td>${condicion}</td>
        <td>${m.usuario_responsable ?? ''}</td>
      `;
      tbodyHistorialModal.appendChild(tr);
    }

  } catch (err) {
    console.error('Error cargando historial general:', err);
    historialMsg.textContent = 'Error al cargar historial.';
    showToast('No pude cargar historial', 'danger');
  }
}

// abrir modal historial general
btnVerHistorial.addEventListener('click', () => {
  const modalEl = $('#modalHistorial');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  cargarHistorialGeneral();
});

// export CSV (historial general)
btnExportCSV.addEventListener('click', () => {
  if (!historialCache.length) {
    showToast('No hay datos para exportar', 'danger');
    return;
  }

  const headers = [
    'fecha_hora',
    'tipo',
    'categoria',
    'marca',
    'modelo',
    'serial_imei',
    'asignado_a',
    'ubicacion',
    'condicion',
    'usuario_responsable'
  ];

  const rows = historialCache.map(m => {
    const condicion = m.tipo === 'SALIDA'
      ? (m.condicion_salida || '')
      : (m.condicion_entrada || '');

    return [
      m.fecha_hora || '',
      m.tipo || '',
      m.categoria || '',
      m.marca || '',
      m.modelo || '',
      m.serial_imei || '',
      m.asignado_a || '',
      m.ubicacion || '',
      condicion,
      m.usuario_responsable || ''
    ].map(v => {
      const s = String(v ?? '');
      if (s.includes('"') || s.includes(',') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }).join(',');
  });

  const csvStr = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const fechaNow = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `historial_movimientos_${fechaNow}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
  showToast('CSV generado ✅', 'success');
});

// --- HISTORIAL DE UN ACTIVO ESPECÍFICO ---
async function cargarHistorialActivo(assetId, serialLabel) {
  historialActivoMsg.textContent = 'Cargando...';
  tbodyHistorialActivo.innerHTML = '';
  historialActivoCache = [];

  try {
    const data = await api(`/api/movements/${assetId}`);
    const items = data.items || [];
    historialActivoCache = items;

    histActivoHeader.textContent = `Serie / IMEI: ${serialLabel || '(sin serie)'}`;

    if (!items.length) {
      historialActivoMsg.textContent = 'Este activo no tiene movimientos registrados.';
      return;
    }

    historialActivoMsg.textContent = `Total movimientos: ${items.length}`;

    for (const m of items) {
      const condicion = m.tipo === 'SALIDA'
        ? (m.condicion_salida || '')
        : (m.condicion_entrada || '');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${m.fecha_hora}</td>
        <td>${m.tipo}</td>
        <td>${m.asignado_a ?? ''}</td>
        <td>${m.ubicacion ?? ''}</td>
        <td>${condicion}</td>
        <td>${m.usuario_responsable ?? ''}</td>
      `;
      tbodyHistorialActivo.appendChild(tr);
    }

  } catch (err) {
    console.error('Error cargando historial de activo:', err);
    historialActivoMsg.textContent = 'Error al cargar historial del activo.';
    showToast('No pude cargar historial del activo', 'danger');
  }
}


// Cargar cambios técnicos (hostname, estado, iccid, etc.)
async function cargarHistorialCambios(assetId) {
  historialCambiosMsg.textContent = 'Cargando cambios...';
  tbodyHistorialCambios.innerHTML = '';
  historialCambiosCache = [];

  try {
    const data = await api(`/api/assets/${assetId}/historial`);
    // Si el backend devuelve { ok:false, error:... }
    if (!data || data.ok === false) {
      historialCambiosMsg.textContent = data?.error || 'No se pudo cargar historial de cambios.';
      return;
    }

    const items = data.items || [];
    historialCambiosCache = items;

    if (!items.length) {
      historialCambiosMsg.textContent = 'Este activo no tiene cambios registrados.';
      return;
    }

    historialCambiosMsg.textContent = `Total cambios registrados: ${items.length}`;

    for (const h of items) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${h.cambiado_en || ''}</td>
        <td>${h.campo || ''}</td>
        <td>${h.valor_anterior ?? ''}</td>
        <td>${h.valor_nuevo ?? ''}</td>
        <td>${h.motivo ?? ''}</td>
      `;
      tbodyHistorialCambios.appendChild(tr);
    }

  } catch (err) {
    console.error('Error cargando historial de cambios:', err);
    historialCambiosMsg.textContent = 'Error al cargar historial de cambios.';
    // Si te molesta el toast, puedes comentar la siguiente línea:
    // showToast('No se pudo cargar historial de cambios', 'danger');
  }
}




// abrir modal historial de este activo
btnHistorialActivo.addEventListener('click', () => {
  const assetId = hiddenActivoId.value;
  const serial = hiddenActivoSerial.value;

  if (!assetId) {
    showToast('Primero selecciona un activo', 'danger');
    return;
  }

  const modalEl = $('#modalHistorialActivo');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  cargarHistorialActivo(assetId, serial);   // movimientos (ya lo tenías)
  cargarHistorialCambios(assetId);          // cambios técnicos (hostname, estado, etc.)
});




// export CSV (historial de un activo)
btnExportCSVActivo.addEventListener('click', () => {
  if (!historialActivoCache.length) {
    showToast('No hay datos para exportar', 'danger');
    return;
  }

  const headers = [
    'fecha_hora',
    'tipo',
    'asignado_a',
    'ubicacion',
    'condicion',
    'usuario_responsable'
  ];

  const rows = historialActivoCache.map(m => {
    const condicion = m.tipo === 'SALIDA'
      ? (m.condicion_salida || '')
      : (m.condicion_entrada || '');

    return [
      m.fecha_hora || '',
      m.tipo || '',
      m.asignado_a || '',
      m.ubicacion || '',
      condicion,
      m.usuario_responsable || ''
    ].map(v => {
      const s = String(v ?? '');
      if (s.includes('"') || s.includes(',') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }).join(',');
  });

  const csvStr = [headers.join(','), ...rows].join('\n');

  const fechaNow = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  const serialSafe = (hiddenActivoSerial.value || 'activo')
    .replace(/[^a-zA-Z0-9_-]/g,'');
  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `historial_${serialSafe}_${fechaNow}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
  showToast('CSV generado ✅', 'success');
});


// ... ya existe tu bloque de sesión arriba ...

// <<< INICIO: Auto-cargar historial si vienes desde Activos >>>
(function autoOpenHistorialDesdeActivos() {
  try {
    const raw = localStorage.getItem('historial_asset');
    if (!raw) return;
    localStorage.removeItem('historial_asset');

    const { id, serial } = JSON.parse(raw);
    if (!id) return;

    // abrir modal y cargar historial del activo
    const modalEl = document.querySelector('#modalHistorialActivo');
    if (modalEl) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }

    // setear cabecera y llamar a tu función existente
    const histActivoHeader = document.querySelector('#histActivoHeader');
    if (histActivoHeader) {
      histActivoHeader.textContent = `Historial del activo #${id}${serial ? ` — ${serial}` : ''}`;
    }

    if (typeof cargarHistorialActivo === 'function') {
      cargarHistorialActivo(id, serial || '');
    }
  } catch (e) {
    // si algo falla, no rompe la página
    console.warn('No se pudo autoabrir historial', e);
  }
})();
// <<< FIN: Auto-cargar historial si vienes desde Activos >>>



// --- Autocompletar "Asignado a / Usuario final" ---
let colabTimer = null;

async function autocompletarColaboradores(term) {
  if (!term || term.length < 2) {
    listaColaboradores.style.display = 'none';
    listaColaboradores.innerHTML = '';
    return;
  }

  try {
    const colaboradores = await api(`/api/collaborators?q=${encodeURIComponent(term)}`);

    listaColaboradores.innerHTML = '';

    if (!colaboradores.length) {
      listaColaboradores.style.display = 'none';
      return;
    }

    colaboradores.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-group-item list-group-item-action';

      const proyecto = c.proyecto_nombre || 'Sin proyecto';
      const cargo = c.cargo_nombre || '';
      const rut = c.rut || '';

      btn.innerHTML = `
        <div class="fw-semibold">${c.nombre}</div>
        <div class="small text-secondary">
          ${proyecto}${cargo ? ' · ' + cargo : ''}${rut ? ' · ' + rut : ''}
        </div>
      `;

      btn.addEventListener('click', () => {
        inputAsignadoA.value = c.nombre;

        if (hiddenColaboradorId) {
          hiddenColaboradorId.value = c.id;
        } 

        if (inputParqueProyecto) {
          inputParqueProyecto.value = c.proyecto_nombre || '';
        }

        if (inputEncargado) {
          inputEncargado.value = c.encargado_nombre || '';
        }


        listaColaboradores.style.display = 'none';
        listaColaboradores.innerHTML = '';
        inputAsignadoA.focus();
      });

      listaColaboradores.appendChild(btn);
    });

    listaColaboradores.style.display = 'block';
  } catch (err) {
    console.error('Error buscando colaboradores', err);
    listaColaboradores.style.display = 'none';
    listaColaboradores.innerHTML = '';
  }
}


// Escuchar mientras el usuario escribe
inputAsignadoA.addEventListener('input', () => {
  const term = inputAsignadoA.value.trim();

  if (hiddenColaboradorId) hiddenColaboradorId.value = '';

  clearTimeout(colabTimer);
  colabTimer = setTimeout(() => autocompletarColaboradores(term), 250);
});

// Ocultar lista si el input pierde foco (con pequeño delay)
inputAsignadoA.addEventListener('blur', () => {
  setTimeout(() => {
    listaColaboradores.style.display = 'none';
  }, 200);
});


// ==== BUSCADOR DE COLABORADORES ====
function limpiarHistorialColab() {
  colabHistorialWrapper.hidden = true;
  colabResumen.textContent = '';
  tbodyColabActivosActuales.innerHTML = `
    <tr><td colspan="7" class="text-secondary text-center py-3">
      Sin activos asignados.
    </td></tr>`;
  tbodyColabMovimientos.innerHTML = `
    <tr><td colspan="7" class="text-secondary text-center py-3">
      Sin movimientos registrados.
    </td></tr>`;
}

async function buscarColaboradores() {
  const q = (txtBuscarColab.value || '').trim();

  limpiarHistorialColab();

  if (!q) {
    tbodyColabResultados.innerHTML = `
      <tr><td colspan="6" class="text-warning text-center py-3">
        Ingresa RUT o nombre para buscar.
      </td></tr>`;
    return;
  }

  try {
    const data = await api(`/api/collaborators/search?q=${encodeURIComponent(q)}`);
    const items = data.items || [];

    if (!items.length) {
      tbodyColabResultados.innerHTML = `
        <tr><td colspan="6" class="text-warning text-center py-3">
          No se encontraron colaboradores con ese criterio.
        </td></tr>`;
      return;
    }

    tbodyColabResultados.innerHTML = '';

    for (const c of items) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.nombre}</td>
        <td>${c.rut || '-'}</td>
        <td>${c.cargo_nombre || '-'}</td>
        <td>${c.proyecto_nombre || '-'}</td>
        <td>${c.activo ? 'ACTIVO' : 'INACTIVO'}</td>
        <td>
          <button type="button"
                  class="btn btn-sm btn-outline-info btnVerHistColab"
                  data-id="${c.id}">
            Ver historial
          </button>
        </td>
      `;
      tbodyColabResultados.appendChild(tr);
    }

  } catch (err) {
    console.error(err);
    tbodyColabResultados.innerHTML = `
      <tr><td colspan="6" class="text-danger text-center py-3">
        Error al buscar colaboradores.
      </td></tr>`;
    showToast(err.message || 'Error al buscar colaboradores', 'danger');
  }
}

async function cargarHistorialColab(colabId, infoBasica) {
  try {
    const data = await api(`/api/collaborators/${colabId}/history`);
    const { colaborador, activosActuales, movimientos } = data;

    // Resumen
    colabResumen.textContent = `${colaborador.nombre} (${colaborador.rut || 'sin RUT'}) — ` +
      `${colaborador.cargo_nombre || 'Sin cargo'} — ` +
      `${colaborador.proyecto_nombre || 'Sin proyecto'}`;

    // Activos actuales
    if (!activosActuales.length) {
      tbodyColabActivosActuales.innerHTML = `
        <tr><td colspan="7" class="text-secondary text-center py-3">
          Sin activos asignados.
        </td></tr>`;
    } else {
      tbodyColabActivosActuales.innerHTML = '';
      for (const a of activosActuales) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${a.id}</td>
          <td>${a.categoria || '-'}</td>
          <td>${[a.marca, a.modelo].filter(Boolean).join(' ') || '-'}</td>
          <td>${a.serial_imei || '-'}</td>
          <td>${a.ubicacion || '-'}</td>
          <td>${a.estado || '-'}</td>
          <td>${a.fecha_asignacion ? a.fecha_asignacion : '-'}</td>
        `;
        tbodyColabActivosActuales.appendChild(tr);
      }
    }

    // Movimientos
    if (!movimientos.length) {
      tbodyColabMovimientos.innerHTML = `
        <tr><td colspan="7" class="text-secondary text-center py-3">
          Sin movimientos registrados.
        </td></tr>`;
    } else {
      tbodyColabMovimientos.innerHTML = '';
      for (const m of movimientos) {
        const tr = document.createElement('tr');
        const activoLabel = [
          m.categoria,
          m.marca,
          m.modelo,
          m.serial_imei
        ].filter(Boolean).join(' - ');

        const condicion = m.tipo === 'SALIDA'
          ? (m.condicion_salida || '')
          : (m.condicion_entrada || '');

        tr.innerHTML = `
          <td>${m.fecha_hora || '-'}</td>
          <td>${m.tipo}</td>
          <td>${activoLabel || '-'}</td>
          <td>${m.asignado_a || '-'}</td>
          <td>${m.ubicacion || '-'}</td>
          <td>${condicion || '-'}</td>
          <td>${m.usuario_responsable || '-'}</td>
        `;
        tbodyColabMovimientos.appendChild(tr);
      }
    }

    colabHistorialWrapper.hidden = false;
    showToast('Historial de colaborador cargado ✅', 'success');

  } catch (err) {
    console.error(err);
    showToast(err.message || 'Error al cargar historial del colaborador', 'danger');
  }
}

// Eventos del buscador
if (btnBuscarColab && txtBuscarColab) {
  btnBuscarColab.addEventListener('click', buscarColaboradores);

  txtBuscarColab.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      buscarColaboradores();
    }
  });

  // Delegación de eventos para botones "Ver historial"
  tbodyColabResultados.addEventListener('click', (e) => {
    const btn = e.target.closest('.btnVerHistColab');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (!id) return;
    cargarHistorialColab(id);
  });
}