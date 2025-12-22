// server/routes/actas.js
import { Router } from "express";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { verifyAuth, requireRole } from "../middleware/auth.js";
import { pool } from "../db.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatearFechaDDMMYYYY(fechaISO) {
  if (!fechaISO) return "";
  const [anio, mes, dia] = fechaISO.split("-");
  if (!anio || !mes || !dia) return fechaISO;
  return `${dia}-${mes}-${anio}`;
}

function formatearFechaDDMMYYYY_sinGuiones(fechaISO) {
  if (!fechaISO) return "";
  const [anio, mes, dia] = fechaISO.split("-");
  if (!anio || !mes || !dia) return "";
  return `${dia}${mes}${anio}`; // DDMMYYYY
}

function rutSinDV(rut) {
  if (!rut) return "";

  const limpio = rut
    .toString()
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\s/g, "");
  // Si viene con guion: 12.345.678-9 / 12345678-K
  if (limpio.includes("-")) {
    const [num] = limpio.split("-");
    return (num || "").replace(/\D/g, "");
  }

  // Si viene sin guion: 123456789 o 12345678K -> quitar último caracter (DV)
  const solo = limpio.replace(/[^0-9K]/g, "");
  if (solo.length <= 1) return "";
  return solo.slice(0, -1).replace(/\D/g, "");
}

function generarNombreUnico(outputDir, base) {
  // base: ej "15770961_22122025"
  let candidato = base;
  let i = 0;

  while (
    fs.existsSync(path.join(outputDir, `${candidato}.pdf`)) ||
    fs.existsSync(path.join(outputDir, `${candidato}.docx`))
  ) {
    i += 1;
    candidato = `${base}(${i})`;
  }

  return candidato;
}

// Archivo base...
const TEMPLATE_NAME = "ACTA_ENTREGA_TEMPLATE.docx";

// Carpeta donde se guardarán los PDFs generados
const PDF_OUTPUT_DIR = path.join(__dirname, "..", "storage", "actas_pdf");

// Crear carpeta si no existe
if (!fs.existsSync(PDF_OUTPUT_DIR)) {
  fs.mkdirSync(PDF_OUTPUT_DIR, { recursive: true });
}

// Ruta de LibreOffice en Windows
// Puedes definir LIBREOFFICE_PATH como variable de entorno si quieres cambiarla después.
const sofficePath =
  process.env.LIBREOFFICE_PATH ||
  `"C:\\Program Files\\LibreOffice\\program\\soffice.exe"`;

// Función para convertir DOCX -> PDF usando LibreOffice
function convertDocxToPdf(docxPath, outputDir) {
  return new Promise((resolve, reject) => {
    const cmd = `${sofficePath} --headless --convert-to pdf "${docxPath}" --outdir "${outputDir}"`;

    console.log("🖨 Ejecutando conversión a PDF:", cmd);

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Error en conversión a PDF:", error, stderr);
        return reject(new Error(stderr || stdout || error.message));
      }
      console.log("✅ Conversión a PDF OK:", stdout);
      resolve();
    });
  });
}

/**
 * POST /api/actas/entrega
 * Genera el DOCX, lo convierte a PDF, guarda el PDF en disco
 * y registra el acta en la tabla actas_entrega.
 *
 * NO devuelve el archivo, devuelve solo JSON con el id del acta.
 */
