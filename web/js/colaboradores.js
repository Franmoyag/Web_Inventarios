import { api, $, $all, showToast } from "./api.js";

const cardsContainer = $("#cardsContainer");
const selectedInfoEl = $("#selectedInfo");
const selectedTitleEl = $("#selectedTitle");
const selectedSubtitleEl = $("#selectedSubtitle");
const selectedCountEl = $("#selectedCount");

const tablaBody = $("#tablaColaboradoresBody");
const emptyMsg = $("#emptyMsg");
const errorMsg = $("#errorMsg");
const txtSearch = $("#txtSearch");

const btnGroupProyectos = $("#btnGroupProyectos");
const btnGroupEncargados = $("#btnGroupEncargados");

const userInfoEl = $("#userInfo");
const btnLogout = $("#btnLogout");

const viewHeader = $("#viewHeader");
const btnBackToCards = $("#btnBackToCards");

let currentGroup = "proyectos";
let summaryItems = [];
let currentDetails = [];
let selectedId = null;


function enterDetailMode() {
  // Oculta el resumen (cards + header) y muestra solo la tabla
  if (viewHeader) viewHeader.classList.add("d-none");
  cardsContainer.classList.add("d-none");
  selectedInfoEl.classList.remove("d-none");
}

function exitDetailMode() {
  // Vuelve al resumen
  if (viewHeader) viewHeader.classList.remove("d-none");
  cardsContainer.classList.remove("d-none");
  selectedInfoEl.classList.add("d-none");

  // Opcional: desmarcar card seleccionada
  if ($all) {
    $all(".card-colaborador, .card", cardsContainer).forEach((c) =>
      c.classList.remove("is-selected")
    );
  }
}


// SESIÓN
(async () => {
  try {
    const me = await api("/api/auth/me");
    userInfoEl.textContent = `${me.user.nombre} (${me.user.role})`;
  } catch {
    location.href = "/login.html";
  }
})();

btnLogout.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  location.href = "/login.html";
});

// CARGA INICIAL
document.addEventListener("DOMContentLoaded", () => loadSummary());

// CAMBIO DE AGRUPACIÓN
btnGroupProyectos.addEventListener("click", () => setGroup("proyectos"));
btnGroupEncargados.addEventListener("click", () => setGroup("encargados"));

function setGroup(group) {
  if (currentGroup === group) return;

  currentGroup = group;
  selectedId = null;
  currentDetails = [];
  txtSearch.value = "";

  // Siempre volver al modo resumen
  exitDetailMode();

  loadSummary();
}


async function loadSummary() {
  try {
    const res = await api(
      currentGroup === "proyectos"
        ? "/api/collaborators/projects"
        : "/api/collaborators/encargados"
    );

    summaryItems = res.items || [];
    renderCards();
  } catch (err) {
    console.error(err);
    cardsContainer.innerHTML = `<p class="text-danger">Error al cargar información.</p>`;
  }
}

