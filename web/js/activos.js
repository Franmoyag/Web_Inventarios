import { api, $, showToast } from "./api.js";

/* ===============================
   ELEMENTOS DEL DOM
=============================== */
const tablaBody = $("#tablaActivosBody");
const emptyMsg = $("#emptyMsg");
const errorMsg = $("#errorMsg");

const txtSearch = $("#txtSearch");
const filtroCategoria = $("#filtroCategoria");
const filtroEstado = $("#filtroEstado");

const userInfoEl = $("#userInfo");
const btnLogout = $("#btnLogout");

const modalEditEl = $("#modalEditActivo");
const btnGuardarCambios = $("#btnGuardarCambios");

const modalDetalleEl   = $('#modalDetalleActivo');
const detalleContenido = $('#detalleContenido');

const pageInfoEl = $("#pageInfo");
const btnPrev = $("#btnPrev");
const btnNext = $("#btnNext");

/* Modal de acciones por fila */
const modalActionsEl = $("#modalRowActions");
const btnAccVerHistorial = $("#btnAccVerHistorial");
const btnAccEditar = $("#btnAccEditar");
const btnAccEliminar = $("#btnAccEliminar");
const rowActionIdInput = $("#rowAction_id");

/* Botón ver historial desde Acciones (si lo usas en otra parte) */
const btnVerHistorialSeleccionado = $("#btnVerHistorialSeleccionado");

/* Modal cambio de estado */
const modalEstadoEl = $("#modalEstadoActivo");
const btnGuardarEstado = $("#btnGuardarEstado");


/* Modal reasignar colaborador */
const modalReasignarEl = $("#modalReasignarColab");
const btnConfirmarReasignacion = $("#btnConfirmarReasignacion");
const btnAccReasignar = $("#btnAccReasignar");
const formReasignarColab = $("#formReasignarColab");

const inputReasignColabNuevo = $("#reasign_colab_nuevo"); 
const listaColabReasign = $("#listaColabReasign");


let selectedActivoId = null;

/* ===============================
   CLICK EN TABLA (ESTADO o SELECCIÓN)
=============================== */
tablaBody.addEventListener("click", (ev) => {
  // Si el click fue en el botón "Ver detalles", no hacemos selección acá
  if (ev.target.closest(".btn-ver-detalle")) {
    return;
  }

  const btnEstado = ev.target.closest("[data-role='estado-activo']");
  if (btnEstado) {
    ev.preventDefault();
    ev.stopPropagation();

    const id = btnEstado.dataset.id;
    const estadoActual = btnEstado.dataset.estado || "";

    abrirModalEstado(id, estadoActual);
    return;
  }

  const tr = ev.target.closest("tr[data-id]");
  if (!tr) return;

  selectedActivoId = tr.dataset.id;

  document.querySelectorAll("tr.hoverable-row").forEach((row) => {
    row.classList.toggle("table-active", row === tr);
  });
});

// ===========================
// ABRIR MODAL DE ACCIONES
// ===========================
function abrirModalAcciones(id) {
  rowActionIdInput.value = id;

  const modal = new bootstrap.Modal(modalActionsEl);
  modal.show();
}

// Activar modal al hacer click en la fila (si no fue click en el estado ni en "Ver detalles")
tablaBody.addEventListener("click", (ev) => {
  if (ev.target.closest(".btn-ver-detalle")) return;
  if (ev.target.closest("[data-role='estado-activo']")) return;

  const tr = ev.target.closest("tr[data-id]");
  if (!tr) return;

  const id = tr.dataset.id;
  abrirModalAcciones(id);
});

/* ===============================
   ESTADO LOCAL
=============================== */
let allItems = [];
let filteredItems = [];
let currentPage = 1;
const pageSize = 20;
let currentUser = null;

// Activo que se está reasignando
let itemEnReasignacion = null;

