import { Router } from "express";
import { pool } from "../db.js";
import { verifyAuth, requireRole } from "../middleware/auth.js";
import { toCSV } from "../utils/csv.js";

const router = Router();

// =============================
// KPIs generales
// =============================
router.get('/kpis', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [[activos]] = await pool.query('SELECT COUNT(*) AS total FROM activos');
    const [[prestados]] = await pool.query("SELECT COUNT(*) AS total FROM activos WHERE estado='ASIGNADO'");
    const [[movMes]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM movimientos
      WHERE MONTH(fecha_hora)=MONTH(CURDATE()) AND YEAR(fecha_hora)=YEAR(CURDATE())
    `);

    res.json({
      total_activos: activos?.total ?? 0,
      prestados: prestados?.total ?? 0,
      movimientos_mes: movMes?.total ?? 0
    });
  } catch (err) {
    console.error("Error /api/reports/kpis:", err);
    res.status(500).json({ error: "Error al obtener KPIs" });
  }
});

// =============================
// Estados de activos
// =============================
router.get('/states', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT estado, COUNT(*) AS total
      FROM activos
      GROUP BY estado
      ORDER BY total DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("Error /api/reports/states", err);
    res.status(500).json({ error: "Error al obtener estados" });
  }
});

// =============================
// Top marcas
// =============================
router.get('/brands', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT COALESCE(marca,'(Sin marca)') AS marca, COUNT(*) AS total
      FROM activos
      GROUP BY marca
      ORDER BY total DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (err) {
    console.error("Error /api/reports/brands", err);
    res.status(500).json({ error: "Error al obtener marcas" });
  }
});

// =============================
// Categorías
// =============================
router.get('/categories', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT COALESCE(categoria,'(Sin categoría)') AS categoria, COUNT(*) AS total
      FROM activos
      GROUP BY categoria
      ORDER BY total DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("Error /api/reports/categories", err);
    res.status(500).json({ error: "Error al obtener categorías" });
  }
});

// =============================
// Activos por colaborador (con desglose Notebook / Celular)
// =============================
router.get('/assets-by-collaborator', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        COALESCE(colaborador_actual, 'Sin colaborador') AS colaborador,

        -- Total asignados (cualquier categoría)
        SUM(estado='ASIGNADO') AS activos_asignados,

        -- Notebooks asignados
        SUM(
          estado='ASIGNADO'
          AND LOWER(categoria) = 'notebook'
        ) AS notebooks_asignados,

        -- Celulares asignados
        SUM(
          estado='ASIGNADO'
          AND LOWER(categoria) = 'celular'
        ) AS celulares_asignados

      FROM activos
      GROUP BY colaborador
      ORDER BY activos_asignados DESC, colaborador ASC
      LIMIT 200
    `);

    res.json(rows);
  } catch (err) {
    console.error('Error /api/reports/assets-by-collaborator', err);
    res.status(500).json({ error: 'Error al obtener activos por colaborador' });
  }
});

// =============================
// Activos por proyecto
// =============================
router.get('/assets-by-project', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        COALESCE(p.nombre, '(Sin proyecto)') AS proyecto,
        COUNT(a.id) AS total,
        SUM(a.estado='ASIGNADO') AS asignados
      FROM activos a
      LEFT JOIN proyectos p ON p.id = a.proyecto_id
      GROUP BY proyecto
      ORDER BY total DESC, proyecto ASC
      LIMIT 200
    `);

    res.json(rows);
  } catch (err) {
    console.error('Error /api/reports/assets-by-project', err);
    res.status(500).json({ error: 'Error al obtener activos por proyecto' });
  }
});

// =============================
// Periféricos (snapshot)
// =============================
router.get('/peripherals', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        COALESCE(tipo, '(Sin tipo)') AS tipo,
        COUNT(*) AS total,
        SUM(estado='ASIGNADO') AS asignados
      FROM perifericos
      GROUP BY tipo
      ORDER BY total DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error('Error /api/reports/peripherals', err);
    res.status(500).json({ error: 'Error al obtener periféricos' });
  }
});

// =============================
// Movimientos del mes (para chart)
// =============================
router.get('/movements/month', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        DATE(fecha) AS dia,
        SUM(tipo='ENTRADA') AS entradas,
        SUM(tipo='SALIDA')  AS salidas
      FROM movimientos
      WHERE MONTH(fecha) = MONTH(CURDATE())
        AND YEAR(fecha)  = YEAR(CURDATE())
      GROUP BY dia
      ORDER BY dia ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error('Error /api/reports/movements/month', err);
    res.status(500).json({ error: 'Error al obtener movimientos del mes' });
  }
});

// =============================
// Export movimientos a CSV
// =============================
router.get('/export/movements.csv', verifyAuth, requireRole('ADMIN','REPORT'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '5000', 10) || 5000, 20000);

    const [rows] = await pool.query(`
      SELECT
        id,
        fecha,
        tipo,
        descripcion,
        activo_id,
        colaborador,
        proyecto
      FROM movimientos
      ORDER BY fecha DESC
      LIMIT ?
    `, [limit]);

    const csv = toCSV(rows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="movimientos.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Error /api/reports/export/movements.csv', err);
    res.status(500).json({ error: 'Error exportando movimientos' });
  }
});

// =============================
// Detalle asignados por colaborador + categoria (para popover)
// =============================
router.get('/assets-by-collaborator/details', verifyAuth, requireRole('ADMIN','REPORT'), async (req, res) => {
  try {
    const colaborador = (req.query.colaborador || '').trim();
    const categoria = (req.query.categoria || 'ALL').trim().toUpperCase(); // NOTEBOOK | CELULAR | ALL

    if (!colaborador) {
      return res.status(400).json({ error: 'Falta colaborador' });
    }

    let catFilter = '';
    const params = [colaborador];

    if (categoria === 'NOTEBOOK') {
      catFilter = " AND LOWER(a.categoria) = 'notebook' ";
    } else if (categoria === 'CELULAR') {
      catFilter = " AND LOWER(a.categoria) = 'celular' ";
    }

    const [rows] = await pool.query(`
      SELECT
        a.id,
        a.categoria,
        a.nombre,
        a.marca,
        a.modelo,
        a.serial_imei,
        a.estado
      FROM activos a
      WHERE COALESCE(a.colaborador_actual, 'Sin colaborador') = ?
        AND a.estado = 'ASIGNADO'
        ${catFilter}
      ORDER BY a.categoria ASC, a.nombre ASC
      LIMIT 80
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('Error /api/reports/assets-by-collaborator/details', err);
    res.status(500).json({ error: 'Error obteniendo detalle de activos' });
  }
});

export default router;