function renderCards() {
  cardsContainer.innerHTML = summaryItems
    .map((item) => {
      const subtitle =
        currentGroup === "proyectos"
          ? [item.ciudad, item.region].filter(Boolean).join(" • ")
          : "Encargado";

      const textoCantidad =
        `${item.total_colaboradores} colaborador` +
        (item.total_colaboradores === 1 ? "" : "es");

      return `
        <div class="col-12 col-sm-6 col-md-4 col-lg-3 mb-3">
          <div class="card-colaborador" data-id="${item.id}">
            <div>
              <p class="card-colaborador-name mb-1">
                ${item.nombre}
              </p>
              <p class="card-colaborador-subtitle mb-0">
                ${subtitle || "&nbsp;"}
              </p>
            </div>
            <div class="card-colaborador-footer">
              ${textoCantidad}
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

cardsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".card-colaborador");
  if (!card) return;

  // marcar visualmente la seleccionada
  $all(".card-colaborador", cardsContainer).forEach((c) =>
    c.classList.remove("is-selected")
  );
  card.classList.add("is-selected");

  selectedId = card.dataset.id;
  loadDetails();
});

async function loadDetails() {
  try {
    const params =
      currentGroup === "proyectos"
        ? `?proyecto_id=${selectedId}`
        : `?encargado_id=${selectedId}`;

    const res = await api(`/api/collaborators/list${params}`);
    currentDetails = res.items || [];

    const selected = summaryItems.find(
      (x) => String(x.id) === String(selectedId)
    );

    if (selected) {
      selectedTitleEl.textContent = selected.nombre || "";
      selectedSubtitleEl.textContent =
        currentGroup === "proyectos"
          ? [selected.ciudad, selected.region].filter(Boolean).join(" • ")
          : "Encargado";
    } else {
      selectedTitleEl.textContent = "Detalle";
      selectedSubtitleEl.textContent = "";
    }

    selectedCountEl.textContent = `${currentDetails.length} colaborador(es)`;

    // 👇 aquí activamos el modo tabla
    enterDetailMode();

    applyFilter();
  } catch (err) {
    console.error(err);
    errorMsg.textContent = "Error cargando colaboradores.";
    errorMsg.classList.remove("d-none");
  }
}


txtSearch.addEventListener("input", applyFilter);

function applyFilter() {
  const t = txtSearch.value.toLowerCase().trim();

  const rows = currentDetails.filter(
    (c) =>
      (c.nombre || "").toLowerCase().includes(t) ||
      (c.rut || "").toLowerCase().includes(t)
  );

  tablaBody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${row.id}</td>
        <td>${row.nombre}</td>
        <td>${row.rut ?? ""}</td>
        <td>${row.cargo ?? ""}</td>
        <td>${row.proyecto ?? ""}</td>
        <td>${row.encargado ?? ""}</td>
        <td>
          <div class="form-check form-switch">
            <input 
              class="form-check-input toggle-activo" 
              type="checkbox" 
              data-id="${row.id}"
              ${row.activo ? "checked" : ""}>
          </div>
        </td>
        <td>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-info btnEditarColaborador" data-id="${
              row.id
            }">
              ✏️ Editar
            </button>
            <button class="btn btn-outline-secondary btnHistorialColaborador" data-id="${
              row.id
            }">
              📄 Historial
            </button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");

  emptyMsg.classList.toggle("d-none", rows.length > 0);
  selectedCountEl.textContent = `${rows.length} colaborador(es)`;
}

// Manejar cambio de switch ACTIVO/INACTIVO
tablaBody.addEventListener("change", async (e) => {
  const input = e.target.closest(".toggle-activo");
  if (!input) return;

  const id = input.dataset.id;
  const nuevoEstado = input.checked; // true = activo, false = inactivo
  const estadoAnterior = !nuevoEstado;

  try {
    const data = await api(`/api/collaborators/${id}/activo`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ activo: nuevoEstado }),
    });

    if (!data.ok) {
      // Revertir visualmente
      input.checked = estadoAnterior;

      if (data.reason === "PENDING_ASSETS") {
        // Armar mensaje con listado de equipos
        const lista = (data.assets || [])
          .map(
            (a) =>
              `• [ID ${a.id}] ${a.categoria ?? ""} ${a.marca ?? ""} ${
                a.modelo ?? ""
              } (${a.serial_imei ?? ""})`
          )
          .join("\n");

        const msgBase =
          data.message ||
          "No se puede dejar inactivo. Tiene equipos pendientes de devolución.";

        alert(lista ? msgBase + "\n\nEquipos pendientes:\n" + lista : msgBase);
      } else {
        showToast(data.error || "No se pudo actualizar el estado.", "danger");
      }
    } else {
      showToast(
        data.message ||
          `Colaborador marcado como ${data.activo ? "ACTIVO" : "INACTIVO"}.`,
        "success"
      );

      // Actualizar en currentDetails también
      const col = currentDetails.find((c) => String(c.id) === String(id));
      if (col) col.activo = data.activo;
    }
  } catch (err) {
    console.error(err);
    input.checked = estadoAnterior;
    showToast(
      err.message || "Error al cambiar estado del colaborador.",
      "danger"
    );
  }
});

// CLICK EN ACCIONES (Editar / Historial)
tablaBody.addEventListener("click", async (e) => {
  const btnEditar = e.target.closest(".btnEditarColaborador");
  const btnHist = e.target.closest(".btnHistorialColaborador");

  // EDITAR
  if (btnEditar) {
    const id = btnEditar.dataset.id;

    try {
      const res = await api(`/api/collaborators/${id}`);
      if (!res.ok) {
        showToast("No se pudo cargar el colaborador", "danger");
        return;
      }

      const col = res.colaborador;

      $("#editId").value = col.id;
      $("#editNombre").value = col.nombre || "";
      $("#editRUT").value = col.rut || "";
      $("#editGenero").value = col.genero || "";

      await cargarListasEditar(col);

      const modalEdit = new bootstrap.Modal($("#modalEditarColaborador"));
      modalEdit.show();
    } catch (err) {
      console.error(err);
      showToast("Error al abrir editor", "danger");
    }

    return; // importante salir aquí
  }

  // HISTORIAL
  if (btnHist) {
    const id = btnHist.dataset.id;
    await abrirHistorialColaborador(id);
  }
});

async function abrirHistorialColaborador(id) {
  try {
    const res = await api(`/api/collaborators/${id}/history`);

    if (!res.ok) {
      showToast(res.error || "No se pudo obtener historial", "danger");
      return;
    }

    const { colaborador, activosActuales, movimientos } = res;

    // Cabecera
    $("#histNombre").textContent = colaborador.nombre || "";
    $("#histRut").textContent = colaborador.rut || "";
    $("#histCargo").textContent = colaborador.cargo_nombre || "";
    $("#histProyecto").textContent = colaborador.proyecto_nombre || "";

    const estadoTxt = colaborador.activo ? "ACTIVO" : "INACTIVO";
    $("#histEstado").textContent = estadoTxt;

    // Activos actuales
    const activos = activosActuales || [];
    $("#histActivosBody").innerHTML =
      activos.length === 0
        ? `<tr><td colspan="8" class="text-center text-secondary small">Sin equipos asociados actualmente.</td></tr>`
        : activos
            .map(
              (a) => `
              <tr>
                <td>${a.id}</td>
                <td>${a.categoria ?? ""}</td>
                <td>${a.nombre ?? ""}</td>
                <td>${[a.marca, a.modelo].filter(Boolean).join(" / ")}</td>
                <td>${a.serial_imei ?? ""}</td>
                <td>${a.estado ?? ""}</td>
                <td>${formatearFecha(a.fecha_asignacion)}</td>
                <td>${formatearFecha(a.fecha_baja)}</td>
              </tr>
            `
            )
            .join("");

    // Movimientos
    const movs = movimientos || [];
    $("#histMovimientosBody").innerHTML =
      movs.length === 0
        ? `<tr><td colspan="7" class="text-center text-secondary small">Sin movimientos registrados.</td></tr>`
        : movs
            .map((m) => {
              const equipo = [m.categoria, m.marca, m.modelo]
                .filter(Boolean)
                .join(" / ");
              const proyectoParque = [m.parque_proyecto]
                .filter(Boolean)
                .join(" ");

              return `
              <tr>
                <td>${formatearFecha(m.fecha_hora)}</td>
                <td>${m.tipo ?? ""}</td>
                <td>${equipo}</td>
                <td>${m.serial_imei ?? ""}</td>
                <td>${proyectoParque}</td>
                <td>${m.ubicacion ?? ""}</td>
                <td class="small">${m.notas ?? ""}</td>
              </tr>
            `;
            })
            .join("");

    const modalHist = new bootstrap.Modal($("#modalHistorialColaborador"));
    modalHist.show();
  } catch (err) {
    console.error(err);
    showToast("Error al obtener historial", "danger");
  }
}

async function cargarListasEditar(col) {
  // 1) CARGOS
  const cargos = await api("/api/collaborators/cargos");
  $("#editCargo").innerHTML = (cargos.items || [])
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id == col.cargo_id ? "selected" : ""}>${
          c.nombre
        }</option>`
    )
    .join("");

  // 2) PROYECTOS
  const proyectos = await api("/api/collaborators/proyectos");
  $("#editProyecto").innerHTML = (proyectos.items || [])
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id == col.proyecto_id ? "selected" : ""}>${
          p.nombre
        }</option>`
    )
    .join("");

  // 3) ENCARGADOS  ✅ ahora usamos /encargados en vez de ?q=
  const resEncargados = await api("/api/collaborators/encargados");
  const encargados = resEncargados.items || [];

  $("#editEncargado").innerHTML =
    `<option value="">(Ninguno)</option>` +
    encargados
      .map(
        (e) =>
          `<option value="${e.id}" ${
            e.id == col.encargado_id ? "selected" : ""
          }>${e.nombre}</option>`
      )
      .join("");
}

$("#btnGuardarColaborador").addEventListener("click", async () => {
  const id = $("#editId").value;

  const payload = {
    nombre: $("#editNombre").value.trim(),
    rut: $("#editRUT").value.trim(),
    cargo_id: $("#editCargo").value,
    proyecto_id: $("#editProyecto").value,
    encargado_id: $("#editEncargado").value || null,
    genero: $("#editGenero").value || null,
  };

  try {
    const data = await api(`/api/collaborators/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!data.ok) {
      showToast("No se pudieron guardar los cambios", "danger");
      return;
    }

    showToast("Colaborador actualizado correctamente", "success");

    // Cerrar modal
    bootstrap.Modal.getInstance($("#modalEditarColaborador")).hide();

    // Recargar tabla
    loadDetails();
  } catch (err) {
    showToast("Error al guardar cambios", "danger");
  }
});

