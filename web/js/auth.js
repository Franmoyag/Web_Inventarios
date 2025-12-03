import { showToast } from "./api.js";


async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: "include", ...opts });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    // pasa el status para mensajes específicos
    const err = new Error(data.error || "Error de conexión");
    err.status = res.status;
    throw err;
  }
  return data;
}

// Si ya hay sesión, ir a index
(async () => {
  try {
    const me = await api("/api/auth/me");
    if (me.user) location.href = "/";
  } catch {}
})();


const form = document.getElementById("loginForm");
const btn = document.getElementById("btnLogin");
const spin = document.getElementById("spinLogin");
const out = document.getElementById("loginError");


function setLoading(on) {
  if (on) {
    btn.classList.add('btn-busy');
    out.classList.add('d-none');
    out.textContent = '';
  } else {
    btn.classList.remove('btn-busy');
  }
}


function invalidateField(el, msg) {
  el.classList.add('is-invalid');
  let help = el.parentElement.querySelector('.invalid-msg');
  if (!help) {
    help = document.createElement('div');
    help.className = 'invalid-msg';
    el.parentElement.appendChild(help);
  }
  help.textContent = msg;
}


function clearInvalid(el) {
  el.classList.remove('is-invalid');
  const help = el.parentElement.querySelector('.invalid-msg');
  if (help) help.textContent = '';
}


form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const emailEl = form.querySelector('input[name="email"]');
  const passEl = form.querySelector('input[name="password"]');

  clearInvalid(emailEl);
  clearInvalid(passEl);

  const emailVal = emailEl.value.trim();
  const passVal = passEl.value.trim();

  let hasError = false;
  if (!emailVal) {
    invalidateField(emailEl, 'Ingresa tu correo');
    hasError = true;
  }
  if (!passVal) {
    invalidateField(passEl, 'Ingresa tu contraseña');
    hasError = true;
  }
  if (hasError) return;

  setLoading(true);

  try {
    await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailVal, password: passVal })
    });

    showToast('Ingreso exitoso', 'success');
    // pequeño delay para que alcance a ver el toast
    setTimeout(() => { location.href = '/'; }, 400);
  } catch (err) {
    let msg = err.message || 'Error de conexión';
    if (err.status === 401) msg = 'Email o contraseña inválidos.';
    if (err.status === 403) msg = 'Usuario inactivo. Contacta al administrador.';
    if (err.status === 429) msg = 'Demasiados intentos. Espera un momento.';

    out.textContent = msg;
    out.classList.remove('d-none');
    showToast(msg, 'danger');
  } finally {
    setLoading(false);
  }
});