/* ===============================
   SESIÓN
=============================== */
(async () => {
  try {
    const me = await api("/api/auth/me");
    if (!me.user) {
      location.href = "/login.html";
      return;
    }
    currentUser = me.user;
    userInfoEl.textContent = `${me.user.nombre} (${me.user.role})`;
  } catch {
    location.href = "/login.html";
  }
})();

btnLogout.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  location.href = "/login.html";
});

/* ===============================
   HELPERS
=============================== */
function estadoBadge(estado) {
  const e = (estado || "").toUpperCase();
  let cls = "bg-secondary";
  if (e === "DISPONIBLE") cls = "bg-success";
  else if (e === "ASIGNADO") cls = "bg-info";
  else if (e === "REPARACION" || e === "MANTENCION")
    cls = "bg-warning text-dark";
  else if (e === "BAJA" || e === "OBSOLETO") cls = "bg-danger";
  return `<span class="badge ${cls}">${e || "-"}</span>`;
}

/* ===============================
   FILA TABLA
=============================== */
function rowHTML(item) {
  const asignados = item.asignados_actuales || item.colaborador_actual || '-';

  return `
    <tr class="hoverable-row" data-id="${item.id}">
      <td class="text-secondary small">${item.id ?? ''}</td>
      <td class="text-info fw-semibold">${item.categoria ?? ''}</td>
      <td>
        <div class="fw-semibold">${item.marca ?? ''} ${item.modelo ?? ''}</div>
        <div class="text-secondary small">${item.nombre ?? ''}</div>
      </td>
      <td class="small">
        ${item.serial_imei ?? ''}
        ${item.iccid ? `<div class="text-secondary">SIM: ${item.iccid}</div>` : ''}
        ${item.telefono ? `<div class="text-secondary">Tel: ${item.telefono}</div>` : ''}
      </td>
      <td class="small">${item.hostname ?? ''}</td>
      <td class="small">${estadoBadge(item.estado)}</td>
      <td class="small">
        ${asignados}
        ${item.usuario_login ? `<div class="text-secondary">${item.usuario_login}</div>` : ''}
        ${item.parque_proyecto ? `<div class="text-secondary">${item.parque_proyecto}</div>` : ''}
        ${item.encargado ? `<div class="text-secondary">${item.encargado}</div>` : ''}
      </td>
      <td class="small">${item.ubicacion ?? '-'}</td>
      <td class="small text-secondary">${item.observaciones ?? ''}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-info btnEditar" data-id="${item.id}">
          Editar
        </button>
      </td>
    </tr>
  `;
}


/* ===============================
   FILTROS
=============================== */
function getPageSlice() {
  const start = (currentPage - 1) * pageSize;
  return filteredItems.slice(start, start + pageSize);
}

function applyFilters() {
  const q = (txtSearch.value || "").trim().toLowerCase();
  const cat = (filtroCategoria.value || "").trim().toLowerCase();
  const est = (filtroEstado.value || "").trim().toUpperCase();

  filteredItems = allItems.filter((it) => {
    const matchQ =
      !q ||
      String(it.id || "").toLowerCase().includes(q) ||
      (it.serial_imei || "").toLowerCase().includes(q) ||
      (it.nombre || "").toLowerCase().includes(q) ||
      (it.colaborador_actual || "").toLowerCase().includes(q);

    const matchCat = !cat || (it.categoria || "").toLowerCase() === cat;
    const matchEst = !est || (it.estado || "").toUpperCase() === est;

    return matchQ && matchCat && matchEst;
  });

  currentPage = 1;
  renderPage();
}

txtSearch.addEventListener("input", () => {
  clearTimeout(window.searchDebounce);
  window.searchDebounce = setTimeout(applyFilters, 200);
});
filtroCategoria.addEventListener("change", applyFilters);
filtroEstado.addEventListener("change", applyFilters);

