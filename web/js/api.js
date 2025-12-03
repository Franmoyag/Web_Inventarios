
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
export function showToast(message, variant = 'dark') {
  const toastEl = document.getElementById('appToast');
  const toastMsg = document.getElementById('toastMsg');
  if (!toastEl || !toastMsg) {
    console.warn('Toast container no encontrado, mensaje:', message);
    return;
  }

  // base visual (oscuro bonito)
  toastEl.className = `toast align-items-center border-0 shadow-lg text-light`;
  toastEl.style.minWidth = '280px';
  toastEl.style.borderRadius = '0.6rem';

  // color de fondo según variante
  switch (variant) {
    case 'success':
      toastEl.style.background = 'linear-gradient(135deg, #00bfa6, #009688)';
      break;
    case 'danger':
      toastEl.style.background = 'linear-gradient(135deg, #e53935, #c62828)';
      break;
    case 'info':
      toastEl.style.background = 'linear-gradient(135deg, #03a9f4, #0288d1)';
      break;
    default:
      toastEl.style.background = 'rgba(30, 41, 59, 0.95)';
      break;
  }

  toastMsg.textContent = message;
  toastMsg.style.color = '#fff';

  // Usa Bootstrap.Toast si está disponible
  if (window.bootstrap && window.bootstrap.Toast) {
    const t = new window.bootstrap.Toast(toastEl, { delay: 4000 });
    t.show();
  } else {
    // Fallback si por alguna razón bootstrap no está cargado
    toastEl.style.display = 'block';
    toastEl.classList.add('show');
    setTimeout(() => {
      toastEl.classList.remove('show');
      toastEl.style.display = 'none';
    }, 4000);
  }
}
