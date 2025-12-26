// web/js/acta_entrega.js
import { api, $, showToast } from './api.js';

// --- Estado en memoria ---
let colaboradorSeleccionado = null;
let activosListado = [];
let activosSeleccionados = new Set();


let loadingOverlay = null;
let loadingMessage = null;

window.addEventListener('DOMContentLoaded', () => {
  loadingOverlay = $('#loadingOverlay');
  loadingMessage = $('#loadingMessage');
});


function showLoading (message) {
  if (!loadingOverlay) return;
  if (!loadingMessage) loadingMessage.textContent = message || 'Cargando...';
  loadingOverlay.classList.remove('d-none');
}

function hideLoading() {
  if (!loadingOverlay) return;
  loadingOverlay.classList.add('d-none');
}



// --- Auth + navbar ---
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
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } finally {
    location.href = '/login.html';
  }
});

// --- Helpers DOM ---
function setLoading(el, loading) {
  if (!el) return;
  if (loading) {
    el.dataset.originalText = el.textContent;
    el.textContent = 'Cargando...';
    el.disabled = true;
  } else {
    if (el.dataset.originalText) {
      el.textContent = el.dataset.originalText;
    }
    el.disabled = false;
  }
}

// ======================================================
// 1. BUSCAR COLABORADOR Y MOSTRAR EN LA TABLA IZQUIERDA
// ======================================================

const inputColab = $('#txtBuscarColaborador');
const tbodyColaboradores = $('#tbodyColaboradores');

$('#btnBuscarColaborador').addEventListener('click', async (e) => {
  e.preventDefault();

  const q = inputColab.value.trim();
  tbodyColaboradores.innerHTML = `
    <tr>
      <td colspan="4" class="text-secondary small">Buscando colaboradores...</td>
    </tr>
  `;

  if (!q) {
    tbodyColaboradores.innerHTML = `
      <tr>
        <td colspan="4" class="text-secondary small">
          Ingresa un nombre o RUT para buscar.
        </td>
      </tr>
    `;
    return;
  }

  try {
    const data = await api(`/api/collaborators/search?q=${encodeURIComponent(q)}`);
    if (!data.ok) {
      showToast('Error al buscar colaboradores.', 'danger');
      tbodyColaboradores.innerHTML = `
        <tr>
          <td colspan="4" class="text-danger small">Error al buscar colaboradores.</td>
        </tr>
      `;
      return;
    }

    const colaboradores = data.items || [];
    if (!colaboradores.length) {
      tbodyColaboradores.innerHTML = `
        <tr>
          <td colspan="4" class="text-secondary small">
            Sin resultados para "${q}".
          </td>
        </tr>
      `;
      return;
    }

    tbodyColaboradores.innerHTML = colaboradores.map(c => `
      <tr class="hover-row" data-id="${c.id}">
        <td><strong>${c.nombre}</strong></td>
        <td>${c.rut}</td>
        <td>${c.cargo_nombre || ''}</td>
        <td>
          <button type="button"
                  class="btn btn-sm btn-outline-info btnSeleccionarColab"
                  data-id="${c.id}">
            Seleccionar
          </button>
        </td>
      </tr>
    `).join('');

    // Click en botón "Seleccionar"
    tbodyColaboradores.querySelectorAll('.btnSeleccionarColab').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const colab = colaboradores.find(x => x.id === id);
        if (!colab) return;

        colaboradorSeleccionado = colab;
        inputColab.value = `${colab.nombre} (${colab.rut})`;

        renderInfoColaborador();
        cargarActivosPorColaborador();
      });
    });

    // Click en toda la fila (excepto el botón)
    tbodyColaboradores.querySelectorAll('tr.hover-row').forEach(tr => {
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        const id = parseInt(tr.dataset.id, 10);
        const colab = colaboradores.find(x => x.id === id);
        if (!colab) return;

        colaboradorSeleccionado = colab;
        inputColab.value = `${colab.nombre} (${colab.rut})`;

        renderInfoColaborador();
        cargarActivosPorColaborador();
      });
    });

  } catch (err) {
    console.error(err);
    showToast('Error al buscar colaboradores.', 'danger');
    tbodyColaboradores.innerHTML = `
      <tr>
        <td colspan="4" class="text-danger small">Error al buscar colaboradores.</td>
      </tr>
    `;
  }
});

