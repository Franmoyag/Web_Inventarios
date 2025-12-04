// server/routes/collaborators.js
import { Router } from "express";
import { pool } from "../db.js";
import { verifyAuth } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/collaborators?q=texto
 * Autocomplete rápido (lo usas en otros lados, input de búsqueda simple)
 */
router.get("/", verifyAuth, async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  const like = `%${q}%`;

  try {
    const [rows] = await pool.query(
      `
      SELECT
        c.id,
        c.nombre,
        c.rut,
        c.proyecto_id,
        p.nombre   AS proyecto_nombre,
        car.nombre AS cargo_nombre,
        enc.nombre AS encargado_nombre
      FROM colaboradores c
      LEFT JOIN proyectos p     ON p.id   = c.proyecto_id
      LEFT JOIN cargos car      ON car.id = c.cargo_id
      LEFT JOIN colaboradores enc ON enc.id = c.encargado_id
      WHERE c.activo = 1
        AND (c.nombre LIKE ? OR c.rut LIKE ?)
      ORDER BY c.nombre
      LIMIT 20
      `,
      [like, like]
    );

    res.json(rows);
  } catch (err) {
    console.error("[/api/collaborators] Error:", err);
    res.status(500).json({ error: "Error al buscar colaboradores" });
  }
});

/**
 * GET /api/collaborators/search?q=texto
 * Búsqueda de colaboradores para la página de actas (retorna { ok, items })
 */
router.get("/search", verifyAuth, async (req, res) => {
  const q = (req.query.q || "").trim();

  if (!q) {
    return res.json({ ok: true, items: [] });
  }

  try {
    const like = `%${q}%`;

    const [rows] = await pool.query(
      `
      SELECT 
        c.id,
        c.nombre,
        c.rut,
        c.genero,
        c.activo,
        ca.nombre AS cargo_nombre,
        p.nombre  AS proyecto_nombre
      FROM colaboradores c
      LEFT JOIN cargos ca   ON ca.id = c.cargo_id
      LEFT JOIN proyectos p ON p.id = c.proyecto_id
      WHERE
        c.rut LIKE ? OR
        c.nombre LIKE ?
      ORDER BY c.nombre
      LIMIT 50
      `,
      [like, like]
    );

    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error("[/api/collaborators/search] Error:", err);
    res.status(500).json({ error: "Error al buscar colaboradores" });
  }
});

/**
 * GET /api/collaborators/projects
 * Proyectos con cantidad de colaboradores activos
 */
router.get("/projects", verifyAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        p.id,
        p.nombre,
        p.ciudad,
        p.region,
        COUNT(c.id) AS total_colaboradores
      FROM proyectos p
      LEFT JOIN colaboradores c
        ON c.proyecto_id = p.id
       AND c.activo = 1
      GROUP BY p.id, p.nombre, p.ciudad, p.region
      ORDER BY p.nombre ASC
    `);

    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error("[/api/collaborators/projects] Error:", err);
    res.status(500).json({ ok: false, error: "Error al obtener proyectos." });
  }
});

/**
 * GET /api/collaborators/encargados
 * Encargados con cantidad de colaboradores activos
 */
router.get("/encargados", verifyAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        e.id,
        e.nombre,
        COUNT(c.id) AS total_colaboradores
      FROM colaboradores e
      JOIN colaboradores c
        ON c.encargado_id = e.id
       AND c.activo = 1
      GROUP BY e.id, e.nombre
      ORDER BY e.nombre ASC
    `);

    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error("[/api/collaborators/encargados] Error:", err);
    res.status(500).json({ ok: false, error: "Error al obtener encargados." });
  }
});

/**
 * GET /api/collaborators/list
 * Detalle de colaboradores filtrado por proyecto o encargado
 *    ?proyecto_id=ID  OR  ?encargado_id=ID
 *    ?q=texto (opcional: nombre / RUT)
 */
router.get("/list", verifyAuth, async (req, res) => {
  try {
    const { proyecto_id, encargado_id, q = "" } = req.query;

    if (!proyecto_id && !encargado_id) {
      return res
        .status(400)
        .json({ ok: false, error: "Debe indicar proyecto_id o encargado_id." });
    }

    let where = "c.activo IN (0,1)";
    const params = [];

    if (proyecto_id) {
      where += " AND c.proyecto_id = ?";
      params.push(proyecto_id);
    }

    if (encargado_id) {
      where += " AND c.encargado_id = ?";
      params.push(encargado_id);
    }

    if (q.trim()) {
      const like = `%${q}%`;
      where += " AND (c.nombre LIKE ? OR c.rut LIKE ?)";
      params.push(like, like);
    }

    const sql = `
      SELECT
        c.id,
        c.nombre,
        c.rut,
        c.genero,
        c.activo,
        cargos.nombre AS cargo,
        p.nombre      AS proyecto,
        p.ciudad,
        p.region,
        enc.nombre    AS encargado
      FROM colaboradores c
      LEFT JOIN cargos cargos
        ON c.cargo_id = cargos.id
      LEFT JOIN proyectos p
        ON c.proyecto_id = p.id
      LEFT JOIN colaboradores enc
        ON c.encargado_id = enc.id
      WHERE ${where}
      ORDER BY c.nombre ASC
    `;

    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error("[/api/collaborators/list] Error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Error al obtener colaboradores." });
  }
});

