export function generarActaPDF(colaborador, activos, extras = {}) {
  // jsPDF expuesto por el script UMD: window.jspdf.jsPDF
  const jsPDF = window.jspdf?.jsPDF || window.jsPDF;

  if (!jsPDF) {
    console.error("jsPDF no encontrado. window.jspdf =", window.jspdf);
    alert("No se pudo cargar jsPDF. Revisa el <script> de jsPDF en acta_entrega.html.");
    return;
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marginX = 15;
  let y = 20;

  const addBlock = (texto, opts = {}) => {
    if (!texto) return;
    const maxWidth = opts.maxWidth || 180;
    const lineHeight = opts.lineHeight || 5.2;
    const lines = doc.splitTextToSize(texto, maxWidth);
    if (y + lines.length * lineHeight > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(lines, marginX, y);
    y += lines.length * lineHeight;
  };

  const addSpace = (h = 4) => {
    y += h;
  };

  // --- TÍTULO ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("ACTA DE ENTREGA DE EQUIPOS", 105, y, { align: "center" });
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  // --- Datos del colaborador ---
  addBlock(`NOMBRE DEL TRABAJADOR: ${colaborador.nombre || ""}`);
  addBlock(`RUT: ${colaborador.rut || ""}`);
  addBlock(`CARGO: ${colaborador.cargo || colaborador.cargo_nombre || ""}`);
  addBlock(
    `ÁREA / PROYECTO: ${colaborador.area || colaborador.proyecto_nombre || ""}`
  );
  addBlock(`CENTRO DE COSTO: ${extras.centro_costo || ""}`);
  addBlock(`FECHA: ${extras.fecha || ""}`);
  addSpace(3);

  // --- Descripción entrega ---
  doc.setFont("helvetica", "bold");
  doc.text("DESCRIPCIÓN DE ENTREGA:", marginX, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  addBlock(
    extras.descripcion_entrega ||
      "Entrega de equipamiento tecnológico para el desarrollo de funciones laborales."
  );
  addSpace(3);

  // --- Detalle de equipos ---
  doc.setFont("helvetica", "bold");
  doc.text("DETALLE DE EQUIPOS ENTREGADOS", marginX, y);
  y += 7;
  doc.setFont("helvetica", "normal");

  if (!activos || !activos.length) {
    addBlock("No se han asociado equipos en esta acta.");
  } else {
    doc.setFontSize(10);
    const colX = {
      equipo: marginX,
      serie: marginX + 70,
      tel: marginX + 120,
    };

    const headerY = y;
    doc.text("Equipo", colX.equipo, headerY);
    doc.text("Serie / IMEI", colX.serie, headerY);
    doc.text("Tel / ICCID", colX.tel, headerY);
    y += 4;
    doc.line(marginX, y, marginX + 180, y);
    y += 3;

    doc.setFontSize(9);

    for (const a of activos) {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }

      const equipo =
        `${a.marca || ""} ${a.modelo || ""}`.trim() || a.nombre || "Equipo";
      const serie = a.serial_imei || "";
      const tel = [
        a.telefono ? `Tel: ${a.telefono}` : "",
        a.iccid ? `SIM: ${a.iccid}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      doc.text(doc.splitTextToSize(equipo, 65), colX.equipo, y);
      doc.text(doc.splitTextToSize(serie, 40), colX.serie, y);
      doc.text(doc.splitTextToSize(tel, 50), colX.tel, y);

      y += 7;
    }
  }

  addSpace(4);

  // --- Observaciones generales ---
  if (extras.observaciones_generales) {
    doc.setFont("helvetica", "bold");
    doc.text("OBSERVACIONES GENERALES:", marginX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    addBlock(extras.observaciones_generales);
    addSpace(3);
  }

  // --- Texto legal resumido (basado en tu acta Word) ---
  addBlock(
    "PRIMERO: El trabajador declara recibir por parte de la Empresa los equipos detallados en la presente acta, " +
      "exclusivamente para facilitar el desarrollo de sus labores. El uso para fines personales o no laborales se encuentra prohibido."
  );

  addBlock(
    "SEGUNDO: El trabajador se obliga a velar por el cuidado y buen mantenimiento de los equipos, evitar su pérdida, robo " +
      "o uso por terceros y dar aviso inmediato a la Empresa en caso de cualquier incidente."
  );

  addBlock(
    "TERCERO: En caso de término de la relación laboral o cuando la Empresa lo solicite, el trabajador deberá devolver " +
      "los equipos en un plazo máximo de 24 horas, en buen estado, salvo el desgaste propio del uso normal."
  );

  addBlock(
    "CUARTO: El trabajador declara conocer y aceptar las condiciones contenidas en el presente documento, " +
      "comprometiéndose al cumplimiento de lo señalado."
  );

  addSpace(14);

  // --- Firmas ---
  // Firma trabajador
  doc.line(40, y, 100, y);
  doc.text(colaborador.nombre || "", 70, y + 5, { align: "center" });
  doc.setFontSize(9);
  doc.text("Firma Trabajador", 70, y + 10, { align: "center" });

  // Firma empresa
  doc.setFontSize(11);
  doc.line(110, y, 170, y);
  doc.text(
    extras.representante_empresa || "Representante de la Empresa",
    140,
    y + 5,
    { align: "center" }
  );
  doc.setFontSize(9);
  doc.text("Firma Empresa", 140, y + 10, { align: "center" });

  // Nombre de archivo
  const nombreLimpio = (colaborador.nombre || "sin_nombre")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_ñÑáéíóúÁÉÍÓÚ-]/g, "");

  doc.save(`Acta_entrega_${nombreLimpio}.pdf`);
}
