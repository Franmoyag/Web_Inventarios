import { Router } from 'express';
import { pool } from '../db.js';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { requireFields } from '../middleware/validate.js';


const router = Router();


// Lee y loguea los valores para verificar env
const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15000);
const maxReq = Number(process.env.RATE_LIMIT_MAX ?? 3);
console.log(`[AUTH] Rate limit login => windowMs=${windowMs}ms, max=${maxReq}`);


const loginLimiter = rateLimit({
  windowMs,
  max: maxReq,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip, // por IP
  message: { error: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' },
  handler: (req, res /*, next, options*/) => {
    // respuesta 429 explícita
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15s e inténtalo de nuevo.' });
  },
})



router.post('/login', loginLimiter, requireFields('email','password'), async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.query(
    'SELECT id, nombre, email, role, activo, password FROM usuarios WHERE email=? LIMIT 1',
    [email]
  );
  if (!rows.length) return res.status(401).json({ error: 'Credenciales inválidas' });

  const u = rows[0];
  if (!u.activo) return res.status(403).json({ error: 'Usuario inactivo' });

  const ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  req.session.user = { id: u.id, nombre: u.nombre, email: u.email, role: u.role };
  res.json({ ok: true, user: req.session.user });
});



router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});



router.get('/me', (req, res) => {
  res.json({ user: req.session?.user || null });
});

export default router;

