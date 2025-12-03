function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}


export function toCSV(rows) {
  if (!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const headLine = headers.map(escapeCSV).join(',');
  const body = rows.map(r => headers.map(h => escapeCSV(r[h])).join(','));
  return [headLine, ...body].join('\n');
}
