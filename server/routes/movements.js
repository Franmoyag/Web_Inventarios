import express from "express";
import { pool } from "../db.js";
import { verifyAuth } from "../middleware/auth.js";

const router = express.Router();

/**
 * Util: normaliza enum('SI','NO')
 */
function normCompartido(v) {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  return s === "SI" ? "SI" : "NO";
}

/**
 * Util: retorna un DATETIME (string) a partir de un DATE (YYYY-MM-DD)
 * Si no viene fecha, retorna null.
 */
function dateToDateTime00(dateStr) {
  const s = String(dateStr ?? "").trim();
  if (!s) return null;
  return `${s} 00:00:00`;
}

/**
 * Util: intenta resolver colaborador_id y proyecto_id desde:
 * - colaborador_id (si viene)
 * - asignado_a (puede ser RUT o nombre completo)
 */
async function resolveColaborador({ colaborador_id, asignado_a }) {
  if (colaborador_id) {
    const [[row]] = await pool.query(
      "SELECT id, nombre, proyecto_id FROM colaboradores WHERE id = ? LIMIT 1",
      [colaborador_id]
    );
    return row || null;
  }

  const token = String(asignado_a ?? "").trim();
  if (!token) return null;

  // 1) Match exacto por RUT
  const [[byRut]] = await pool.query(
    "SELECT id, nombre, proyecto_id FROM colaboradores WHERE rut = ? LIMIT 1",
    [token]
  );
  if (byRut) return byRut;

  // 2) Match exacto por nombre
  const [[byNameExact]] = await pool.query(
    "SELECT id, nombre, proyecto_id FROM colaboradores WHERE nombre = ? LIMIT 1",
    [token]
  );
  if (byNameExact) return byNameExact;

  // 3) Fallback: LIKE (si hay un único resultado)
  const [likeRows] = await pool.query(
    "SELECT id, nombre, proyecto_id FROM colaboradores WHERE nombre LIKE ? LIMIT 2",
    [`%${token}%`]
  );
  if (likeRows.length === 1) return likeRows[0];

  return null;
}

/**
 * GET /api/movements
 * Historial general (últimos N movimientos)
 */
router.get("/", verifyAuth, async (_req, res) => {
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
        m.usuario_login,
        m.supervisor,
        m.parque_proyecto,
        m.compartido,
        m.fecha_asignacion,
        m.fecha_baja,
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
    console.error("Error listando movimientos:", err);
    res.status(500).json({ error: "Error al obtener movimientos" });
  }
});

/**
 * GET /api/movements/:assetId
 * Historial SOLO de un activo específico
 */
router.get("/:assetId", verifyAuth, async (req, res) => {
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
        m.usuario_login,
        m.supervisor,
        m.parque_proyecto,
        m.compartido,
        m.fecha_asignacion,
        m.fecha_baja,
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
    console.error("Error obteniendo historial del activo:", err);
    res.status(500).json({ error: "Error al obtener historial del activo" });
  }
});

/**
 * POST /api/movements
 * Registra SALIDA o ENTRADA
 *
 * Reglas:
 * - Si compartido = 'NO': un activo solo puede tener 1 asignación activa.
 * - Si compartido = 'SI': permite múltiples asignaciones activas (una por colaborador).
 * - ENTRADA: si viene colaborador_id, devuelve solo ese colaborador; si no, devuelve TODOS.
 *
 * Fechas:
 * - Se prioriza fecha REAL: fecha_asignacion / fecha_baja (DATE)
 * - fecha_hora queda como "cuándo se registró".
 */