/* ===============================
   RENDER
=============================== */
function renderPage() {
  errorMsg.classList.add("d-none");
  emptyMsg.classList.add("d-none");

  const pageRows = getPageSlice();

  if (pageRows.length === 0) {
    tablaBody.innerHTML = "";
    emptyMsg.classList.remove("d-none");
  } else {
    tablaBody.innerHTML = pageRows.map(rowHTML).join("");
  }

  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / pageSize)
  );
  pageInfoEl.textContent = `Página ${currentPage} de ${totalPages} — ${filteredItems.length} resultados`;

  btnPrev.disabled = currentPage <= 1;
  btnNext.disabled = currentPage >= totalPages;
}

/* ===============================
   PAGINACIÓN
=============================== */
btnPrev.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderPage();
  }
});

btnNext.addEventListener("click", () => {
  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / pageSize)
  );
  if (currentPage < totalPages) {
    currentPage++;
    renderPage();
  }
});

/* ===============================
   CARGA INICIAL
=============================== */
async function cargarActivosDesdeAPI() {
  try {
    const data = await api("/api/assets");
    allItems = data.items || data || [];
    filteredItems = [...allItems];
    renderPage();
  } catch (err) {
    console.error("Error cargando activos:", err);
    errorMsg.classList.remove("d-none");
  }
}

cargarActivosDesdeAPI();

/* ===============================
   EDICIÓN DESDE ACCIONES
=============================== */
function abrirModalEdicionDesdeAcciones() {
  const id = rowActionIdInput.value;
  if (!id) {
    showToast("No se encontró el ID del activo para editar.", "danger");
    return;
  }

  const item = allItems.find((x) => String(x.id) === String(id));
  if (!item) {
    showToast("No se encontró el activo en memoria.", "danger");
    return;
  }

  // Rellenar campos del modal de edición
  $("#edit_id").value = item.id;
  $("#edit_hostname").value = item.hostname || "";
  $("#edit_nb_ssd").value = item.nb_ssd || "";
  $("#edit_nb_ram").value = item.nb_ram || "";
  $("#edit_nb_so").value = item.nb_so || "";
  $("#edit_iccid").value = item.iccid || "";
  $("#edit_telefono").value = item.telefono || "";
  $("#edit_motivo").value = "";

  // Mostrar/ocultar grupos según categoría
  const cat = (item.categoria || "").toLowerCase();
  const isNotebook =
    cat.includes("note") || cat.includes("laptop") || cat.includes("nb");
  const isCelular =
    cat.includes("celu") ||
    cat.includes("phone") ||
    cat.includes("móvi") ||
    cat.includes("movil");

  document
    .querySelectorAll(".edit-notebook-group")
    .forEach((el) => el.classList.toggle("d-none", !isNotebook));
  document
    .querySelectorAll(".edit-celular-group")
    .forEach((el) => el.classList.toggle("d-none", !isCelular));

  // Cerrar modal de acciones
  const accInstance = bootstrap.Modal.getInstance(modalActionsEl);
  if (accInstance) accInstance.hide();

  // Abrir modal de edición
  const editInstance = new bootstrap.Modal(modalEditEl);
  editInstance.show();
}

/* Listener de botón EDITAR en modal de acciones */
if (btnAccEditar) {
  btnAccEditar.addEventListener("click", () => {
    abrirModalEdicionDesdeAcciones();
  });
}

/* ===============================
   REASIGNAR COLABORADOR
=============================== */
function abrirModalReasignarDesdeAcciones() {
  
  const id = rowActionIdInput.value;
  if (!id) {
    showToast("No se encontró el ID del activo para reasignar.", "danger");
    return;
  }

  const item = allItems.find((x) => String(x.id) === String(id));
  if (!item) {
    showToast("No se encontró el activo en memoria.", "danger");
    return;
  }

  itemEnReasignacion = item;

  // Rellenar campos del modal
  $("#reasign_id").value = item.id;
  $("#reasign_activo").value =
    `${item.marca || ""} ${item.modelo || ""} — ${item.serial_imei || ""}`.trim();
  $("#reasign_colab_actual").value = item.colaborador_actual || "";
  $("#reasign_colab_nuevo").value = "";
  $("#reasign_notas").value = "";


  // NUEVO → limpiar sugerencias cada vez que abras el modal:
  if (listaColabReasign) {
      listaColabReasign.innerHTML = "";
      listaColabReasign.style.display = "none";
  }


  // Cerrar modal de acciones y abrir el de reasignación
  const accInstance = bootstrap.Modal.getInstance(modalActionsEl);
  if (accInstance) accInstance.hide();

  const reasignInstance = new bootstrap.Modal(modalReasignarEl);
  reasignInstance.show();
}

