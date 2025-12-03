import collaboratorsRoutes from './routes/collaborators.js';

import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import assetRouter from './routes/assets.js';
import authRoutes from './routes/auth.js';
import movementsRoutes from './routes/movements.js';
import peripheralsRoutes from './routes/peripherals.js';
import reportsRoutes from './routes/reports.js';
import usersRoutes from './routes/users.js';
import actasRoutes from './routes/actas.js';

import fs from 'fs';

import { trimBodyStrings } from './middleware/validate.js';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
    crossOriginResourcePolicy: {policy: "cross-origin"}
}));

// CORS (cuando se use otro host, cambiar ALLOWED_ORIGIN)
const allowed = process.env.ALLOWED_ORIGIN || 'http://localhost:3000'
app.use(cors({
    origin: allowed,
    credentials: true
}));

app.use(express.json());
app.use(trimBodyStrings);


//SESIONES (cookie httpOnly)
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 } // 8h
}));


// Servir el frontend (carpeta web)
app.use('/', express.static(path.join(__dirname, '../web')));


// Rate Limiters (Rutas sensibles)
const loginLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOWS_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '10', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muchos intenos, espera un momento.' }
});


//Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRouter);
app.use('/api/movements', movementsRoutes);
app.use('/api/peripherals', peripheralsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/collaborators', collaboratorsRoutes);
app.use('/api/actas', actasRoutes);

app.use(express.static(path.join(__dirname, '../web')));

app.use('/storage', express.static(path.join(__dirname, 'storage')));

//Endponit de Prueba
app.get('/api/health', (req, res) => res.json({ ok: true }));


app.listen(PORT, () => {
    console.log(`Servidor listo en http://localhost:${PORT}`)
})