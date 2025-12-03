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
    .map(
      (i) => `
    <div class="col-md-3">
        <div class="card p-3 bg-dark text-light selectable" data-id="${i.id}">
            <h5>${i.nombre}</h5>
            <p class="text-secondary small">${i.ciudad ?? ""} ${i.region ?? ""}</p>
            <span class="badge bg-info">${i.total_colaboradores} colaboradores</span>
        </div>
    </div>
  `
    )
    .join("");
}

cardsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  selectedId = card.dataset.id;

  loadDetails();
});

async function loadDetails() {
  try {
    const params =
      currentGroup === "proyectos"
        ? `?proyecto_id=${selectedId}`
        : `?encargado_id=${selectedId}`;

    // 👇 ahora usa /api/collaborators/list
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
      (c) => `
    <tr>
      <td>${c.id}</td>
      <td>${c.nombre}</td>
      <td>${c.rut}</td>
      <td>${c.cargo ?? ""}</td>
      <td>${c.proyecto ?? ""}</td>
      <td>${c.encargado ?? ""}</td>
    </tr>`
    )
    .join("");

  emptyMsg.classList.toggle("d-none", rows.length > 0);
}
