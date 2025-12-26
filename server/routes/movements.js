import express from 'express';
import { pool } from '../db.js';
import { verifyAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/movements
 * Historial general (últimos N movimientos)
 */
router.get('/', verifyAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        m.id,
        m.fecha_hora,
        m.tipo,
        m.asignado_a,
        m.ubicacion,
        m.condicion_salida,
        m.condicion_entrada,
        m.usuario_responsable,
        a.categoria,
        a.marca,
        a.modelo,
        a.serial_imei
      FROM movimientos m
      JOIN activos a ON a.id = m.asset_id
      ORDER BY m.fecha_hora DESC
      LIMIT 200
    `);

    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('Error listando movimientos:', err);
    res.status(500).json({ error: 'Error al obtener movimientos' });
  }
});

/**
 * GET /api/movements/:assetId
 * Historial SOLO de un activo específico
 */
router.get('/:assetId', verifyAuth, async (req, res) => {
  try {
    const { assetId } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        m.id,
        m.fecha_hora,
        m.tipo,
        m.asignado_a,
        m.ubicacion,
        m.condicion_salida,
        m.condicion_entrada,
        m.usuario_responsable,
        a.id          AS activo_id,
        a.categoria   AS categoria,
        a.marca       AS marca,
        a.modelo      AS modelo,
        a.serial_imei AS serial_imei
      FROM movimientos m
      JOIN activos a ON a.id = m.asset_id
      WHERE m.asset_id = ?
      ORDER BY m.fecha_hora DESC
      `,
      [assetId]
    );

    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('Error obteniendo historial del activo:', err);
    res.status(500).json({ error: 'Error al obtener historial del activo' });
  }
});

/**
 * POST /api/movements
 * Registra SALIDA o ENTRADA
 */
router.post('/', verifyAuth, async (req, res) => {
  const currentUser = req.session.user; // { id, nombre, role, ... }

  const {
    activo_id,
    tipo,
    asignado_a,
    ubicacion,
    condicion_salida,
    condicion_entrada,
    notas,

    // nuevos campos para notebooks / control operativo
    usuario_login,
    supervisor,
    parque_proyecto,
    compartido,
    fecha_asignacion,
    fecha_baja,
    colaborador_id
  } = req.body;

  if (!activo_id || !tipo) {
    return res.status(400).json({ error: 'Faltan activo o tipo' });
  }

  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1. Insertar movimiento completo
    await conn.query(
      `
      INSERT INTO movimientos
      (
        asset_id,
        tipo,
        usuario_responsable,
        asignado_a,
        ubicacion,
        condicion_salida,
        condicion_entrada,
        notas,
        usuario_login,
        supervisor,
        parque_proyecto,
        compartido,
        fecha_asignacion,
        fecha_baja
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        activo_id,
        tipo,
        currentUser?.nombre || 'Desconocido',
        asignado_a || null,
        ubicacion || null,
        condicion_salida || null,
        condicion_entrada || null,
        notas || null,
        usuario_login || null,
        supervisor || null,
        parque_proyecto || null,
        compartido || null,
        fecha_asignacion || null,
        fecha_baja || null,
      ]
    );

    const colabId = Number.isFinite(Number(colaborador_id))
      ? Number(colaborador_id)
      : null;

    

    // 2. Actualizar el estado del activo y dejar MOTIVO para el historial técnico
    if (tipo === 'SALIDA') {
      // MOTIVO en historial técnico: solo el comentario del usuario (notas)
      let motivoHistorial = null;

      if (notas && notas.trim()) {
        motivoHistorial = notas.trim();
      }

      if (motivoHistorial) {
        // Esta variable la usa el trigger para llenar la columna MOTIVO
        await conn.query('SET @motivo_cambio := ?', [motivoHistorial]);
      }

      await conn.query(
        `UPDATE activos
        SET estado = 'ASIGNADO',
            colaborador_id = ?,
            colaborador_actual = ?,
            usuario_login = ?,
            encargado = ?,
            parque_proyecto = ?,
            fecha_asignacion = COALESCE(?, CURDATE()),
            fecha_baja = ?,
            ubicacion = ?
        WHERE id = ?`,
        [
          colabId,
          asignado_a || null,
          usuario_login || null,
          supervisor || null,
          parque_proyecto || null,
          fecha_asignacion || null,
          fecha_baja || null,
          ubicacion || null,
          activo_id,
        ]
      );
    } else if (tipo === 'ENTRADA') {
      // MOTIVO en ENTRADA: también solo el comentario, si existe
      let motivoHistorial = null;

      if (notas && notas.trim()) {
        motivoHistorial = notas.trim();
      }

      if (motivoHistorial) {
        await conn.query('SET @motivo_cambio := ?', [motivoHistorial]);
      }

      await conn.query(
        `UPDATE activos
        SET estado = 'DISPONIBLE',
            colaborador_id = NULL,
            colaborador_actual = NULL,
            usuario_login = NULL,
            encargado = NULL,
            parque_proyecto = NULL,
            ubicacion = ?,
            fecha_baja = COALESCE(?, CURDATE())
        WHERE id = ?`,
        [ubicacion || null, fecha_baja || null, activo_id]
      );
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    console.error('Error registrando movimiento:', err);
    if (conn) await conn.rollback();
    res.status(500).json({ error: 'Error al registrar movimiento' });
  } finally {
    if (conn) conn.release();
  }
});

export default router;
