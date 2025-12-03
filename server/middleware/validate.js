export function trimBodyStrings(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const [k, v] of Object.entries(req.body)) {
      if (typeof v === 'string') {
        // trim + quitar control chars + evitar HTML simple
        req.body[k] = v.trim().replace(/[\u0000-\u001F\u007F]/g, '').replace(/<\/?[^>]+(>|$)/g, '');
      }
    }
  }
  next();
}

export function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => !(f in req.body) || req.body[f] === '' || req.body[f] == null);
    if (missing.length) return res.status(400).json({ error: 'Faltan campos: ' + missing.join(', ') });
    next();
  };
}
