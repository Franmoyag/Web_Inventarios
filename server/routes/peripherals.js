import { Router } from "express";
import { pool } from "../db.js";
import { verifyAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// Listar periféricos
router.get("/", verifyAuth, async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : "%";
  const [rows] = await pool.query(
    `SELECT * FROM perifericos WHERE nombre LIKE ? OR marca LIKE ? OR modelo LIKE ? ORDER BY id DESC`,
    [q, q, q]
  );
  res.json({ data: rows });
});

// Crear periférico
router.post("/", verifyAuth, requireRole("ADMIN"), async (req, res) => {
  const {
    categoria,
    nombre,
    marca,
    modelo,
    sku,
    codigo_barra,
    ubicacion,
    stock_minimo,
    observaciones,
  } = req.body;

  if (!categoria || !nombre)
    return res.status(400).json({ error: "Faltan datos obligatorios" });

  const [result] = await pool.query(
    `INSERT INTO perifericos (categoria, nombre, marca, modelo, sku, codigo_barra, ubicacion, stock_minimo, observaciones)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      categoria,
      nombre,
      marca,
      modelo,
      sku,
      codigo_barra,
      ubicacion,
      stock_minimo,
      observaciones,
    ]
  );

  res.json({ ok: true, id: result.insertId });
});

// Registrar movimiento de stock (kardex)
router.post("/moves", verifyAuth, requireRole("ADMIN", "STATUS"), async (req, res) => {
  const { periferico_id, tipo, cantidad, responsable, destino_origen, notas } =
    req.body;

  if (!periferico_id || !tipo || !cantidad)
    return res.status(400).json({ error: "Datos incompletos" });

  await pool.query(
    `INSERT INTO periferico_movimientos (periferico_id, tipo, cantidad, responsable, destino_origen, notas)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [periferico_id, tipo, cantidad, responsable, destino_origen, notas]
  );

  res.json({ ok: true });
});

export default router;
