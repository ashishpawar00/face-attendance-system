const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'faceattend_default_secret_key_2024';

function authMiddleware(req, res, next) {
  // Skip auth for login route
  if (req.path === '/api/auth/login') return next();

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Also check cookie
  const cookieToken = req.headers.cookie?.split(';')
    .find(c => c.trim().startsWith('token='))
    ?.split('=')[1];

  const finalToken = token || cookieToken;

  if (!finalToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(finalToken, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