if (btnAccReasignar) {
  btnAccReasignar.addEventListener("click", () => {
    abrirModalReasignarDesdeAcciones();
  });
}

if (btnConfirmarReasignacion) {
  btnConfirmarReasignacion.addEventListener("click", async () => {
    const id = $("#reasign_id").value;
    const nuevoColab = $("#reasign_colab_nuevo").value.trim();
    const notas = $("#reasign_notas").value.trim();

    if (!id) {
      showToast("No se encontró el activo para reasignar.", "danger");
      return;
    }

    if (!nuevoColab) {
      showToast("Debes indicar el nuevo colaborador.", "warning");
      return;
    }

    const item = allItems.find((x) => String(x.id) === String(id));
    if (!item) {
      showToast("No se encontró el activo en memoria.", "danger");
      return;
    }

    const anteriorColab = item.colaborador_actual || "SIN ASIGNAR";

    // Texto que verás en el historial
    const condicionSalida = "REASIGNACION";

    // 👇 Body EXACTO que espera /api/movements
    const body = {
      activo_id: Number(id),        // 👈 CLAVE: debe llamarse activo_id
      tipo: "SALIDA",               // seguimos usando SALIDA para que el backend actualice el activo
      asignado_a: nuevoColab,
      ubicacion: item.ubicacion || "OFICINA",
      condicion_salida: condicionSalida,
      condicion_entrada: null,
      notas: notas || null,
      usuario_login: item.usuario_login || null,
      supervisor: item.encargado || null,
      parque_proyecto: item.parque_proyecto || null,
      compartido: item.compartido ?? null,
      fecha_asignacion: null,
      fecha_baja: null
    };

    try {
      await api("/api/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      // actualizar el activo en memoria
      const idx = allItems.findIndex((x) => String(x.id) === String(id));
      if (idx !== -1) {
        allItems[idx] = {
          ...allItems[idx],
          estado: "ASIGNADO",
          colaborador_actual: nuevoColab
        };
      }

      applyFilters(); // vuelve a dibujar la tabla

      const reasignInstance = bootstrap.Modal.getInstance(modalReasignarEl);
      if (reasignInstance) reasignInstance.hide();

      showToast("Reasignación registrada correctamente ✔", "success");
    } catch (err) {
      console.error("Error al registrar la reasignación:", err);
      showToast("Error al registrar la reasignación.", "danger");
    }
  });
}




/* Guardar cambios del modal de edición */
if (btnGuardarCambios) {
  btnGuardarCambios.addEventListener("click", async () => {
    const id = $("#edit_id").value;
    if (!id) {
      showToast("No se encontró el activo para guardar cambios.", "danger");
      return;
    }

    const item = allItems.find((x) => String(x.id) === String(id));
    if (!item) {
      showToast("No se encontró el activo en memoria.", "danger");
      return;
    }

    const cat = (item.categoria || "").toLowerCase();
    const isNotebook =
      cat.includes("note") || cat.includes("laptop") || cat.includes("nb");
    const isCelular =
      cat.includes("celu") ||
      cat.includes("phone") ||
      cat.includes("móvi") ||
      cat.includes("movil");

    const body = {};
    if (isNotebook) {
      body.hostname = $("#edit_hostname").value.trim() || null;
      body.nb_ssd = $("#edit_nb_ssd").value.trim() || null;
      body.nb_ram = $("#edit_nb_ram").value.trim() || null;
      body.nb_so = $("#edit_nb_so").value.trim() || null;
    }
    if (isCelular) {
      body.iccid = $("#edit_iccid").value.trim() || null;
      body.telefono = $("#edit_telefono").value.trim() || null;
    }

    const motivo = $("#edit_motivo").value.trim();
    if (motivo) {
      body.motivo = motivo;
    }

    if (!Object.keys(body).length) {
      showToast("No hay cambios para guardar.", "warning");
      return;
    }

    try {
      await api(`/api/assets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const idx = allItems.findIndex((x) => String(x.id) === String(id));
      if (idx !== -1) {
        allItems[idx] = { ...allItems[idx], ...body };
      }

      renderPage();

      const editInstance = bootstrap.Modal.getInstance(modalEditEl);
      if (editInstance) editInstance.hide();

      showToast("Cambios guardados correctamente ✔", "success");
    } catch (err) {
      console.error("Error al guardar cambios:", err);
      showToast("Error al guardar cambios del activo.", "danger");
    }
  });
}

/* ===============================
   MODAL CAMBIO DE ESTADO
=============================== */
function abrirModalEstado(id, estadoActual) {
  const item = allItems.find((x) => String(x.id) === String(id));
  if (!item) {
    showToast("No se encontró el activo en memoria", "danger");
    return;
  }

  $("#estado_id").value = item.id;
  $("#estado_actual").value = estadoActual;
  $("#estado_nuevo").value = estadoActual;
  $("#estado_motivo").value = "";

  const modal = new bootstrap.Modal(modalEstadoEl);
  modal.show();
}

if (btnGuardarEstado) {
  btnGuardarEstado.addEventListener("click", async () => {
    const id = $("#estado_id").value;
    const nuevoEstado = $("#estado_nuevo").value;
    const motivo = $("#estado_motivo").value.trim() || null;

    if (!id) {
      showToast("No se encontró el activo", "danger");
      return;
    }

    try {
      await api(`/api/assets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado, motivo }),
      });

      const idx = allItems.findIndex((x) => String(x.id) === String(id));
      if (idx !== -1) {
        allItems[idx].estado = nuevoEstado;
      }

      renderPage();

      const instance = bootstrap.Modal.getInstance(modalEstadoEl);
      if (instance) instance.hide();

      showToast("Estado actualizado correctamente ✔", "success");
    } catch (err) {
      console.error(err);
      showToast("Error al actualizar estado", "danger");
    }
  });
}