router.post("/entrega", verifyAuth, async (req, res) => {
  console.log("===== 📝 [POST] /api/actas/entrega =====");
  const { colaborador, equipos, extras } = req.body || {};

  try {
    // Validaciones básicas
    if (!colaborador || !equipos || !equipos.length) {
      console.error("❌ Falta colaborador o equipos");
      return res.status(400).json({
        ok: false,
        error: "Faltan datos: colaborador o equipos.",
      });
    }

    // Ruta de la plantilla Word
    const templatePath = path.join(__dirname, "..", "templates", TEMPLATE_NAME);
    console.log("📄 Usando plantilla Word:", templatePath);

    if (!fs.existsSync(templatePath)) {
      console.error("❌ No se encontró la plantilla Word en:", templatePath);
      return res.status(500).json({
        ok: false,
        error: "Plantilla de acta no encontrada.",
      });
    }

    // Leer la plantilla
    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);

    // Docxtemplater (por defecto usa {{ }})
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Si tu plantilla usa [[ ]], descomenta esto y comenta la línea de arriba:
      delimiters: { start: "[[", end: "]]" },
    });

    // Datos que se inyectarán en la plantilla
    const observacionEntregaRaw = (extras?.observaciones_generales ?? "")
      .toString()
      .trim();
    const tipoProducto = (extras?.tipo_producto || "NUEVO")
      .toString()
      .trim()
      .toUpperCase();
    const estadoDefault = tipoProducto === "REACONDICIONADO" ? "REAC" : "NUEVO";

    const data = {
      nombre_trabajador: colaborador.nombre,
      fecha: formatearFechaDDMMYYYY(extras?.fecha),
      cargo: colaborador.cargo || colaborador.cargo_nombre || "",
      area: colaborador.area || colaborador.proyecto_nombre || "",
      rut: colaborador.rut,
      centro_costo: extras?.centro_costo || "",
      descripcion_entrega:
        extras?.descripcion_entrega ||
        "Entrega de equipamiento tecnológico para el desarrollo de sus funciones laborales.",
      observacion_entrega: observacionEntregaRaw || "Ninguna",
      equipos: (equipos || []).map((e) => ({
        equipo:
          `${e.marca || ""} ${e.modelo || ""}`.trim() || e.nombre || "Equipo",
        telefono: e.telefono || "",
        estado_equipo: e.estado_entrega || e.estado_equipo || "NUEVO",
        serie: e.serial_imei || "",
        fecha_entrega: formatearFechaDDMMYYYY(extras?.fecha),
      })),
    };

    console.log("🧩 Datos enviados a la plantilla:");
    console.log(JSON.stringify(data, null, 2));

    // Rellenar la plantilla
    doc.render(data);

    const buf = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    // Guardar DOCX temporal en la carpeta de PDFs
    const rutBase = rutSinDV(colaborador.rut);
    const fechaBase =
      formatearFechaDDMMYYYY_sinGuiones(extras?.fecha) ||
      formatearFechaDDMMYYYY_sinGuiones(new Date().toISOString().slice(0, 10));

    // Si por algún motivo no viene rut/fecha, caemos a algo seguro:
    const base = `${rutBase || colaborador.id}_${fechaBase || Date.now()}`;

    // ✅ Genera nombre único si ya existe
    const baseName = generarNombreUnico(PDF_OUTPUT_DIR, base);

    const tmpDocxPath = path.join(PDF_OUTPUT_DIR, `${baseName}.docx`);
    fs.writeFileSync(tmpDocxPath, buf);
    console.log("💾 DOCX temporal guardado en:", tmpDocxPath);

    // Convertir a PDF con LibreOffice
    await convertDocxToPdf(tmpDocxPath, PDF_OUTPUT_DIR);

    const pdfPath = path.join(PDF_OUTPUT_DIR, `${baseName}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      console.error("❌ No se encontró el PDF generado:", pdfPath);
      return res.status(500).json({
        ok: false,
        error: "No se pudo generar el PDF.",
      });
    }

    console.log("💾 PDF generado en:", pdfPath);

    // Eliminar DOCX temporal (opcional)
    try {
      fs.unlinkSync(tmpDocxPath);
    } catch (e) {
      console.warn("⚠ No se pudo eliminar el DOCX temporal:", e.message);
    }

    // Guardar registro de la acta en BD
    const relativePdfPath = path.relative(path.join(__dirname, ".."), pdfPath); // ej: "storage/actas_pdf/ACTA_1_1732812333.pdf"

    const fechaActa = extras?.fecha || new Date().toISOString().slice(0, 10);

    const [result] = await pool.query(
      `
      INSERT INTO actas_entrega 
        (colaborador_id, fecha_acta, ruta_pdf, descripcion_entrega, centro_costo, creado_por)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        colaborador.id,
        fechaActa,
        relativePdfPath,
        data.descripcion_entrega,
        data.centro_costo,
        req.user?.id || null, // si tu auth guarda el id del usuario
      ]
    );

    const actaId = result.insertId;
    console.log("✅ Acta registrada en BD con id:", actaId);

    // Respondemos SOLO JSON (no mandamos el archivo)
    return res.json({
      ok: true,
      actaId,
      pdfPath: relativePdfPath,
    });
  } catch (err) {
    console.error("🔥 Error al generar y guardar acta:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al generar y guardar la acta.",
      detail: err.message,
    });
  }
});

/**
 * GET /api/actas/:id/pdf
 * Devuelve el PDF para verlo / descargar / imprimir.
 */
router.get("/:id/pdf", verifyAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);

  try {
    const [rows] = await pool.query(
      "SELECT ruta_pdf FROM actas_entrega WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "Acta no encontrada" });
    }

    const rutaPdf = rows[0].ruta_pdf;
    const absPdfPath = path.join(__dirname, "..", rutaPdf);

    if (!fs.existsSync(absPdfPath)) {
      return res.status(404).json({
        ok: false,
        error: "Archivo PDF no encontrado en el servidor",
      });
    }

    // Descargar el PDF (o abrirlo en navegador)
    return res.download(absPdfPath, path.basename(absPdfPath));
    // Si prefieres que se abra en el navegador:
    // return res.sendFile(absPdfPath);
  } catch (err) {
    console.error("🔥 Error al servir PDF:", err);
    return res.status(500).json({
      ok: false,
      error: "Error al obtener el PDF.",
    });
  }
});

// ========================================================
//  HISTORIAL DE ACTAS DE ENTREGA
//  GET /api/actas/historial
// ========================================================
router.get(
  "/historial",
  verifyAuth,
  requireRole("ADMIN", "REPORT"),
  async (_req, res) => {
    try {
      const [rows] = await pool.query(`
      SELECT
        a.id,
        a.colaborador_id,
        a.fecha_acta,
        a.ruta_pdf,
        a.descripcion_entrega,
        a.centro_costo,
        a.creado_en,
        c.nombre  AS colaborador_nombre,
        c.rut     AS colaborador_rut
      FROM actas_entrega a
      JOIN colaboradores c ON c.id = a.colaborador_id
      ORDER BY a.creado_en DESC, a.id DESC
    `);

      res.json(rows);
    } catch (err) {
      console.error("Error al obtener historial de actas:", err);
      res.status(500).json({ error: "Error al obtener historial de actas" });
    }
  }
);

export default router;
