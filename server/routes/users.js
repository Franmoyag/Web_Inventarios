import { Router } from "express";
import { pool } from '../db.js';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';


const router = Router();


/**
 * GET /api/users  (ADMIN)
 * Lista usuarios
 */

router.get('/', verifyAuth, requireRole('ADMIN'), async (req, res) => {
    const [rows] = await pool.query(
        'SELECT id, nombre, email, role, activo, creado_en FROM usuarios ORDER BY id DESC'
    );
    res.json({ data: rows });
});


/**
 * POST /api/users  (ADMIN)
 * Crea usuario: { nombre, email, password, role }
 */

router.post('/', verifyAuth, requireRole('ADMIN'), async (req, res) => {
    const { nombre, email, password, role } = req.body || {};
    if (!nombre || !email || !password || !role) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        const [r] = await pool.query(
            'INSERT INTO usuarios (nombre, email, password, role) VALUES (?,?,?,?)',
            [nombre, email, hash, role]
        );
        res.status(201).json({ ok: true, id: r.insertId });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email ya existe' });
        throw e;
    }
});


/**
 * PUT /api/users/:id  (ADMIN)
 * Actualiza role/activo y opcionalmente password
 */

router.put('/:id', verifyAuth, requireRole('ADMIN'), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { role, activo, password } = req.body || {};
    const set = [];
    const args = [];
    if (role) { set.push('role=?'); args.push(role); }
    if (typeof activo !== 'undefined') { set.push('activo=?'); args.push(!!activo ? 1 : 0); }
    if (password) {
        const hash = await bcrypt.hash(password, 10);
        set.push('password=?'); args.push(hash);
    }
    if (!set.length) return res.status(400).json({ error: 'Nada para actualizar' });
    args.push(id);
    await pool.query(`UPDATE usuarios SET ${set.join(', ')} WHERE id=?`, args);
    res.json({ ok: true });
});



export default router;