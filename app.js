require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const routes = require('./routes/index');
// const scheduler = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;
const cronRoutes = require("./routes/cron");
// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', routes);

app.use("/cron", cronRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send('Something went wrong!');
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║  Auto Content Publisher - MVP                         ║
║  Server running on http://localhost:${PORT}              ║
╚═══════════════════════════════════════════════════════╝
  `);
  
  // Start cron scheduler
  // scheduler.startScheduler();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});