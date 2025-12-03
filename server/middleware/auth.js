export function verifyAuth(req, res, next){
    if (req.session?.user) return next();
    return res.status(401).json({ error: 'No Autenticado'});
}

export function requireRole(...roles){
    return (req, res, next) => {
        const role = req.session?.user?.role;
        if (roles.includes(role)) return next();
        return res.status(403).json({ error: 'Sin Permisos.'});
    };
}