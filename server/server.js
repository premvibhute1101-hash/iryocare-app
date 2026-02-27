require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDb = require('./config/db');

const authRoutes = require('./routes/auth');
const medicationRoutes = require('./routes/medications');
const doseRoutes = require('./routes/doses');
const notifyRoutes = require('./routes/notify');

const app = express();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map(v => v.trim()) : true
}));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/doses', doseRoutes);
app.use('/api/notify', notifyRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

const port = process.env.PORT || 4000;
connectDb()
  .then(() => {
    app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
  })
  .catch(err => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
