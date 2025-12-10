// web/js/colaboradores.js
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

const btnNuevoColaborador = $("#btnNuevoColaborador");

let currentGroup = "proyectos";
let summaryItems = [];
let currentDetails = [];
let selectedId = null;

/* ========== HELPERS RUT Y FECHAS ========== */
function formatearRut(rut) {
  rut = limpiarRut(rut); // deja solo números y K
  if (!rut) return "";

  // 1 o 2 dígitos: sin formato
  if (rut.length <= 2) {
    return rut;
  }

  let cuerpo;
  let dv = null;

  if (rut.length <= 8) {
    // Todavía está escribiendo el cuerpo del RUT (sin DV)
    cuerpo = rut;
  } else {
    // 7-8 dígitos de cuerpo + 1 DV
    cuerpo = rut.slice(0, -1);
    dv = rut.slice(-1);
  }

  // Insertar puntos cada 3 dígitos desde el final
  cuerpo = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  // Si aún no hay DV, sólo mostramos el cuerpo con puntos
  return dv ? `${cuerpo}-${dv}` : cuerpo;
}



// Inputs de RUT que deben autoformatearse
const inputsRut = ["#editRUT", "#newRUT"];

inputsRut.forEach((selector) => {
  const input = document.querySelector(selector);
  if (!input) return;

  // Re-formatear SIEMPRE y llevar el cursor al final
  input.addEventListener("input", () => {
    const formatted = formatearRut(input.value);
    input.value = formatted;
    // cursor siempre al final para evitar saltos raros
    const len = input.value.length;
    input.setSelectionRange(len, len);
  });

  // Sólo permitir números, K/k y teclas de control (no dejar escribir . ni -)
  input.addEventListener("keydown", (e) => {
    const controlKeys = [
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
      "Home",
      "End",
    ];

    if (controlKeys.includes(e.key)) return; // OK

    // Tecla normal (1 carácter)
    if (e.key.length === 1) {
      if (!/[0-9kK]/.test(e.key)) {
        e.preventDefault();
      }
      return;
    }

    // Cualquier otra tecla especial, la dejamos pasar (por si acaso)
  });
});


const RUT_GENERICO_ORIGINAL = "11.111.111-1";

function limpiarRut(rut) {
  if (!rut) return "";
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

function esRutGenerico(rut) {
  if (!rut) return false;
  const limpio = limpiarRut(rut);
  return limpio === "111111111"; // 11.111.111-1
}

function validarRutChileno(rut) {
  if (!rut) return false;

  const limpio = limpiarRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return false;

  const cuerpo = limpio.slice(0, -1);
  const dvRecibido = limpio.slice(-1);

  let suma = 0;
  let multiplicador = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = suma % 11;
  const dvCalculadoNum = 11 - resto;

  let dvCalculado;
  if (dvCalculadoNum === 11) dvCalculado = "0";
  else if (dvCalculadoNum === 10) dvCalculado = "K";
  else dvCalculado = String(dvCalculadoNum);

  return dvRecibido === dvCalculado;
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return "";
  const d = new Date(fechaISO);

  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();

  return `${dia}-${mes}-${anio}`;
}

/* ========== MODO RESUMEN / DETALLE ========== */

function enterDetailMode() {
  if (viewHeader) viewHeader.classList.add("d-none");
  cardsContainer.classList.add("d-none");
  selectedInfoEl.classList.remove("d-none");
}

function exitDetailMode() {
  if (viewHeader) viewHeader.classList.remove("d-none");
  cardsContainer.classList.remove("d-none");
  selectedInfoEl.classList.add("d-none");

  if ($all) {
    $all(".card-colaborador, .card", cardsContainer).forEach((c) =>
      c.classList.remove("is-selected")
    );
  }
}

/* ========== SESIÓN ========== */

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

/* ========== CARGA INICIAL ========== */

document.addEventListener("DOMContentLoaded", () => loadSummary());

btnGroupProyectos.addEventListener("click", () => setGroup("proyectos"));
btnGroupEncargados.addEventListener("click", () => setGroup("encargados"));

function setGroup(group) {
  if (currentGroup === group) return;

  currentGroup = group;
  selectedId = null;
  currentDetails = [];
  txtSearch.value = "";

  exitDetailMode();
  loadSummary();
}

/* ========== RESUMEN (CARDS) ========== */

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

  $all(".card-colaborador", cardsContainer).forEach((c) =>
    c.classList.remove("is-selected")
  );
  card.classList.add("is-selected");

  selectedId = card.dataset.id;
  loadDetails();
});