// Panel con info del colaborador seleccionado
function renderInfoColaborador() {
  const cont = $('#panelColaboradorSeleccionado');
  if (!colaboradorSeleccionado) {
    cont.innerHTML = 'Ningún colaborador seleccionado.';
    return;
  }

  cont.innerHTML = `
    <div><strong>${colaboradorSeleccionado.nombre}</strong></div>
    <div class="small">RUT: ${colaboradorSeleccionado.rut}</div>
    <div class="small">Cargo: ${colaboradorSeleccionado.cargo_nombre || '-'}</div>
    <div class="small">Proyecto / Área: ${colaboradorSeleccionado.proyecto_nombre || '-'}</div>
    <div class="small">
      Estado: ${
        colaboradorSeleccionado.activo
          ? '<span class="text-success">ACTIVO</span>'
          : '<span class="text-danger">INACTIVO</span>'
      }
    </div>
  `;
}

// ======================================================
// 2. ACTIVOS DEL COLABORADOR + BÚSQUEDA MANUAL
// ======================================================


async function cargarActivosPorColaborador() {
  if (!colaboradorSeleccionado) {
    showToast("Primero selecciona un colaborador.", "warning");
    return;
  }

  try {
    console.log(
      "[ACTA] Cargando activos para colaborador id=",
      colaboradorSeleccionado.id
    );

    const res = await api(
      `/api/collaborators/${colaboradorSeleccionado.id}/history`
    );

    console.log("[ACTA] Respuesta /history =", res);

    // Usamos SOLO los activos actualmente asignados
    const activos = res.activosActuales || [];

    activosListado = activos;
    activosSeleccionados = new Set();

    // Marcamos todos por defecto
    activosListado.forEach((a) => activosSeleccionados.add(a.id));

    renderActivos(activosListado);
    actualizarResumenSeleccion();
  } catch (err) {
    console.error("[ACTA] Error al cargar activos del colaborador:", err);
    showToast("Error al cargar activos del colaborador.", "danger");
  }
}