function formatearFecha(fechaISO) {
  if (!fechaISO) return "";
  const d = new Date(fechaISO);

  // Día / Mes / Año con ceros a la izquierda
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();

  return `${dia}-${mes}-${anio}`;
}

if (btnBackToCards) {
  btnBackToCards.addEventListener("click", () => {
    // Limpiar selección de tabla si quieres
    selectedId = null;
    currentDetails = [];
    tablaBody.innerHTML = "";
    txtSearch.value = "";

    exitDetailMode();
  });
}


const btnNuevoColaborador = $("#btnNuevoColaborador");

btnNuevoColaborador.addEventListener("click", async () => {
  // Limpiar campos
  $("#newNombre").value = "";
  $("#newRUT").value = "";
  $("#newGenero").value = "";

  // Cargar listas
  await cargarListasNuevo();

  // Abrir modal
  const modal = new bootstrap.Modal($("#modalNuevoColaborador"));
  modal.show();
});

async function cargarListasNuevo() {
  // CARGOS
  const cargos = await api("/api/collaborators/cargos");
  $("#newCargo").innerHTML = cargos.items
    .map(c => `<option value="${c.id}">${c.nombre}</option>`)
    .join("");

  // PROYECTOS
  const proyectos = await api("/api/collaborators/proyectos");
  $("#newProyecto").innerHTML = proyectos.items
    .map(p => `<option value="${p.id}">${p.nombre}</option>`)
    .join("");

  // ENCARGADOS
  const resEncargados = await api("/api/collaborators/encargados");
  $("#newEncargado").innerHTML =
    `<option value="">(Ninguno)</option>` +
    resEncargados.items
      .map(e => `<option value="${e.id}">${e.nombre}</option>`)
      .join("");
}

$("#btnGuardarNuevoColaborador").addEventListener("click", async () => {
  const payload = {
    nombre: $("#newNombre").value.trim(),
    rut: $("#newRUT").value.trim(),
    cargo_id: $("#newCargo").value,
    proyecto_id: $("#newProyecto").value,
    encargado_id: $("#newEncargado").value || null,
    genero: $("#newGenero").value || null,
  };

  try {
    const res = await api("/api/collaborators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      showToast(res.error || "No se pudo crear el colaborador", "danger");
      return;
    }

    showToast("Colaborador creado correctamente", "success");

    // Cerrar modal
    bootstrap.Modal.getInstance($("#modalNuevoColaborador")).hide();

    // Volver a resumen y recargar
    exitDetailMode();
    loadSummary();

  } catch (err) {
    console.error(err);
    showToast("Error al guardar colaborador", "danger");
  }
});
