import { Router } from "express";
import { pool } from "../db.js";
import { verifyAuth, requireRole } from "../middleware/auth.js";
import { toCSV } from "../utils/csv.js";


const router = Router();

// KPIs
router.get('/kpis', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  const [[activos]] = await pool.query('SELECT COUNT(*) AS total FROM activos');
  const [[prestados]] = await pool.query("SELECT COUNT(*) AS total FROM activos WHERE estado='ASIGNADO'");
  const [[movMes]] = await pool.query(`
  SELECT COUNT(*) AS total
  FROM movimientos
  WHERE MONTH(fecha_hora)=MONTH(CURDATE()) AND YEAR(fecha_hora)=YEAR(CURDATE())
`);
  res.json({ total_activos: activos.total, prestados: prestados.total, movimientos_mes: movMes.total });
});


// Export: Activos
router.get('/export/assets.csv', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT id, categoria, estado, nombre, marca, modelo, serial_imei, iccid, hostname, unidades,
            especificaciones, ubicacion, propietario, observaciones,
            nb_ssd, nb_ram, nb_mobo, nb_cpu, nb_so, nb_office, nb_antivirus,
            nb_estado_general, nb_obs_tecnica, nb_tipo_falla, colaborador_actual, nb_res,
            parque_proyecto, encargado, usuario_login, fecha_asignacion, fecha_baja, fecha_alta
    FROM activos
    ORDER BY id DESC
  `);
  const csv = toCSV(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="activos.csv"');
  res.send(csv);
});




// Export: Periféricos
router.get('/export/peripherals.csv', verifyAuth, requireRole('ADMIN', 'REPORT'), async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT id, categoria, nombre, marca, modelo, sku, codigo_barra, ubicacion,
          stock_actual, stock_minimo, estado, observaciones, creado_en
    FROM perifericos
    ORDER BY id DESC
  `);
  const csv = toCSV(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="perifericos.csv"');
  res.send(csv);
});



// Export: Movimientos (activos)
router.get('/export/movements.csv', verifyAuth, requireRole('ADMIN','REPORT'), async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT m.id, m.asset_id, a.nombre AS activo_nombre, a.serial_imei, m.tipo, m.fecha_hora,
          m.usuario_responsable, m.asignado_a, m.ubicacion, m.condicion_salida, m.condicion_entrada, m.notas
    FROM movimientos m
    JOIN activos a ON a.id = m.asset_id
    ORDER BY m.fecha_hora DESC, m.id DESC
  `);
  const csv = toCSV(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="movimientos.csv"');
  res.send(csv);
});


export default router;
