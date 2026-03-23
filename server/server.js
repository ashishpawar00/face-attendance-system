require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./database');
const authMiddleware = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ─────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static Files ───────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Public Routes (no auth) ────────────────
app.use('/api/auth', require('./routes/auth'));

// ── Health Check ───────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Protected API Routes ───────────────────
app.use('/api/students', authMiddleware, require('./routes/students'));
app.use('/api/attendance', authMiddleware, require('./routes/attendance'));

// ── Serve SPA ──────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Error Handler ──────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ──────────────────────────────────
async function start() {
  await connectDB();

  // Auto-create default admin if none exists
  const Admin = require('./models/Admin');
  const count = await Admin.countDocuments();
  if (count === 0) {
    await Admin.create({ username: 'admin', password: 'admin123' });
    console.log('📋 Default admin created: admin / admin123');
  }

  app.listen(PORT, () => {
    console.log(`\n🎓 FaceAttend server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}\n`);
  });
}

start();
