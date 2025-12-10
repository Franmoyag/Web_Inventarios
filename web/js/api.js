
// Llamadas a la API con manejo de error estándar
export async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',      // 👈 FORZAMOS a que NO use caché
    ...opts
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    const err = new Error(data.error || 'Error de conexión');
    err.status = res.status;
    throw err;
  }

  return data;
}


// Helpers DOM simples
export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $all(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

// Toast unificado con fallback oscuro
export function showToast(message, variant = "dark") {
  // 1) Aseguramos que exista el contenedor y el cuerpo del mensaje
  let toastEl = document.getElementById("appToast");
  let toastMsg = document.getElementById("toastMsg");

  if (!toastEl) {
    // Crear el toast desde cero si no existe
    toastEl = document.createElement("div");
    toastEl.id = "appToast";
    toastEl.className = "toast position-fixed bottom-0 end-0 m-3 p-2";
    toastEl.setAttribute("role", "alert");
    toastEl.setAttribute("aria-live", "assertive");
    toastEl.setAttribute("aria-atomic", "true");

    toastEl.innerHTML = `
      <div class="d-flex">
        <div id="toastMsg" class="toast-body"></div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    `;

    document.body.appendChild(toastEl);
    toastMsg = toastEl.querySelector("#toastMsg");
  }

  if (!toastMsg) {
    // Por si por alguna razón falta el div del mensaje
    toastMsg = document.createElement("div");
    toastMsg.id = "toastMsg";
    toastMsg.className = "toast-body";
    const dFlex = toastEl.querySelector(".d-flex");
    if (dFlex) dFlex.prepend(toastMsg);
    else toastEl.appendChild(toastMsg);
  }

  // 2) Estilo base (tu estilo oscuro bonito)
  toastEl.className =
    "toast position-fixed bottom-0 end-0 m-3 p-2 align-items-center border-0 shadow-lg text-light";
  toastEl.style.minWidth = "280px";
  toastEl.style.borderRadius = "0.6rem";

  // 3) Color de fondo según variante
  switch (variant) {
    case "success":
      toastEl.style.background =
        "linear-gradient(135deg, #00bfa6, #009688)";
      break;
    case "danger":
      toastEl.style.background =
        "linear-gradient(135deg, #e53935, #c62828)";
      break;
    case "info":
      toastEl.style.background =
        "linear-gradient(135deg, #03a9f4, #0288d1)";
      break;
    case "warning":
      toastEl.style.background =
        "linear-gradient(135deg, #ffb300, #f57c00)";
      break;
    default:
      toastEl.style.background = "rgba(30, 41, 59, 0.95)";
      break;
  }

  // 4) Texto
  toastMsg.textContent = message;
  toastMsg.style.color = "#fff";

  // 5) Mostrar usando Bootstrap si está disponible
  if (window.bootstrap && window.bootstrap.Toast) {
    const t = new window.bootstrap.Toast(toastEl, { delay: 4000 });
    t.show();
  } else {
    // Fallback si Bootstrap no está cargado por alguna razón
    toastEl.style.display = "block";
    toastEl.classList.add("show");
    setTimeout(() => {
      toastEl.classList.remove("show");
      toastEl.style.display = "none";
    }, 4000);
  }
}