// Buscar activos manualmente
$('#btnBuscarActivos').addEventListener('click', async (e) => {
  e.preventDefault();

  const q = $('#txtBuscarActivo').value.trim();
  const btn = $('#btnBuscarActivos');
  const tbody = $('#tbodyActivos');

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="text-secondary small">Buscando activos...</td>
    </tr>
  `;

  const params = new URLSearchParams();
  if (q) params.append('q', q);

  setLoading(btn, true);
  try {
    const data = await api(`/api/activos?${params.toString()}`);

    let items;
    if (Array.isArray(data)) {
      items = data;
    } else if (Array.isArray(data.items)) {
      items = data.items;
    } else if (data.ok && Array.isArray(data.items)) {
      items = data.items;
    } else {
      console.warn('Formato inesperado de /api/activos (búsqueda):', data);
      items = [];
    }

    activosListado = items;
    activosSeleccionados = new Set();
    renderActivos(activosListado);
    actualizarResumenSeleccion();
  } catch (err) {
    console.error('Error al buscar activos:', err);
    showToast('Error al buscar activos.', 'danger');
  } finally {
    setLoading(btn, false);
  }
});



// Botón "Solo del colaborador"
$('#btnBuscarPorColaborador').addEventListener('click', (e) => {
  e.preventDefault();
  if (!colaboradorSeleccionado) {
    showToast('Primero selecciona un colaborador.', 'warning');
    return;
  }
  cargarActivosPorColaborador();
});

// ======================================================
// 3. TABLA DE ACTIVOS DERECHA
// ======================================================

function renderActivos(items) {
  const tbody = $('#tbodyActivos');

  if (!items.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted py-4">
          No hay activos para mostrar.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map(a => {
    const checked = activosSeleccionados.has(a.id) ? 'checked' : '';
    const equipo = `${(a.categoria || '').toUpperCase()} ${a.marca || ''} ${a.modelo || ''}`.trim();

    const hostnameLinea = a.hostname
      ? `<div class="small text-info">Hostname: ${a.hostname}</div>`
      : '';

    const nombreEquipoLinea = a.nombre_equipo
      ? `<div class="small text-muted">${a.nombre_equipo}</div>`
      : '';

    // ✅ Estado por equipo (si no existe, NUEVO)
    const estado = (a.estado_entrega || '').toUpperCase();

    return `
      <tr>
        <td>
          <input type="checkbox" class="form-check-input chkActivo" data-id="${a.id}" ${checked} />
        </td>
        <td>${a.id}</td>
        <td>
          <div>${equipo || 'Equipo'}</div>

          <select class="form-select form-select-sm mt-1 selEstadoEntrega" data-id="${a.id}">
            <option value="" disabled ${!estado ? 'selected' : ''}>-- Estado de entrega --</option>
            <option value="NUEVO" ${estado === 'NUEVO' ? 'selected' : ''}>NUEVO</option>
            <option value="USADO" ${estado === 'USADO' ? 'selected' : ''}>USADO</option>
          </select>

          ${hostnameLinea}
          ${nombreEquipoLinea}
        </td>
        <td>${a.serial_imei || ''}</td>
        <td class="small text-secondary">${a.colaborador_actual || '-'}</td>
      </tr>
    `;
  }).join('');

  // ✅ Eventos checkbox (igual que antes)
  tbody.querySelectorAll('.chkActivo').forEach(chk => {
    chk.addEventListener('change', () => {
      const id = parseInt(chk.dataset.id, 10);
      if (chk.checked) activosSeleccionados.add(id);
      else activosSeleccionados.delete(id);

      actualizarResumenSeleccion();
    });
  });

  // ✅ Evento selector estado: se guarda en el objeto del activo
  tbody.querySelectorAll('.selEstadoEntrega').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = parseInt(sel.dataset.id, 10);
      const activo = activosListado.find(x => x.id === id);
      if (activo) {
        activo.estado_entrega = sel.value; // "NUEVO" o "USADO"
      }
    });
  });
}


// Seleccionar / deseleccionar todos
$('#chkTodosActivos').addEventListener('change', (e) => {
  const marcar = e.target.checked;
  activosSeleccionados = new Set();
  activosListado.forEach(a => {
    if (marcar) activosSeleccionados.add(a.id);
  });
  renderActivos(activosListado);
  actualizarResumenSeleccion();
});

// Resumen de selección
function actualizarResumenSeleccion() {
  $('#lblResumenSeleccion').textContent = `${activosSeleccionados.size} activos seleccionados`;
}

// ======================================================
// 4. GENERAR ACTA (PDF EN BACKEND + REGISTRO EN BD)
// ======================================================

// --- Generar PDF usando el backend (Word + LibreOffice) ---
$('#btnGenerarActa').addEventListener('click', async (e) => {
  e.preventDefault();

  if (!colaboradorSeleccionado) {
    showToast('Selecciona un colaborador primero.', 'warning');
    return;
  }

  const activos = activosListado.filter(a => activosSeleccionados.has(a.id)).map(a => ({...a, estado_entrega: a.estado_entrega || 'NUEVO'}));

  const extras = {
    fecha: $('#acta_fecha').value,
    centro_costo: $('#acta_centro_costo').value.trim(),
    descripcion_entrega: $('#descripcion_entrega').value.trim(),
    observaciones_generales: $('#acta_observaciones_generales').value.trim(),
    representante_empresa: $('#acta_representante_empresa').value.trim()
  };

  if (!extras.fecha) {
    showToast('Ingresa la fecha del acta.', 'warning');
    return;
  }

  const btn = $('#btnGenerarActa');

  try {
    // 🔹 Mostrar overlay y deshabilitar botón
    showLoading('Generando acta, por favor espera...');
    if (btn) {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.textContent = 'Generando...';
    }

    const resp = await fetch('/api/actas/entrega', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        colaborador: {
          id: colaboradorSeleccionado.id,
          nombre: colaboradorSeleccionado.nombre,
          rut: colaboradorSeleccionado.rut,
          cargo_nombre: colaboradorSeleccionado.cargo_nombre,
          proyecto_nombre: colaboradorSeleccionado.proyecto_nombre,
          activo: colaboradorSeleccionado.activo,
        },
        equipos: activos,
        extras,
      }),
    });

    const data = await resp.json();

    if (!resp.ok || !data.ok) {
      console.error('Error al generar acta:', data);
      showToast('Error al generar y guardar el acta en el servidor.', 'danger');
      return;
    }

    showToast(
      `Acta generada correctamente. ID: ${data.actaId}`,
      'success'
    );

    // Abrir el PDF
    const url = `/api/actas/${data.actaId}/pdf`;
    window.open(url, '_blank');
  } catch (err) {
    console.error('Error en la petición de acta:', err);
    showToast('Error al generar la acta.', 'danger');
  } finally {
    // 🔹 Ocultar overlay y restaurar botón
    hideLoading();
    if (btn) {
      btn.disabled = false;
      if (btn.dataset.originalText) {
        btn.textContent = btn.dataset.originalText;
      }
    }
  }
});


