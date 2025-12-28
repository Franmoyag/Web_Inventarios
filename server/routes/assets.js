import { Router } from 'express';
import { pool } from '../db.js';
import { verifyAuth, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/assets?q=texto
 * Lista o busca activos.
 */
router.get('/', verifyAuth, async (req, res) => {
  const q = (req.query.q || '').trim();

  // Traemos un resumen de asignaciones activas desde activo_asignaciones
  // - asignaciones_activas: cuántos colaboradores lo tienen ahora
  // - asignados_actuales: lista de nombres "A | B | C"
  let sql = `
    SELECT
      a.*,
      COALESCE(x.asignaciones_activas, 0) AS asignaciones_activas,
      x.asignados_actuales
    FROM activos a
    LEFT JOIN (
      SELECT
        aa.asset_id,
        COUNT(*) AS asignaciones_activas,
        GROUP_CONCAT(c.nombre ORDER BY aa.fecha_asignacion DESC SEPARATOR ' | ') AS asignados_actuales
      FROM activo_asignaciones aa
      JOIN colaboradores c ON c.id = aa.colaborador_id
      WHERE aa.estado = 'ASIGNADO'
      GROUP BY aa.asset_id
    ) x ON x.asset_id = a.id
  `;

  const args = [];
  if (q) {
    sql += `
      WHERE
        a.marca LIKE ? OR
        a.modelo LIKE ? OR
        a.serial_imei LIKE ? OR
        a.hostname LIKE ? OR
        a.colaborador_actual LIKE ? OR
        x.asignados_actuales LIKE ?
    `;
    const like = `%${q}%`;
    args.push(like, like, like, like, like, like);
  }

  sql += ` ORDER BY a.fecha_creacion DESC`;

  try {
    const [rows] = await pool.query(sql, args);
    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('Error listando activos:', err);
    res.status(500).json({ error: 'Error al obtener activos' });
  }
});

/**
 * POST /api/assets
 * Crea un activo (celular, notebook, periférico).
 */
router.post('/', verifyAuth, async (req, res) => {
  try {
    const user = req.session.user; // usuario logueado

    const {
      categoria,              // celular | notebook | mouse | etc
      nombre,                 // etiqueta amigable
      marca,
      modelo,
      serial_imei,
      iccid,
      telefono,
      unidades,               // periféricos (stock inicial)

      hostname,
      nb_ssd,
      nb_ram,
      nb_mobo,
      nb_cpu,
      nb_so,
      nb_tpm2,

      estado,                 // DISPONIBLE / ASIGNADO / ...
      ubicacion,
      colaborador_actual,
      parque_proyecto,
      encargado,
      usuario_login,

      fecha_asignacion,
      fecha_baja,

      observaciones
    } = req.body;

    // Validación mínima
    if (!serial_imei && categoria !== 'periferico' && categoria !== 'mouse' && categoria !== 'teclado') {
      return res.status(400).json({ error: 'Falta número de serie / IMEI' });
    }

    // Si nombre viene vacío por el frontend, igual tratamos de algo
    let safeNombre = nombre;
    if (!safeNombre || !safeNombre.trim()) {
      safeNombre = modelo?.trim() || serial_imei?.trim() || 'Sin nombre';
    }

    // Revisar duplicado por serial_imei (solo si viene)
    if (serial_imei && serial_imei.trim()) {
      const [dupe] = await pool.query(
        'SELECT id FROM activos WHERE serial_imei = ? LIMIT 1',
        [serial_imei.trim()]
      );
      if (dupe.length) {
        return res.status(409).json({ error: 'Ya existe un activo con ese IMEI / Nº de serie.' });
      }
    }

    // IMPORTANTE:
    // el orden de columnas aquí debe coincidir EXACTO con tu tabla actual
    // según tu dump `activos.sql`
    //
    // id (auto)
    // categoria
    // nombre
    // marca
    // modelo
    // serial_imei
    // iccid
    // telefono
    // unidades
    // hostname
    // especificaciones (NO la estamos usando -> va NULL)
    // estado
    // ubicacion
    // propietario (NO lo estamos usando -> va NULL)
    // fecha_alta (NO la estamos usando -> va NOW() o NULL, tú decides; pondremos NOW())
    // creado_por
    // observaciones
    // nb_ssd
    // nb_ram
    // nb_mobo
    // nb_cpu
    // nb_so
    // nb_tpm2
    // nb_office (no usamos -> NULL)
    // nb_antivirus (no usamos -> NULL)
    // nb_estado_general (no usamos -> NULL)
    // nb_obs_tecnica (no usamos -> NULL)
    // nb_tipo_falla (no usamos -> NULL)
    // colaborador_actual
    // nb_res (no usamos -> NULL)
    // parque_proyecto
    // encargado
    // usuario_login
    // fecha_baja
    // fecha_asignacion
    // fecha_creacion
    // fecha_actualizacion

    const [result] = await pool.query(
      `
      INSERT INTO activos (
        categoria,
        nombre,
        marca,
        modelo,
        serial_imei,
        iccid,
        telefono,
        unidades,
        hostname,
        especificaciones,
        estado,
        ubicacion,
        propietario,
        fecha_alta,
        creado_por,
        observaciones,
        nb_ssd,
        nb_ram,
        nb_mobo,
        nb_cpu,
        nb_so,
        nb_tpm2,
        nb_office,
        nb_antivirus,
        nb_estado_general,
        nb_obs_tecnica,
        nb_tipo_falla,
        colaborador_actual,
        nb_res,
        parque_proyecto,
        encargado,
        usuario_login,
        fecha_baja,
        fecha_asignacion,
        fecha_creacion,
        fecha_actualizacion
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())
      `,
      [
        categoria || null,
        safeNombre || null,
        marca || null,
        modelo || null,
        serial_imei || null,
        iccid || null,
        telefono || null,
        unidades || null,
        hostname || null,
        null, // especificaciones
        estado || 'DISPONIBLE',
        ubicacion || null,
        null, // propietario
        user?.id || null,
        observaciones || null,
        nb_ssd || null,
        nb_ram || null,
        nb_mobo || null,
        nb_cpu || null,
        nb_so || null,
        nb_tpm2 || null,
        null, // nb_office
        null, // nb_antivirus
        null, // nb_estado_general
        null, // nb_obs_tecnica
        null, // nb_tipo_falla
        colaborador_actual || null,
        null, // nb_res
        parque_proyecto || null,
        encargado || null,
        usuario_login || null,
        fecha_baja || null,
        fecha_asignacion || null
      ]
    );

    res.json({ ok: true, id: result.insertId });

  } catch (err) {
    console.error('Error creando activo:', err.code, err.sqlMessage);
    return res.status(500).json({
      ok: false,
      error: err.sqlMessage || 'Error al crear activo'
    });
  }
});


/**
 * PUT /api/assets/:id
 * Actualiza ciertos campos del activo.
 */
router.put('/:id', verifyAuth, async (req, res) => {
  const { id } = req.params;

  const motivo = req.body.motivo || null;
  await pool.query(`SET @motivo_cambio := ?`, [motivo]);

  // Permitimos actualizar solo estas columnas
  // - Notebook: nombre, nb_ssd, nb_ram, nb_so
  // - Celular: iccid, telefono
  const allowed = [
    'hostname',
    'nombre',
    'nb_ssd',
    'nb_ram',
    'nb_so',
    'iccid',
    'telefono',
    'estado',
  ];

  const set = [];
  const args = [];

  for (const field of allowed) {
    if (field in req.body) {
      set.push(`${field} = ?`);
      args.push(req.body[field] || null);
    }
  }

  if (!set.length) {
    return res.status(400).json({ error: 'Nada para actualizar' });
  }

  args.push(id);

  try {
    await pool.query(
      `UPDATE activos SET ${set.join(', ')} , fecha_actualizacion=NOW() WHERE id = ?`,
      args
    );
    res.json({ ok: true });

  } catch (err) {
    console.error('Error actualizando activo:', err);
    res.status(500).json({ error: 'Error al actualizar activo' });
  }
});

/**
 * DELETE /api/assets/:id
 * Solo ADMIN puede borrar.
 */
router.delete('/:id', verifyAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM assets WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Activo no encontrado' });
    }

    return res.json({ ok: true, message: 'Activo eliminado' });
  } catch (err) {
    console.error('Error al eliminar activo:', err);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});


// 🔹 Historial de cambios técnicos del activo
router.get('/:id/historial', verifyAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT campo, valor_anterior, valor_nuevo, motivo, cambiado_en
      FROM activo_historial
      WHERE asset_id = ?
      ORDER BY cambiado_en DESC`,
      [id]
    );

    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('Error cargando historial de activo:', err);
    res.status(500).json({ ok: false, error: 'Error al cargar historial del activo' });
  }
});

// 🔹 Detalle de un activo (si lo tienes)
router.get('/:id', verifyAuth, async (req, res) => {
  // ...
});




export default router;
