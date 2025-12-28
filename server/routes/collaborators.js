// server/routes/collaborators.js
import { Router } from "express";
import { pool } from "../db.js";
import { verifyAuth } from "../middleware/auth.js";

const router = Router();

/* ========== HELPERS RUT CHILENO ========== */

function limpiarRut(rut) {
  if (!rut) return "";
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

function esRutGenerico(rut) {
  const limpio = limpiarRut(rut);
  // 11.111.111-1 -> 111111111
  return limpio === "111111111";
}

function validarRutChileno(rut) {
  if (!rut) return false;

  const limpio = limpiarRut(rut);
  // 7-8 dígitos + DV (0-9 o K)
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return false;

  const cuerpo = limpio.slice(0, -1);
  const dvRecibido = limpio.slice(-1);

  let suma = 0;
  let multiplicador = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = suma % 11;
  const dvCalculadoNum = 11 - resto;

  let dvCalculado;
  if (dvCalculadoNum === 11) dvCalculado = "0";
  else if (dvCalculadoNum === 10) dvCalculado = "K";
  else dvCalculado = String(dvCalculadoNum);

  return dvRecibido === dvCalculado;
}

/**
 * GET /api/collaborators?q=texto
 * Autocomplete rápido
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
 * Búsqueda para actas (retorna { ok, items })
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

// GET /api/collaborators/:id/assets
router.get('/:id/assets', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        a.*,
        aa.fecha_asignacion AS fecha_asignacion_real,
        aa.notas AS notas_asignacion
      FROM activo_asignaciones aa
      JOIN activos a ON a.id = aa.asset_id
      WHERE aa.colaborador_id = ?
        AND aa.estado = 'ASIGNADO'
      ORDER BY aa.fecha_asignacion DESC
      `,
      [id]
    );

    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('Error activos actuales del colaborador:', err);
    res.status(500).json({ error: 'Error al obtener activos del colaborador' });
  }
});


/* Listas simples para selects */

router.get("/cargos", verifyAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, nombre
      FROM cargos
      ORDER BY nombre ASC
      `
    );

    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error("[/api/collaborators/cargos] Error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Error al obtener lista de cargos." });
  }
});

router.get("/proyectos", verifyAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, nombre
      FROM proyectos
      ORDER BY nombre ASC
      `
    );

    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error("[/api/collaborators/proyectos] Error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Error al obtener lista de proyectos." });
  }
});

/**
 * GET /api/collaborators/list
 * - Si viene proyecto_id => lista por proyecto
 * - Si viene encargado_id => lista por encargado
 * - Si no viene ninguno => lista TODOS los colaboradores
 *   (para el botón "Total Colaboradores")
 */
router.get("/list", verifyAuth, async (req, res) => {
  try {
    const { proyecto_id, encargado_id, q = "" } = req.query;

    // Siempre partimos de esta base
    let where = "c.activo IN (0,1)";
    const params = [];

    // Filtro por proyecto (si viene)
    if (proyecto_id) {
      where += " AND c.proyecto_id = ?";
      params.push(proyecto_id);
    }

    // Filtro por encargado (si viene)
    if (encargado_id) {
      where += " AND c.encargado_id = ?";
      params.push(encargado_id);
    }

    // Búsqueda por texto (nombre o RUT)
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

    return res.json({ ok: true, items: rows });
  } catch (err) {
    console.error("[/api/collaborators/list] Error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Error al obtener colaboradores." });
  }
});



/**
 * PUT /api/collaborators/:id/activo
 * Cambia el estado activo/inactivo con validación de equipos pendientes
 * (Ahora valida con activo_asignaciones = fuente de verdad)
 */
