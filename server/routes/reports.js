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
      WHERE MONTH(fecha_hora) = MONTH(CURDATE())
        AND YEAR(fecha_hora)  = YEAR(CURDATE())
    `);

    res.json({
      total_activos    : activos.total || 0,
      prestados        : prestados.total || 0,
      movimientos_mes  : movMes.total || 0
    });
  } catch (err) {
    console.error('Error /api/reports/kpis', err);
    res.status(500).json({ error: 'Error al obtener KPIs' });
  }
});

// =============================
// Activos por colaborador actual
// =============================
// Usa activos.colaborador_actual (nombre que ya guardas) y estado
router.get('/assets-by-collaborator', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        COALESCE(colaborador_actual, 'Sin colaborador') AS colaborador,
        SUM(estado='ASIGNADO') AS activos_asignados,
        COUNT(*) AS total
      FROM activos
      GROUP BY colaborador
      HAVING total > 0
      ORDER BY activos_asignados DESC, total DESC, colaborador ASC
      LIMIT 50
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
// Usa activos.proyecto_id + tabla proyectos
router.get('/assets-by-project', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        COALESCE(p.nombre, 'Sin proyecto') AS proyecto,
        COUNT(*) AS total,
        SUM(a.estado='ASIGNADO')   AS activos_asignados,
        SUM(a.estado='DISPONIBLE') AS activos_disponibles,
        SUM(a.estado IN ('BAJA','MANTENCION','OBSOLETO')) AS activos_fuera_servicio
      FROM activos a
      LEFT JOIN proyectos p ON p.id = a.proyecto_id
      GROUP BY proyecto
      ORDER BY total DESC, proyecto ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error('Error /api/reports/assets-by-project', err);
    res.status(500).json({ error: 'Error al obtener activos por proyecto' });
  }
});

// =============================
// Salud de periféricos (stock vs mínimo)
// =============================
// Usa perifericos (stock_actual, stock_minimo, categoria)
router.get('/peripherals-health', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        categoria,
        SUM(stock_actual) AS stock_actual,
        SUM(stock_minimo) AS stock_minimo,
        SUM(GREATEST(stock_minimo - stock_actual, 0)) AS faltante
      FROM perifericos
      GROUP BY categoria
      ORDER BY categoria ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error('Error /api/reports/peripherals-health', err);
    res.status(500).json({ error: 'Error al obtener salud de periféricos' });
  }
});

// =============================
// Exportar CSV: activos
// =============================
router.get('/export/assets.csv', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        categoria,
        nombre,
        marca,
        modelo,
        serial_imei,
        iccid,
        telefono,
        unidades,
        hostname,
        estado,
        ubicacion,
        propietario,
        colaborador_actual,
        proyecto_id,
        fecha_alta,
        fecha_baja,
        fecha_asignacion,
        fecha_creacion,
        fecha_actualizacion
      FROM activos
      ORDER BY id DESC
    `);

    const csv = toCSV(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="activos.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Error export assets.csv', err);
    res.status(500).json({ error: 'Error al exportar activos' });
  }
});

// =============================
// Exportar CSV: periféricos
// =============================
router.get('/export/peripherals.csv', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        categoria,
        nombre,
        marca,
        modelo,
        sku,
        codigo_barra,
        ubicacion,
        stock_actual,
        stock_minimo,
        estado,
        observaciones,
        creado_en
      FROM perifericos
      ORDER BY id DESC
    `);

    const csv = toCSV(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="perifericos.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Error export peripherals.csv', err);
    res.status(500).json({ error: 'Error al exportar periféricos' });
  }
});

// =============================
// Exportar CSV: movimientos
// =============================
router.get('/export/movements.csv', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        m.id,
        m.asset_id,
        a.nombre AS activo_nombre,
        a.serial_imei,
        m.tipo,
        m.fecha_hora,
        m.usuario_responsable,
        m.asignado_a,
        m.ubicacion,
        m.condicion_salida,
        m.condicion_entrada,
        m.notas
      FROM movimientos m
      JOIN activos a ON a.id = m.asset_id
      ORDER BY m.fecha_hora DESC, m.id DESC
    `);

    const csv = toCSV(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="movimientos.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Error export movements.csv', err);
    res.status(500).json({ error: 'Error al exportar movimientos' });
  }
});

export default router;
