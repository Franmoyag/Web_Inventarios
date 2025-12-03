import { api, $, showToast } from './api.js';

/* ------------------ SESIÓN / NAVBAR ------------------ */
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
  await api('/api/auth/logout', { method: 'POST' });
  location.href = '/login.html';
});


/* ------------------ REFERENCIAS A MODALES ------------------ */
const modalCelularEl   = $('#modalCelular');
const modalNotebookEl  = $('#modalNotebook');
const modalPerifEl     = $('#modalPeriferico');

const formCelular      = $('#formCelular');
const formNotebook     = $('#formNotebook');
const formPeriferico   = $('#formPeriferico');

const btnOpenCelular   = $('#btnOpenCelular');
const btnOpenNotebook  = $('#btnOpenNotebook');
const btnOpenPeriferico= $('#btnOpenPeriferico');

const btnGuardarCelular    = $('#btnGuardarCelular');
const btnGuardarNotebook   = $('#btnGuardarNotebook');
const btnGuardarPeriferico = $('#btnGuardarPeriferico');

const msgCelError      = $('#msgCelError');
const msgNotebookError = $('#msgNotebookError');
const msgPerifError    = $('#msgPerifError');

const celNombreHidden  = $('#cel_nombre_hidden');
const nbNombreHidden   = $('#nb_nombre_hidden');


/* ------------------ HELPERS ------------------ */
function showModal(el) {
  const m = new bootstrap.Modal(el);
  m.show();
  return m;
}

function closeModal(el) {
  const m = bootstrap.Modal.getInstance(el);
  if (m) m.hide();
}

function buildBodyFromForm(formElem) {
  const fd = new FormData(formElem);
  return Object.fromEntries(fd.entries());
}

// Rellena automáticamente el campo oculto `nombre` si está vacío
function ensureNombreFor(formElem, hiddenInputEl, fallbackParts = []) {
  if (!hiddenInputEl) return;

  if (!hiddenInputEl.value.trim()) {
    const pieces = [];
    for (const sel of fallbackParts) {
      const fieldEl = formElem.querySelector(`[name="${sel}"]`);
      if (fieldEl && fieldEl.value.trim()) {
        pieces.push(fieldEl.value.trim());
      }
    }
    if (pieces.length === 0) {
      // último recurso
      const serieEl = formElem.querySelector('[name="serial_imei"]');
      if (serieEl && serieEl.value.trim()) {
        pieces.push(serieEl.value.trim());
      } else {
        pieces.push('Sin nombre');
      }
    }
    hiddenInputEl.value = pieces.join(' ');
  }
}


/* ------------------ ABRIR MODALES ------------------ */
btnOpenCelular.addEventListener('click', () => {
  msgCelError.textContent = '';
  formCelular.reset();
  celNombreHidden.value = '';
  showModal(modalCelularEl);
});

btnOpenNotebook.addEventListener('click', () => {
  msgNotebookError.textContent = '';
  formNotebook.reset();
  nbNombreHidden.value = '';
  showModal(modalNotebookEl);
});

btnOpenPeriferico.addEventListener('click', () => {
  msgPerifError.textContent = '';
  formPeriferico.reset();
  showModal(modalPerifEl);
});


/* ------------------ GUARDAR CELULAR ------------------ */
btnGuardarCelular.addEventListener('click', async () => {
  msgCelError.textContent = '';

  const imeiEl = formCelular.querySelector('[name="serial_imei"]');
  if (!imeiEl.value.trim()) {
    msgCelError.textContent = 'Falta IMEI/Serie.';
    showToast('Falta IMEI/Serie', 'danger');
    return;
  }

  // aseguramos campo "nombre"
  ensureNombreFor(formCelular, celNombreHidden, ['marca','modelo']);

  const body = buildBodyFromForm(formCelular);

  try {
    btnGuardarCelular.disabled = true;

    const resp = await api('/api/assets', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      throw new Error(resp.error || 'Error desconocido al crear activo');
    }

    showToast('Celular registrado ✅', 'success');
    closeModal(modalCelularEl);

  } catch (err) {
    console.error('Error guardando celular:', err);
    msgCelError.textContent = err.message || 'Error al crear activo';
    showToast(msgCelError.textContent, 'danger');
  } finally {
    btnGuardarCelular.disabled = false;
  }
});


/* ------------------ GUARDAR NOTEBOOK ------------------ */
btnGuardarNotebook.addEventListener('click', async () => {
  msgNotebookError.textContent = '';

  const serieEl = formNotebook.querySelector('[name="serial_imei"]');
  if (!serieEl.value.trim()) {
    msgNotebookError.textContent = 'Falta número de serie.';
    showToast('Falta número de serie', 'danger');
    return;
  }

  // aseguramos campo "nombre"
  ensureNombreFor(formNotebook, nbNombreHidden, ['marca','modelo']);

  const body = buildBodyFromForm(formNotebook);

  try {
    btnGuardarNotebook.disabled = true;

    const resp = await api('/api/assets', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      throw new Error(resp.error || 'Error desconocido al crear activo');
    }

    showToast('Notebook registrado ✅', 'success');
    closeModal(modalNotebookEl);

  } catch (err) {
    console.error('Error guardando notebook:', err);
    msgNotebookError.textContent = err.message || 'Error al crear activo';
    showToast(msgNotebookError.textContent, 'danger');
  } finally {
    btnGuardarNotebook.disabled = false;
  }
});


/* ------------------ GUARDAR PERIFÉRICO ------------------ */
btnGuardarPeriferico.addEventListener('click', async () => {
  msgPerifError.textContent = '';

  // para periférico, no exigimos serial_imei, pero sí nombre/categoría.
  const nombreEl = formPeriferico.querySelector('[name="nombre"]');
  const catEl    = formPeriferico.querySelector('[name="categoria"]');

  if (!catEl.value.trim()) {
    msgPerifError.textContent = 'Falta categoría.';
    showToast('Falta categoría', 'danger');
    return;
  }
  if (!nombreEl.value.trim()) {
    msgPerifError.textContent = 'Falta nombre.';
    showToast('Falta nombre', 'danger');
    return;
  }

  const body = buildBodyFromForm(formPeriferico);

  // periférico no tiene IMEI real, pero nuestra API requiere serial_imei único.
  // puedes dejar serial_imei vacío y la API debe permitirlo, o generar uno sintético
  // si tu tabla lo tiene como NOT NULL, genera algo:
  if (!body.serial_imei) {
    body.serial_imei = `PER-${Date.now()}`;
  }

  // también, si quieres que 'estado' exista siempre:
  if (!body.estado) {
    body.estado = 'DISPONIBLE';
  }

  // aseguramos nombre (ya viene por campo visible)
  try {
    btnGuardarPeriferico.disabled = true;

    const resp = await api('/api/assets', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      throw new Error(resp.error || 'Error desconocido al crear activo');
    }

    showToast('Periférico registrado ✅', 'success');
    closeModal(modalPerifEl);

  } catch (err) {
    console.error('Error guardando periférico:', err);
    msgPerifError.textContent = err.message || 'Error al crear activo';
    showToast(msgPerifError.textContent, 'danger');
  } finally {
    btnGuardarPeriferico.disabled = false;
  }
});