/* ===============================
   VER HISTORIAL DESDE ACTIVOS
=============================== */

// Botón "Ver historial" dentro del modal de acciones
if (btnAccVerHistorial) {
  btnAccVerHistorial.addEventListener("click", () => {
    const id = rowActionIdInput.value;
    if (!id) {
      showToast("No se encontró el activo para historial.", "warning");
      return;
    }

    const accInstance = bootstrap.Modal.getInstance(modalActionsEl);
    if (accInstance) accInstance.hide();

    window.location.href = `./movimientos.html?asset=${id}`;
  });
}

// Botón "Ver historial" general (si lo usas en otra parte de la vista)
if (btnVerHistorialSeleccionado) {
  btnVerHistorialSeleccionado.addEventListener("click", () => {
    if (!selectedActivoId) {
      showToast("Selecciona un activo primero", "warning");
      return;
    }

    window.location.href = `./movimientos.html?asset=${selectedActivoId}`;
  });
}

/* ===============================
   ELIMINAR ACTIVO
=============================== */
if (btnAccEliminar) {
  btnAccEliminar.addEventListener("click", async () => {
    const id = rowActionIdInput.value;
    if (!id) {
      showToast("No se encontró el activo para eliminar.", "danger");
      return;
    }

    const ok = window.confirm(
      `¿Seguro que deseas eliminar el activo ID ${id}? Esta acción no se puede deshacer.`
    );
    if (!ok) return;

    try {
      await api(`/api/assets/${id}`, { method: "DELETE" });

      allItems = allItems.filter((x) => String(x.id) !== String(id));
      applyFilters(); // recalcula filtered + render

      const accInstance = bootstrap.Modal.getInstance(modalActionsEl);
      if (accInstance) accInstance.hide();

      showToast("Activo eliminado correctamente.", "success");
    } catch (err) {
      console.error("Error eliminando activo:", err);
      showToast("No se pudo eliminar el activo.", "danger");
    }
  });
}


