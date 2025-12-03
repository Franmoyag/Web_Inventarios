import { api, $, $all } from './api.js';


// Auth + solo ADMIN
(async () => {
  try {
    const me = await api('/api/auth/me');
    if (!me.user) location.href = '/login.html';
    $('#userInfo').textContent = `${me.user.nombre} (${me.user.role})`;
    if (me.user.role !== 'ADMIN') {
      alert('Solo ADMIN puede gestionar usuarios');
      location.href = '/';
    }
  } catch {
    location.href = '/login.html';
  }
})();

$('#btnLogout').addEventListener('click', async ()=> {
  await api('/api/auth/logout', { method: 'POST' });
  location.href = '/login.html';
});


// Crear usuario
$('#btnCreate').addEventListener('click', async () => {
  const f = $('#formCreate');
  const fd = new FormData(f);
  const body = Object.fromEntries(fd.entries());
  if (!body.nombre || !body.email || !body.password || !body.role) {
    $('#msgCreate').textContent = 'Completa todos los campos';
    return;
  }
  try {
    await api('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    $('#msgCreate').textContent = '';
    f.reset();
    loadUsers();
  } catch (e) {
    $('#msgCreate').textContent = e.message;
  }
});


// Lista usuarios
const tbody = $('#tbodyUsers');

async function loadUsers() {
  const data = await api('/api/users');
  if (!data.data.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-secondary">Sin datos</td></tr>`;
    return;
  }
  tbody.innerHTML = data.data.map(u => `
    <tr data-id="${u.id}">
      <td>${u.id}</td>
      <td>${u.nombre}</td>
      <td>${u.email}</td>
      <td><span class="badge text-bg-secondary">${u.role}</span></td>
      <td>${u.activo ? '<span class="badge text-bg-success">Sí</span>' : '<span class="badge text-bg-danger">No</span>'}</td>
      <td>${new Date(u.creado_en).toLocaleString()}</td>
      <td>
        <button class="btn btn-sm btn-outline-info me-1" data-edit="${u.id}">Editar</button>
      </td>
    </tr>
  `).join('');
}

loadUsers();

// Editar
const modalEl = document.getElementById('modalEditUser');
const modal = new bootstrap.Modal(modalEl);
const form = $('#formEditUser');
const msgEdit = $('#msgEditUser');

tbody.addEventListener('click', async (e) => {
  const id = e.target.getAttribute('data-edit');
  if (!id) return;

  // Precargar desde la fila
  const tr = e.target.closest('tr');
  form.reset();
  form.elements.id.value = id;
  form.elements.role.value = tr.children[3].innerText.trim();
  form.elements.activo.value = tr.children[4].innerText.includes('Sí') ? '1' : '0';
  msgEdit.textContent = '';
  modal.show();
});

$('#btnSaveUser').addEventListener('click', async () => {
  const id = form.elements.id.value;
  const role = form.elements.role.value;
  const activo = form.elements.activo.value === '1';
  const password = form.elements.password.value.trim();
  const body = { role, activo };
  if (password) body.password = password;

  try {
    await api('/api/users/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    msgEdit.textContent = '';
    modal.hide();
    loadUsers();
  } catch (e) {
    msgEdit.textContent = e.message;
  }
});