/**
 * PUT /api/collaborators/:id/activo
 * Cambia el estado activo/inactivo de un colaborador.
 * Si se intenta desactivar y tiene equipos ASIGNADOS, no se permite.
 */
router.put("/:id/activo", verifyAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) {
    return res.json({ ok: false, error: "ID de colaborador inválido." });
  }

  let { activo } = req.body;
  // Normalizar a 0/1
  if (typeof activo === "string") {
    activo = activo === "true" || activo === "1" ? 1 : 0;
  } else if (typeof activo === "boolean") {
    activo = activo ? 1 : 0;
  } else {
    activo = Number(activo) ? 1 : 0;
  }

  try {
    if (activo === 0) {
      // 1) Traer nombre del colaborador
      const [colabRows] = await pool.query(
        "SELECT id, nombre FROM colaboradores WHERE id = ? LIMIT 1",
        [id]
      );
      if (!colabRows.length) {
        return res.json({ ok: false, error: "Colaborador no encontrado." });
      }
      const colab = colabRows[0];

      // 2) Verificar activos ASIGNADOS
      //    - ligados por colaborador_id
      //    - o con solo colaborador_actual = nombre
      const [pending] = await pool.query(
        `
        SELECT
          a.id,
          a.categoria,
          a.nombre,
          a.marca,
          a.modelo,
          a.serial_imei,
          a.estado
        FROM activos a
        WHERE
          a.estado = 'ASIGNADO'
          AND (
            a.colaborador_id = ?
            OR (a.colaborador_id IS NULL AND a.colaborador_actual = ?)
          )
        ORDER BY a.id
        `,
        [id, colab.nombre]
      );

      if (pending.length > 0) {
        return res.json({
          ok: false,
          reason: "PENDING_ASSETS",
          message:
            "No se puede dejar inactivo. Tiene equipos pendientes de devolución.",
          assets: pending,
        });
      }
    }

    const [result] = await pool.query(
      `UPDATE colaboradores SET activo = ? WHERE id = ?`,
      [activo, id]
    );

    if (result.affectedRows === 0) {
      return res.json({ ok: false, error: "Colaborador no encontrado." });
    }

    res.json({
      ok: true,
      activo,
      message: `Colaborador marcado como ${activo ? "ACTIVO" : "INACTIVO"}.`,
    });
  } catch (err) {
    console.error("[PUT /api/collaborators/:id/activo] Error:", err);
    res.status(500).json({
      ok: false,
      error: "Error al actualizar estado del colaborador.",
    });
  }
});

/**
 * GET /api/collaborators/:id/history
 * Historial de movimientos + activos actuales del colaborador
 */
router.get("/:id/history", verifyAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) {
    return res.status(400).json({ error: "ID inválido" });
  }

  try {
    // 1) Datos del colaborador
    const [colabRows] = await pool.query(
      `
      SELECT 
        c.*,
        ca.nombre AS cargo_nombre,
        p.nombre  AS proyecto_nombre
      FROM colaboradores c
      LEFT JOIN cargos ca   ON ca.id = c.cargo_id
      LEFT JOIN proyectos p ON p.id = c.proyecto_id
      WHERE c.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!colabRows.length) {
      return res.status(404).json({ error: "Colaborador no encontrado" });
    }

    const colaborador = colabRows[0];

    // 2) Activos actuales
    const [activosActuales] = await pool.query(
      `
      SELECT
        a.id,
        a.categoria,
        a.nombre,
        a.marca,
        a.modelo,
        a.serial_imei,
        a.estado,
        a.colaborador_id,
        a.proyecto_id,
        a.parque_proyecto,
        a.usuario_login,
        a.fecha_asignacion,
        a.fecha_baja
      FROM activos a
      WHERE
        a.colaborador_id = ?
        OR (a.colaborador_id IS NULL AND a.colaborador_actual = ?)
      ORDER BY a.id
      `,
      [id, colaborador.nombre]
    );

    // 3) Historial de movimientos
    const [movimientos] = await pool.query(
      `
      SELECT
        m.id,
        m.fecha_hora,
        m.tipo,
        m.asignado_a,
        m.ubicacion,
        m.condicion_salida,
        m.condicion_entrada,
        m.notas,
        m.parque_proyecto,
        m.supervisor,
        m.usuario_responsable,
        m.usuario_login,
        m.fecha_asignacion,
        m.fecha_baja,
        a.categoria,
        a.marca,
        a.modelo,
        a.serial_imei
      FROM movimientos m
      JOIN activos a ON a.id = m.asset_id
      WHERE m.colaborador_id = ?
      ORDER BY m.fecha_hora DESC, m.id DESC
      `,
      [id]
    );

    res.json({
      ok: true,
      colaborador,
      activosActuales,
      movimientos,
    });
  } catch (err) {
    console.error("[/api/collaborators/:id/history] ERROR:", err);
    res
      .status(500)
      .json({ error: "Error al obtener historial del colaborador" });
  }
});

export default router;