/* ===============================
   DETALLE DE ACTIVO
=============================== */

// Construye el HTML del detalle
function buildDetalleHTML(item) {
  const fmt = (v) =>
    v && String(v).trim()
      ? String(v)
      : '<span class="text-secondary">-</span>';

  const partes = [];

  // Datos generales
  partes.push(`
    <div class="mb-3">
      <h6 class="text-info mb-1">Datos generales</h6>
      <div class="row small">
        <div class="col-md-6">
          <div><span class="text-secondary">ID:</span> ${fmt(item.id)}</div>
          <div><span class="text-secondary">Categoría:</span> ${fmt(item.categoria)}</div>
          <div><span class="text-secondary">Nombre:</span> ${fmt(item.nombre)}</div>
          <div><span class="text-secondary">Estado:</span> ${fmt((item.estado || "").toUpperCase())}</div>
        </div>
        <div class="col-md-6">
          <div><span class="text-secondary">Marca:</span> ${fmt(item.marca)}</div>
          <div><span class="text-secondary">Modelo:</span> ${fmt(item.modelo)}</div>
          <div><span class="text-secondary">Ubicación:</span> ${fmt(item.ubicacion)}</div>
          <div><span class="text-secondary">Colaborador actual:</span> ${fmt(item.colaborador_actual)}</div>
        </div>
      </div>
    </div>
  `);

  // Identificación / móvil
  partes.push(`
    <div class="mb-3">
      <h6 class="text-info mb-1">Identificación</h6>
      <div class="row small">
        <div class="col-md-6">
          <div><span class="text-secondary">Serie / IMEI:</span> ${fmt(item.serial_imei)}</div>
          <div><span class="text-secondary">Hostname:</span> ${fmt(item.hostname)}</div>
        </div>
        <div class="col-md-6">
          <div><span class="text-secondary">ICCID SIM:</span> ${fmt(item.iccid)}</div>
          <div><span class="text-secondary">Teléfono:</span> ${fmt(item.telefono)}</div>
        </div>
      </div>
    </div>
  `);

  // Proyecto / responsable
  if (item.parque_proyecto || item.usuario_login || item.encargado) {
    partes.push(`
      <div class="mb-3">
        <h6 class="text-info mb-1">Proyecto / responsable</h6>
        <div class="row small">
          <div class="col-md-6">
            <div><span class="text-secondary">Proyecto / parque:</span> ${fmt(item.parque_proyecto)}</div>
            <div><span class="text-secondary">Usuario login:</span> ${fmt(item.usuario_login)}</div>
          </div>
          <div class="col-md-6">
            <div><span class="text-secondary">Encargado:</span> ${fmt(item.encargado)}</div>
          </div>
        </div>
      </div>
    `);
  }

  // Especificaciones notebook (solo si hay datos)
  if (item.nb_ssd || item.nb_ram || item.nb_so || item.nb_cpu || item.nb_mobo || item.nb_tpm2) {
    partes.push(`
      <div class="mb-3">
        <h6 class="text-info mb-1">Especificaciones notebook</h6>
        <div class="row small">
          <div class="col-md-6">
            <div><span class="text-secondary">SSD:</span> ${fmt(item.nb_ssd)}</div>
            <div><span class="text-secondary">RAM:</span> ${fmt(item.nb_ram)}</div>
            <div><span class="text-secondary">Placa madre:</span> ${fmt(item.nb_mobo)}</div>
          </div>
          <div class="col-md-6">
            <div><span class="text-secondary">CPU:</span> ${fmt(item.nb_cpu)}</div>
            <div><span class="text-secondary">Sistema operativo:</span> ${fmt(item.nb_so)}</div>
            <div><span class="text-secondary">TPM:</span> ${fmt(item.nb_tpm2)}</div>
          </div>
        </div>
      </div>
    `);
  }

  // Fechas
  if (item.fecha_asignacion || item.fecha_baja || item.fecha_creacion) {
    partes.push(`
      <div class="mb-3">
        <h6 class="text-info mb-1">Fechas</h6>
        <div class="row small">
          <div class="col-md-6">
            <div><span class="text-secondary">Fecha asignación:</span> ${fmt(item.fecha_asignacion)}</div>
            <div><span class="text-secondary">Fecha baja:</span> ${fmt(item.fecha_baja)}</div>
          </div>
          <div class="col-md-6">
            <div><span class="text-secondary">Fecha creación:</span> ${fmt(item.fecha_creacion)}</div>
          </div>
        </div>
      </div>
    `);
  }

  // Observaciones
  partes.push(`
    <div class="mb-2">
      <h6 class="text-info mb-1">Observaciones</h6>
      <div>${fmt(item.observaciones)}</div>
    </div>
  `);

  return partes.join("\n");
}

