'use strict';
const express   = require('express');
const cors      = require('cors');
const Database  = require('better-sqlite3');
const path      = require('path');

const PORT    = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'prices.db');

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS prices (
    station_uuid TEXT NOT NULL,
    ts           TEXT NOT NULL,
    e5           REAL,
    e10          REAL,
    diesel       REAL,
    PRIMARY KEY (station_uuid, ts)
  );
  CREATE INDEX IF NOT EXISTS idx_station ON prices(station_uuid);
`);

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO prices (station_uuid, ts, e5, e10, diesel)
  VALUES (@uuid, @ts, @e5, @e10, @diesel)
`);
const insertMany = db.transaction(stations => {
  const ts = new Date().toISOString();
  for (const s of stations) {
    insertStmt.run({ uuid: s.id, ts, e5: s.e5 > 0.5 ? s.e5 : null, e10: s.e10 > 0.5 ? s.e10 : null, diesel: s.diesel > 0.5 ? s.diesel : null });
  }
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/record', (req, res) => {
  const stations = req.body?.stations;
  if (!Array.isArray(stations) || !stations.length) return res.json({ ok: false });
  try { insertMany(stations); res.json({ ok: true, recorded: stations.length }); }
  catch (err) { res.status(500).json({ ok: false, message: err.message }); }
});

app.get('/history/:id', (req, res) => {
  const { id } = req.params;
  const days   = Math.min(7, Math.max(1, parseInt(req.query.days) || 2));
  const fuel   = ['e5','e10','diesel'].includes(req.query.fuel) ? req.query.fuel : 'e5';
  const since  = new Date();
  since.setDate(since.getDate() - days);
  const rows = db.prepare(`SELECT ts AS date, ${fuel} AS price FROM prices WHERE station_uuid=? AND ts>=? AND ${fuel} IS NOT NULL ORDER BY ts ASC`).all(id, since.toISOString());
  res.json({ ok: true, id, fuel, days, data: rows });
});

app.get('/status', (req, res) => {
  const count    = db.prepare('SELECT COUNT(*) AS n FROM prices').get().n;
  const stations = db.prepare('SELECT COUNT(DISTINCT station_uuid) AS n FROM prices').get().n;
  res.json({ ok: true, total_records: count, total_stations: stations });
});

app.listen(PORT, () => {
  console.log(`\n[server] Laeuft auf http://localhost:${PORT}\n`);
});
