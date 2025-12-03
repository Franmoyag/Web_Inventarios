// web/js/actas.js
import { api, $, showToast } from "./api.js";

/* ===============================
   ELEMENTOS DEL DOM
=============================== */
const tablaBody = $("#tablaActasBody");
const emptyMsg = $("#emptyMsg");
const errorMsg = $("#errorMsg");
const txtSearch = $("#txtSearch");
const totalActas = $("#totalActas");

const userInfoEl = $("#userInfo");
const btnLogout = $("#btnLogout");

/* ===============================
   ESTADO LOCAL
=============================== */
let allItems = [];
let filteredItems = [];

/* ===============================
   SESIÓN Y PERMISOS
   (ADMIN o REPORT)
=============================== */
(async () => {
  try {
    const me = await api("/api/auth/me");
    if (!me.user) {
      location.href = "/login.html";
      return;
    }

    userInfoEl.textContent = `${me.user.nombre} (${me.user.role})`;

    if (!["ADMIN", "REPORT"].includes(me.user.role)) {
      alert("No tienes permisos para ver el historial de actas.");
      location.href = "/";
    }
  } catch {
    location.href = "/login.html";
  }
})();

btnLogout.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  location.href = "/login.html";
});

/* ===============================
   CARGA DE DATOS
=============================== */
async function cargarActas() {
  try {
    errorMsg.classList.add("d-none");
    errorMsg.textContent = "";

    const data = await api("/api/actas/historial"); // 👈 endpoint que creamos en el backend
    allItems = Array.isArray(data) ? data : [];
    aplicarFiltros();
  } catch (err) {
    console.error(err);
    errorMsg.textContent = err.message || "Error al cargar historial de actas";
    errorMsg.classList.remove("d-none");
  }
}

/* ===============================
   FILTROS Y RENDER
=============================== */
function aplicarFiltros() {
  const q = (txtSearch.value || "").trim().toLowerCase();

  if (!q) {
    filteredItems = [...allItems];
  } else {
    filteredItems = allItems.filter((a) => {
      const nombre = (a.colaborador_nombre || "").toLowerCase();
      const rut = (a.colaborador_rut || "").toLowerCase();
      const desc = (a.descripcion_entrega || "").toLowerCase();
      return (
        nombre.includes(q) ||
        rut.includes(q) ||
        desc.includes(q)
      );
    });
  }

  renderTabla();
}

function renderTabla() {
  tablaBody.innerHTML = "";

  if (!filteredItems.length) {
    emptyMsg.classList.remove("d-none");
    totalActas.textContent = "";
    return;
  }

  emptyMsg.classList.add("d-none");
  totalActas.textContent = `${filteredItems.length} acta(s) mostrada(s)`;

  for (const item of filteredItems) {
    tablaBody.insertAdjacentHTML("beforeend", rowHTML(item));
  }
}

function rowHTML(a) {
  const fechaActa = a.fecha_acta
    ? new Date(a.fecha_acta).toLocaleDateString("es-CL")
    : "";

  const creadoEn = a.creado_en
    ? new Date(a.creado_en).toLocaleDateString("es-CL")
    : "";

  // La ruta viene de la BD como "storage\\actas_pdf\\ACTA_..."
  const ruta = (a.ruta_pdf || "").replace(/\\/g, "/");
  const linkPDF = ruta
    ? `<a href="/${ruta}" target="_blank" class="btn btn-sm btn-outline-info">Abrir PDF</a>`
    : '<span class="text-secondary small">Sin archivo</span>';

  const nombre = a.colaborador_nombre || "";
  const rut = a.colaborador_rut || "";

  return `
    <tr>
      <td class="text-secondary small">${a.id}</td>
      <td>
        <div class="fw-semibold">${nombre}</div>
        <div class="text-secondary small">${rut}</div>
      </td>
      <td>
        ${
          fechaActa
            ? `<span class="badge rounded-pill badge-fecha">${fechaActa}</span>`
            : ""
        }
      </td>
      <td class="small text-truncate" style="max-width:280px;">
        ${a.descripcion_entrega || ""}
      </td>
      <td class="small text-secondary">${creadoEn}</td>
      <td class="text-center">
        ${linkPDF}
      </td>
    </tr>
  `;
}

/* ===============================
   DEBOUNCE PARA EL BUSCADOR
=============================== */
function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/* ===============================
   INIT
=============================== */
document.addEventListener("DOMContentLoaded", () => {
  cargarActas();
  txtSearch.addEventListener("input", debounce(aplicarFiltros, 250));
});
