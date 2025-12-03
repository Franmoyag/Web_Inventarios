import { api, $, $all } from './api.js';

// Auth
(async () => {
  try {
    const me = await api('/api/auth/me');
    if (!me.user) location.href = '/login.html';
    else $('#userInfo').textContent = `${me.user.nombre} (${me.user.role})`;
  } catch {
    location.href = '/login.html';
  }
})();

$('#btnLogout').addEventListener('click', async ()=> {
  await api('/api/auth/logout', { method: 'POST' });
  location.href = '/login.html';
});


// Crear periférico
$('#btnSavePeri').addEventListener('click', async () => {
  const f = $('#formPeri');
  const fd = new FormData(f);
  const body = Object.fromEntries(fd.entries());

  const stockInicial = parseInt(body.stock_inicial || '0', 10);
  body.stock_minimo = parseInt(body.stock_minimo || '0', 10);
  delete body.stock_inicial;

  if (!body.categoria || !body.nombre) {
    $('#periMsg').textContent = 'Completa categoría y nombre.';
    return;
  }

  try {
    const created = await api('/api/peripherals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (stockInicial > 0) {
      const newId = created.id || created.periferico_id || created.insertId;
      await api('/api/peripherals/moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periferico_id: newId,
          tipo: 'ENTRADA',
          cantidad: stockInicial,
          responsable: 'sistema',
          destino_origen: 'stock inicial',
          notas: 'carga inicial'
        })
      });
    }
    $('#periMsg').textContent = '';
    f.reset();
    loadPeris();
  } catch (e) {
    $('#periMsg').textContent = e.message;
  }
});


// Listar periféricos
const tbody = $('#tbodyPeris');
async function loadPeris() {
  const q = $('#q').value.trim();
  const data = await api('/api/peripherals' + (q ? `?q=${encodeURIComponent(q)}` : ''));
  if (!data.data.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-secondary">Sin resultados</td></tr>`;
    return;
  }
  tbody.innerHTML = data.data.map(p => `
    <tr data-id="${p.id}">
      <td>${p.id}</td>
      <td><span class="badge bg-info-subtle text-info-emphasis badge-soft">${p.categoria || ''}</span></td>
      <td class="fw-semibold">${p.nombre || ''}</td>
      <td>${p.marca || ''}</td>
      <td>${p.modelo || ''}</td>
      <td>${p.sku || ''}</td>
      <td><span class="badge ${p.stock_actual > (p.stock_minimo||0) ? 'text-bg-success' : 'text-bg-danger'}">${p.stock_actual}</span></td>
      <td>
        <button class="btn btn-sm btn-outline-info me-1" data-kardex="${p.id}">Ver Kardex</button>
        <button class="btn btn-sm btn-outline-secondary me-1" data-fillid="${p.id}">Usar ID</button>
        <!-- Si quieres: botón para borrar/editar luego -->
      </td>
    </tr>
  `).join('');
}
$('#formFiltro').addEventListener('submit', (e)=>{ e.preventDefault(); loadPeris(); });
$('#btnBuscar').addEventListener('click', (e)=>{ e.preventDefault(); loadPeris(); });
loadPeris();


// Clicks en tabla
tbody.addEventListener('click', async (e) => {
  const idKardex = e.target.getAttribute('data-kardex');
  const idFill = e.target.getAttribute('data-fillid');
  if (idKardex) {
    await loadKardex(idKardex);
    const input = document.querySelector('#formMovPeri [name="periferico_id"]');
    if (input) input.value = idKardex;
  }
  if (idFill) {
    const input = document.querySelector('#formMovPeri [name="periferico_id"]');
    if (input) input.value = idFill;
  }
});


// Kardex
const tbodyKardex = $('#tbodyKardex');

async function loadKardex(periferico_id) {
  const data = await api('/api/peripherals/moves?periferico_id=' + encodeURIComponent(periferico_id));
  if (!data.data.length) {
    tbodyKardex.innerHTML = `<tr><td colspan="7" class="text-center text-secondary">Sin movimientos para #${periferico_id}</td></tr>`;
    return;
  }
  tbodyKardex.innerHTML = data.data.map(m => `
    <tr>
      <td>${m.id}</td>
      <td><span class="badge ${m.tipo==='ENTRADA'?'text-bg-success':(m.tipo==='SALIDA'?'text-bg-warning':'text-bg-secondary')}">${m.tipo}</span></td>
      <td>${m.cantidad}</td>
      <td>${m.fecha_hora}</td>
      <td>${m.responsable || ''}</td>
      <td>${m.destino_origen || ''}</td>
      <td>${m.notas || ''}</td>
    </tr>
  `).join('');
}


// Registrar movimiento de periférico
$('#btnSaveMovPeri').addEventListener('click', async () => {
  const f = $('#formMovPeri');
  const fd = new FormData(f);
  const body = Object.fromEntries(fd.entries());
  body.cantidad = parseInt(body.cantidad || '0', 10);
  if (!body.periferico_id || !body.tipo || !body.cantidad) {
    $('#periMovMsg').textContent = 'Completa ID, tipo y cantidad.';
    return;
  }
  try {
    await api('/api/peripherals/moves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    $('#periMovMsg').textContent = '';
    await loadKardex(body.periferico_id);
    loadPeris(); // refresca stock
  } catch (e) {
    $('#periMovMsg').textContent = e.message;
  }
});

$('#btnCargarKardex').addEventListener('click', async () => {
  const id = document.querySelector('#formMovPeri [name="periferico_id"]').value.trim();
  if (!id) return alert('Indica el ID del periférico');
  loadKardex(id);
});