/* ========== DETALLE (TABLA) ========== */

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
        <td>
          ${row.rut ?? ""}
          ${
            esRutGenerico(row.rut)
              ? `
                <span 
                  class="ms-1 text-warning rut-warning" 
                  data-bs-toggle="tooltip" 
                  data-bs-placement="top"
                  data-bs-title="RUT genérico: ingresar RUT real.">
                  ⚠️
                </span>
                `
              : ""
          }
        </td>
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
            <button class="btn btn-outline-info btn-action-sm btnEditarColaborador" data-id="${
              row.id
            }">
              ✏️
            </button>
            <button class="btn btn-outline-secondary btn-action-sm btnHistorialColaborador" data-id="${
              row.id
            }">
              📄
            </button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");

  const tooltipTriggerList = [].slice.call(
    document.querySelectorAll('[data-bs-toggle="tooltip"]')
  );
  tooltipTriggerList.forEach((el) => {
    new bootstrap.Tooltip(el);
  });

  emptyMsg.classList.toggle("d-none", rows.length > 0);
  selectedCountEl.textContent = `${rows.length} colaborador(es)`;
}

/* ========== CAMBIO ACTIVO/INACTIVO ========== */

tablaBody.addEventListener("change", async (e) => {
  const input = e.target.closest(".toggle-activo");
  if (!input) return;

  const id = input.dataset.id;
  const nuevoEstado = input.checked;
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
      input.checked = estadoAnterior;

      if (data.reason === "PENDING_ASSETS") {
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

/* ========== EDITAR / HISTORIAL ========== */

tablaBody.addEventListener("click", async (e) => {
  const btnEditar = e.target.closest(".btnEditarColaborador");
  const btnHist = e.target.closest(".btnHistorialColaborador");

  if (btnEditar) {
    const id = btnEditar.dataset.id;

    try {
      const res = await api(`/api/collaborators/${id}`);
      if (!res.ok) {
        showToast("No se pudo cargar el colaborador", "danger");
        return;
      }

      const col = res.colaborador;

      if (esRutGenerico(col.rut)) {
        showToast(
          "Este colaborador tiene un RUT genérico. Debe actualizarlo.",
          "warning"
        );
      }

      $("#editId").value = col.id;
      $("#editNombre").value = col.nombre || "";
      $("#editRUT").value = col.rut ? formatearRut(col.rut) : "";
      $("#editGenero").value = col.genero || "";

      await cargarListasEditar(col);

      const modalEdit = new bootstrap.Modal($("#modalEditarColaborador"));
      modalEdit.show();
    } catch (err) {
      console.error(err);
      showToast("Error al abrir editor", "danger");
    }

    return;
  }

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

    $("#histNombre").textContent = colaborador.nombre || "";
    $("#histRut").textContent = colaborador.rut || "";
    $("#histCargo").textContent = colaborador.cargo_nombre || "";
    $("#histProyecto").textContent = colaborador.proyecto_nombre || "";

    if (esRutGenerico(colaborador.rut)) {
      $("#histRut").innerHTML += `
        <span
          class="ms-1 text-warning rut-warning"
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          data-bs-title="RUT genérico: ingresar RUT real.">
          ⚠️
        </span>`;
    }

    const estadoTxt = colaborador.activo ? "ACTIVO" : "INACTIVO";
    $("#histEstado").textContent = estadoTxt;

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

    const tooltipTriggerList = [].slice.call(
      document.querySelectorAll(
        '#modalHistorialColaborador [data-bs-toggle="tooltip"]'
      )
    );
    tooltipTriggerList.forEach((el) => {
      new bootstrap.Tooltip(el);
    });

    const modalHist = new bootstrap.Modal($("#modalHistorialColaborador"));
    modalHist.show();
  } catch (err) {
    console.error(err);
    showToast("Error al obtener historial", "danger");
  }
}

/* ========== CARGA DE LISTAS (EDITAR / NUEVO) ========== */

async function cargarListasEditar(col) {
  const cargos = await api("/api/collaborators/cargos");
  $("#editCargo").innerHTML = (cargos.items || [])
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id == col.cargo_id ? "selected" : ""}>${
          c.nombre
        }</option>`
    )
    .join("");

  const proyectos = await api("/api/collaborators/proyectos");
  $("#editProyecto").innerHTML = (proyectos.items || [])
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id == col.proyecto_id ? "selected" : ""}>${
          p.nombre
        }</option>`
    )
    .join("");

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

/* ========== GUARDAR EDICIÓN ========== */

// Soportar ambos IDs por si el HTML tiene uno u otro
const btnGuardarColaborador =
  $("#btnGuardarColaborador") || $("#btnGuardarCambios");

if (btnGuardarColaborador) {
  btnGuardarColaborador.addEventListener("click", async (e) => {
    e.preventDefault(); // por si el botón está dentro de un <form>

    const id = $("#editId").value;
    const rut = $("#editRUT").value.trim();

    try {
      if (!rut) {
        showToast("El RUT es obligatorio.", "danger");
        return;
      }

      // Si NO es el genérico, validamos como RUT chileno
      if (!esRutGenerico(rut) && !validarRutChileno(rut)) {
        showToast("El RUT ingresado no es un RUT chileno válido.", "danger");
        return;
      }

      const payload = {
        nombre: $("#editNombre").value.trim(),
        rut,
        cargo_id: $("#editCargo").value,
        proyecto_id: $("#editProyecto").value,
        encargado_id: $("#editEncargado").value || null,
        genero: $("#editGenero").value || null,
      };

      const data = await api(`/api/collaborators/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!data.ok) {
        showToast(data.error || "No se pudieron guardar los cambios", "danger");
        return;
      }

      showToast("Colaborador actualizado correctamente", "success");
      bootstrap.Modal.getInstance($("#modalEditarColaborador")).hide();
      loadDetails();
    } catch (err) {
      console.error(err);
      showToast("Error al guardar cambios: " + err.message, "danger");
    }
  });
}

/* ========== NUEVO COLABORADOR ========== */

if (btnBackToCards) {
  btnBackToCards.addEventListener("click", () => {
    selectedId = null;
    currentDetails = [];
    tablaBody.innerHTML = "";
    txtSearch.value = "";
    exitDetailMode();
  });
}

btnNuevoColaborador.addEventListener("click", async () => {
  $("#newNombre").value = "";
  $("#newRUT").value = "";
  $("#newGenero").value = "";

  await cargarListasNuevo();

  const modal = new bootstrap.Modal($("#modalNuevoColaborador"));
  modal.show();
});

async function cargarListasNuevo() {
  const cargos = await api("/api/collaborators/cargos");
  $("#newCargo").innerHTML = cargos.items
    .map((c) => `<option value="${c.id}">${c.nombre}</option>`)
    .join("");

  const proyectos = await api("/api/collaborators/proyectos");
  $("#newProyecto").innerHTML = proyectos.items
    .map((p) => `<option value="${p.id}">${p.nombre}</option>`)
    .join("");

  const resEncargados = await api("/api/collaborators/encargados");
  $("#newEncargado").innerHTML =
    `<option value="">(Ninguno)</option>` +
    resEncargados.items
      .map((e) => `<option value="${e.id}">${e.nombre}</option>`)
      .join("");
}

const btnGuardarNuevo = $("#btnGuardarNuevoColaborador");
if (btnGuardarNuevo) {
  btnGuardarNuevo.addEventListener("click", async (e) => {
    e.preventDefault();

    const rut = $("#newRUT").value.trim();

    try {
      if (!rut) {
        showToast("El RUT es obligatorio.", "danger");
        return;
      }

      if (!esRutGenerico(rut) && !validarRutChileno(rut)) {
        showToast("El RUT ingresado no es un RUT chileno válido.", "danger");
        return;
      }

      const payload = {
        nombre: $("#newNombre").value.trim(),
        rut,
        cargo_id: $("#newCargo").value,
        proyecto_id: $("#newProyecto").value,
        encargado_id: $("#newEncargado").value || null,
        genero: $("#newGenero").value || null,
      };

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
      bootstrap.Modal.getInstance($("#modalNuevoColaborador")).hide();
      exitDetailMode();
      loadSummary();
    } catch (err) {
      console.error(err);
      showToast("Error al guardar colaborador: " + err.message, "danger");
    }
  });
}