router.put("/:id/activo", verifyAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) {
    return res.json({ ok: false, error: "ID de colaborador inválido." });
  }

  let { activo } = req.body;
  if (typeof activo === "string") {
    activo = activo === "true" || activo === "1" ? 1 : 0;
  } else if (typeof activo === "boolean") {
    activo = activo ? 1 : 0;
  } else {
    activo = Number(activo) ? 1 : 0;
  }

  try {
    // Si lo quieren dejar INACTIVO, validar pendientes
    if (activo === 0) {
      const [colabRows] = await pool.query(
        "SELECT id, nombre FROM colaboradores WHERE id = ? LIMIT 1",
        [id]
      );
      if (!colabRows.length) {
        return res.json({ ok: false, error: "Colaborador no encontrado." });
      }

      // ✅ FUENTE DE VERDAD: activo_asignaciones (incluye compartidos)
      const [pending] = await pool.query(
        `
        SELECT
          a.id,
          a.categoria,
          a.nombre,
          a.marca,
          a.modelo,
          a.serial_imei,
          a.estado,
          aa.fecha_asignacion
        FROM activo_asignaciones aa
        JOIN activos a ON a.id = aa.asset_id
        WHERE
          aa.colaborador_id = ?
          AND aa.estado = 'ASIGNADO'
        ORDER BY a.id
        `,
        [id]
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
// GET /api/collaborators/:id/history
router.get('/:id/history', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Datos del colaborador (ajusta campos si tu SELECT original trae más info)
    const [[colaborador]] = await pool.query(
      `
      SELECT
        c.id,
        c.nombre,
        c.rut,
        c.activo,
        c.genero,
        car.nombre AS cargo_nombre,
        p.nombre AS proyecto_nombre
      FROM colaboradores c
      LEFT JOIN cargos car ON car.id = c.cargo_id
      LEFT JOIN proyectos p ON p.id = c.proyecto_id
      WHERE c.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!colaborador) {
      return res.status(404).json({ ok: false, error: 'Colaborador no encontrado' });
    }

    // 2) Activos actuales (FUENTE DE VERDAD) -> activo_asignaciones
    // Traemos también la fecha de asignación real (aa.fecha_asignacion)
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
        a.ubicacion,
        a.parque_proyecto,
        a.usuario_login,
        a.encargado,
        aa.fecha_asignacion,
        aa.fecha_devolucion AS fecha_baja,
        aa.notas AS notas_asignacion
      FROM activo_asignaciones aa
      JOIN activos a ON a.id = aa.asset_id
      WHERE aa.colaborador_id = ?
        AND aa.estado = 'ASIGNADO'
      ORDER BY aa.fecha_asignacion DESC
      `,
      [id]
    );

    // 3) Movimientos del colaborador (historial)
    // OJO: mostramos fecha_hora como log, pero también traemos fecha_asignacion/fecha_baja reales si existen
    const [movimientos] = await pool.query(
      `
      SELECT
        m.id,
        m.fecha_hora,
        m.tipo,
        m.asignado_a,
        m.ubicacion,
        m.parque_proyecto,
        m.usuario_login,
        m.supervisor,
        m.compartido,
        m.fecha_asignacion,
        m.fecha_baja,
        m.notas,
        a.categoria,
        a.marca,
        a.modelo,
        a.serial_imei
      FROM movimientos m
      JOIN activos a ON a.id = m.asset_id
      WHERE m.colaborador_id = ?
      ORDER BY m.fecha_hora DESC
      LIMIT 300
      `,
      [id]
    );

    return res.json({
      ok: true,
      colaborador,
      activosActuales,
      movimientos
    });
  } catch (err) {
    console.error('Error history colaborador:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener historial del colaborador' });
  }
});


/* ========== CREAR / OBTENER / ACTUALIZAR ========== */

// CREAR NUEVO COLABORADOR
router.post("/", verifyAuth, async (req, res) => {
  try {
    const { nombre, rut, genero, cargo_id, proyecto_id, encargado_id } = req.body;

    if (!rut || rut.trim() === "") {
      return res.json({ ok: false, error: "El RUT es obligatorio." });
    }

    if (!esRutGenerico(rut) && !validarRutChileno(rut)) {
      return res.json({
        ok: false,
        error: "El RUT ingresado no es un RUT chileno válido.",
      });
    }

    const rutGenerico = "11.111.111-1";

    if (rut !== rutGenerico) {
      const [existe] = await pool.query(
        "SELECT id FROM colaboradores WHERE rut = ? LIMIT 1",
        [rut]
      );

      if (existe.length > 0) {
        return res.json({
          ok: false,
          error: "Este RUT ya existe. Debe ingresar otro.",
        });
      }
    }

    await pool.query(
      `
      INSERT INTO colaboradores (nombre, rut, genero, cargo_id, proyecto_id, encargado_id, activo)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      `,
      [nombre, rut, genero, cargo_id, proyecto_id, encargado_id]
    );

    res.json({ ok: true, message: "Colaborador creado" });
  } catch (err) {
    console.error("[POST /api/collaborators] Error:", err);
    res.json({ ok: false, error: "Error al crear colaborador" });
  }
});

/**
 * GET /api/collaborators/:id
 */
router.get("/:id", verifyAuth, async (req, res) => {
  try {
    const id = req.params.id;

    const [rows] = await pool.query(
      `
      SELECT *
      FROM colaboradores
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length)
      return res.json({ ok: false, error: "Colaborador no encontrado" });

    res.json({ ok: true, colaborador: rows[0] });
  } catch (err) {
    console.error("[GET /api/collaborators/:id] Error:", err);
    res.json({ ok: false, error: "Error al obtener colaborador" });
  }
});

/**
 * PUT /api/collaborators/:id
 */
router.put("/:id", verifyAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const { nombre, rut, genero, cargo_id, proyecto_id, encargado_id } = req.body;

    if (!rut || rut.trim() === "") {
      return res.json({ ok: false, error: "El RUT es obligatorio." });
    }

    if (!esRutGenerico(rut) && !validarRutChileno(rut)) {
      return res.json({
        ok: false,
        error: "El RUT ingresado no es un RUT chileno válido.",
      });
    }

    const rutGenerico = "11.111.111-1";

    if (rut !== rutGenerico) {
      const [existe] = await pool.query(
        "SELECT id FROM colaboradores WHERE rut = ? AND id <> ? LIMIT 1",
        [rut, id]
      );

      if (existe.length > 0) {
        return res.json({
          ok: false,
          error: "Este RUT ya existe. Debe ingresar otro.",
        });
      }
    }

    await pool.query(
      `
      UPDATE colaboradores SET
        nombre = ?,
        rut = ?,
        genero = ?,
        cargo_id = ?,
        proyecto_id = ?,
        encargado_id = ?
      WHERE id = ?
      `,
      [nombre, rut, genero, cargo_id, proyecto_id, encargado_id, id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/collaborators/:id] Error:", err);
    res.json({ ok: false, error: "Error al actualizar colaborador" });
  }
});

export default router;
