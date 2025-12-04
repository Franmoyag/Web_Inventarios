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

let currentGroup = "proyectos";
let summaryItems = [];
let currentDetails = [];
let selectedId = null;

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
  currentGroup = group;
  selectedId = null;
  selectedInfoEl.classList.add("d-none");
  txtSearch.value = "";
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
      const subtitle = currentGroup === "proyectos"
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

    selectedInfoEl.classList.remove("d-none");
    const selected = summaryItems.find((x) => String(x.id) === String(selectedId));
    selectedTitleEl.textContent = selected ? selected.nombre : "Detalle";
    selectedCountEl.textContent = `${currentDetails.length} colaboradores`;

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
          <button class="btn btn-sm btn-outline-info btnEditarColaborador" data-id="${row.id}">
            ✏️ Editar
          </button>
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
              `• [ID ${a.id}] ${a.categoria ?? ""} ${a.marca ?? ""} ${a.modelo ?? ""} (${a.serial_imei ?? ""})`
          )
          .join("\n");

        const msgBase =
          data.message ||
          "No se puede dejar inactivo. Tiene equipos pendientes de devolución.";

        alert(
          lista
            ? msgBase + "\n\nEquipos pendientes:\n" + lista
            : msgBase
        );
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
      const col = currentDetails.find(
        (c) => String(c.id) === String(id)
      );
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


// ABRIR MODAL EDITAR
tablaBody.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btnEditarColaborador");
  if (!btn) return;

  const id = btn.dataset.id;

  try {
    const data = await api(`/api/collaborators/${id}`);
    if (!data.ok) {
      showToast("No se pudieron obtener los datos del colaborador", "danger");
      return;
    }

    const col = data.colaborador;

    // Llenar campos
    $("#editId").value = col.id;
    $("#editNombre").value = col.nombre;
    $("#editRUT").value = col.rut ?? "";
    $("#editGenero").value = col.genero ?? "";

    // Llenar selects dinámicos
    await cargarListasEditar(col);

    // Abrir modal
    const modal = new bootstrap.Modal($("#modalEditarColaborador"));
    modal.show();

  } catch (err) {
    showToast("Error al abrir editor", "danger");
  }
});



async function cargarListasEditar(col) {
  // 1) CARGOS
  const cargos = await api("/api/collaborators/cargos");
  $("#editCargo").innerHTML = (cargos.items || [])
    .map(
      (c) =>
        `<option value="${c.id}" ${
          c.id == col.cargo_id ? "selected" : ""
        }>${c.nombre}</option>`
    )
    .join("");

  // 2) PROYECTOS
  const proyectos = await api("/api/collaborators/proyectos");
  $("#editProyecto").innerHTML = (proyectos.items || [])
    .map(
      (p) =>
        `<option value="${p.id}" ${
          p.id == col.proyecto_id ? "selected" : ""
        }>${p.nombre}</option>`
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