router.post("/", verifyAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const currentUser = req.session.user; // { id, nombre, role, ... }

    const {
      activo_id,
      tipo,
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
      fecha_baja,

      // opcional (si frontend ya lo manda)
      colaborador_id,
      proyecto_id,
    } = req.body;

    if (!activo_id || !tipo) {
      return res.status(400).json({ error: "Faltan activo o tipo" });
    }

    const tipoNorm = String(tipo).trim().toUpperCase();
    if (tipoNorm !== "SALIDA" && tipoNorm !== "ENTRADA") {
      return res.status(400).json({ error: "Tipo inválido (SALIDA/ENTRADA)" });
    }

    await conn.beginTransaction();

    // Resolver colaborador/proyecto cuando corresponde
    let colab = null;
    if (
      tipoNorm === "SALIDA" ||
      (tipoNorm === "ENTRADA" && (colaborador_id || asignado_a))
    ) {
      colab = await resolveColaborador({ colaborador_id, asignado_a });
      if (tipoNorm === "SALIDA" && !colab) {
        await conn.rollback();
        return res.status(400).json({
          error:
            "No se pudo identificar el colaborador. En SALIDA debes enviar colaborador_id o asignado_a (RUT o nombre exacto).",
        });
      }
    }

    const compartidoNorm = normCompartido(compartido);

    // Validación de NO compartido
    if (tipoNorm === "SALIDA" && compartidoNorm === "NO") {
      const [[exists]] = await conn.query(
        `SELECT id FROM activo_asignaciones
         WHERE asset_id = ? AND estado = 'ASIGNADO'
         LIMIT 1`,
        [activo_id]
      );
      if (exists) {
        await conn.rollback();
        return res.status(409).json({
          error:
            "Este activo NO es compartido y ya está asignado. Debe devolverse (ENTRADA) antes de reasignar.",
        });
      }
    }

    // Determinar fechas reales
    const fechaAsignacionDT = dateToDateTime00(fecha_asignacion) || null;
    const fechaBajaDT = dateToDateTime00(fecha_baja) || null;

    // 1) Insertar movimiento
    await conn.query(
      `
      INSERT INTO movimientos
      (
        asset_id,
        usuario_id,
        tipo,
        usuario_responsable,
        colaborador_id,
        proyecto_id,
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
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        activo_id,
        currentUser?.id || null,
        tipoNorm,
        currentUser?.nombre || "Desconocido",
        colab?.id || null,
        proyecto_id || colab?.proyecto_id || null,
        asignado_a || colab?.nombre || null,
        ubicacion || null,
        condicion_salida || null,
        condicion_entrada || null,
        notas || null,
        usuario_login || null,
        supervisor || null,
        parque_proyecto || null,
        compartidoNorm || null,
        fecha_asignacion || null,
        fecha_baja || null,
      ]
    );

    // 2) Asignaciones (tabla verdad)
    if (tipoNorm === "SALIDA") {
      // Evitar duplicar ASIGNADO del mismo activo para el mismo colaborador
      const [[already]] = await conn.query(
        `SELECT id FROM activo_asignaciones
         WHERE asset_id = ? AND colaborador_id = ? AND estado = 'ASIGNADO'
         LIMIT 1`,
        [activo_id, colab.id]
      );
      if (already) {
        await conn.rollback();
        return res.status(409).json({
          error:
            "Este activo ya está asignado a este colaborador (asignación activa).",
        });
      }

      await conn.query(
        `
        INSERT INTO activo_asignaciones
          (asset_id, colaborador_id, proyecto_id, fecha_asignacion, estado, notas)
        VALUES
          (?,?,?,?, 'ASIGNADO', ?)
        `,
        [
          activo_id,
          colab.id,
          proyecto_id || colab.proyecto_id || null,
          // si no viene fecha real, usamos NOW() (pero ideal: siempre mandar fecha_asignacion)
          fechaAsignacionDT || new Date(),
          "Asignado desde movimientos",
        ]
      );

      // 3) Resumen en activos
      if (compartidoNorm === "SI") {
        // El resumen debe indicar "COMPARTIDO"; el detalle está en activo_asignaciones
        await conn.query(
          `UPDATE activos
           SET estado='ASIGNADO',
               colaborador_actual='COMPARTIDO',
               colaborador_id=NULL,
               proyecto_id=NULL,
               usuario_login=?,
               encargado=?,
               parque_proyecto=?,
               fecha_asignacion=COALESCE(?, CURDATE()),
               fecha_baja=NULL,
               ubicacion=?
           WHERE id=?`,
          [
            usuario_login || null,
            supervisor || null,
            parque_proyecto || null,
            fecha_asignacion || null,
            ubicacion || null,
            activo_id,
          ]
        );
      } else {
        // No compartido -> el resumen puede quedar como el colaborador
        await conn.query(
          `UPDATE activos
           SET estado='ASIGNADO',
               colaborador_actual=?,
               colaborador_id=?,
               proyecto_id=?,
               usuario_login=?,
               encargado=?,
               parque_proyecto=?,
               fecha_asignacion=COALESCE(?, CURDATE()),
               fecha_baja=NULL,
               ubicacion=?
           WHERE id=?`,
          [
            colab.nombre,
            colab.id,
            proyecto_id || colab.proyecto_id || null,
            usuario_login || null,
            supervisor || null,
            parque_proyecto || null,
            fecha_asignacion || null,
            ubicacion || null,
            activo_id,
          ]
        );
      }
    }

    if (tipoNorm === "ENTRADA") {
      // Devolver uno o todos
      const devolucionDT = fechaBajaDT || new Date();

      if (colab?.id) {
        await conn.query(
          `
          UPDATE activo_asignaciones
          SET estado='DEVUELTO',
              fecha_devolucion=?,
              notas=CONCAT(COALESCE(notas,''), ' | Devuelto desde movimientos')
          WHERE asset_id=? AND colaborador_id=? AND estado='ASIGNADO'
          `,
          [devolucionDT, activo_id, colab.id]
        );
      } else {
        await conn.query(
          `
          UPDATE activo_asignaciones
          SET estado='DEVUELTO',
              fecha_devolucion=?,
              notas=CONCAT(COALESCE(notas,''), ' | Devuelto (entrada general)')
          WHERE asset_id=? AND estado='ASIGNADO'
          `,
          [devolucionDT, activo_id]
        );
      }

      // ¿Quedan asignaciones activas?
      const [[left]] = await conn.query(
        `SELECT COUNT(*) AS n FROM activo_asignaciones WHERE asset_id=? AND estado='ASIGNADO'`,
        [activo_id]
      );

      if (Number(left?.n || 0) > 0) {
        await conn.query(
          `UPDATE activos
           SET estado='ASIGNADO',
               colaborador_actual='COMPARTIDO',
               colaborador_id=NULL,
               proyecto_id=NULL,
               ubicacion=?,
               fecha_baja=COALESCE(?, fecha_baja)
           WHERE id=?`,
          [ubicacion || null, fecha_baja || null, activo_id]
        );
      } else {
        await conn.query(
          `UPDATE activos
           SET estado='DISPONIBLE',
               colaborador_actual=NULL,
               colaborador_id=NULL,
               proyecto_id=NULL,
               usuario_login=NULL,
               encargado=NULL,
               parque_proyecto=NULL,
               ubicacion=?,
               fecha_baja=COALESCE(?, CURDATE())
           WHERE id=?`,
          [ubicacion || null, fecha_baja || null, activo_id]
        );
      }
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    console.error("Error registrando movimiento:", err);
    res.status(500).json({ error: "Error al registrar movimiento" });
  } finally {
    conn.release();
  }
});

export default router;