function abrirModalDetalle(item) {
  if (!detalleContenido || !modalDetalleEl) {
    console.warn("Modal de detalle no está definido en el DOM.");
    return;
  }

  detalleContenido.innerHTML = buildDetalleHTML(item);
  const modal = new bootstrap.Modal(modalDetalleEl);
  modal.show();
}

/* Listener para el botón "Ver detalles" en la tabla */
tablaBody.addEventListener("click", (ev) => {
  const btnDetalle = ev.target.closest(".btn-ver-detalle");
  if (!btnDetalle) return;

  ev.preventDefault();
  ev.stopPropagation();

  const id = btnDetalle.dataset.id;
  const item = allItems.find((x) => String(x.id) === String(id));

  if (!item) {
    showToast("No se encontró el activo en memoria.", "danger");
    return;
  }

  abrirModalDetalle(item);
});


/* ===============================
   AUTOCOMPLETAR COLABORADOR NUEVO (REASIGNACIÓN)
=============================== */

let colabReasignTimer = null;

async function buscarColaboradoresReasign(term) {
  if (!term || term.length < 2) {
    listaColabReasign.style.display = "none";
    listaColabReasign.innerHTML = "";
    return;
  }

  try {
    const colaboradores = await api(`/api/collaborators?q=${encodeURIComponent(term)}`);

    listaColabReasign.innerHTML = "";

    if (!colaboradores.length) {
      listaColabReasign.style.display = "none";
      return;
    }

    colaboradores.forEach(c => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "list-group-item list-group-item-action";

      const proyecto = c.proyecto_nombre || "Sin proyecto";
      const cargo = c.cargo_nombre || "";
      const rut = c.rut || "";

      btn.innerHTML = `
        <div class="fw-semibold">${c.nombre}</div>
        <div class="small text-secondary">
          ${proyecto}${cargo ? " · " + cargo : ""}${rut ? " · " + rut : ""}
        </div>
      `;

      btn.addEventListener("click", () => {
        inputReasignColabNuevo.value = c.nombre;
        listaColabReasign.style.display = "none";
        listaColabReasign.innerHTML = "";
        inputReasignColabNuevo.focus();
      });

      listaColabReasign.appendChild(btn);
    });

    listaColabReasign.style.display = "block";

  } catch (err) {
    console.error("Error buscando colaboradores (reasignación):", err);
    listaColabReasign.style.display = "none";
    listaColabReasign.innerHTML = "";
  }
}

if (inputReasignColabNuevo) {
  inputReasignColabNuevo.addEventListener("input", () => {
    const term = inputReasignColabNuevo.value.trim();
    clearTimeout(colabReasignTimer);
    colabReasignTimer = setTimeout(() => buscarColaboradoresReasign(term), 250);
  });

  inputReasignColabNuevo.addEventListener("blur", () => {
    setTimeout(() => {
      listaColabReasign.style.display = "none";
    }, 200);
  });
}
