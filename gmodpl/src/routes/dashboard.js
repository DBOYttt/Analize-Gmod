const express = require('express');
const router = express.Router();
const database = require('../database');

// Dashboard HTML page
router.get('/', async (req, res) => {
  try {
    res.sendFile('dashboard.html', { root: './public' });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Dashboard unavailable' });
  }
});

// Real-time statistics API
router.get('/api/stats', async (req, res) => {
  try {
    const db = await database.getConnection();
    
    // Server statistics using correct callback pattern
    const serverStats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          COUNT(*) as total_servers,
          COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_servers,
          COUNT(CASE WHEN is_active = 0 THEN 1 END) as inactive_servers,
          COUNT(CASE WHEN country = 'PL' OR name LIKE '%pol%' OR name LIKE '%PL%' THEN 1 END) as polish_servers,
          MAX(last_seen) as last_scan
        FROM servers
      `, [], (err, row) => {
        if (err) {
          console.error('❌ Server stats query failed:', err);
          reject(err);
        } else {
          console.log('✅ Server stats retrieved:', row);
          resolve(row);
        }
      });
    });

    // Recent activity using correct callback pattern
    const recentServers = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          ip, 
          port, 
          CASE 
            WHEN name = '[object Object]' OR name IS NULL THEN 'Unknown Server'
            ELSE name 
          END as name,
          map, 
          max_players, 
          last_seen, 
          is_active, 
          country
        FROM servers 
        ORDER BY last_seen DESC 
        LIMIT 10
      `, [], (err, rows) => {
        if (err) {
          console.error('❌ Recent servers query failed:', err);
          reject(err);
        } else {
          console.log('✅ Recent servers retrieved:', rows.length, 'servers');
          resolve(rows);
        }
      });
    });

    // Database table statistics
    const tableStats = await new Promise((resolve, reject) => {
      const stats = {};
      let completed = 0;
      const totalTables = 6;
      
      const tables = [
        'servers', 'players', 'server_snapshots', 
        'sessions', 'polish_server_predictions', 'gamemode_predictions'
      ];
      
      tables.forEach(table => {
        db.get(`SELECT COUNT(*) as count FROM ${table}`, [], (err, row) => {
          if (err) {
            console.error(`❌ Table count failed for ${table}:`, err);
            stats[table] = 0;
          } else {
            stats[table] = row.count;
          }
          
          completed++;
          if (completed === totalTables) {
            console.log('✅ Table stats retrieved:', stats);
            resolve(stats);
          }
        });
      });
    });

    database.closeConnection(db);

    const response = {
      serverStats: serverStats || {},
      recentServers: recentServers || [],
      tableStats: tableStats || {},
      timestamp: new Date().toISOString()
    };

    console.log('📊 Dashboard stats response:', JSON.stringify(response, null, 2));
    res.json(response);

  } catch (error) {
    console.error('❌ Stats API error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Polish servers endpoint
router.get('/api/polish-servers', async (req, res) => {
  try {
    const db = await database.getConnection();
    
    // For now, return all servers since we're building the Polish detection system
    const allServers = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          s.id,
          s.ip,
          s.port,
          CASE 
            WHEN s.name = '[object Object]' OR s.name IS NULL THEN 'Unknown Server'
            ELSE s.name 
          END as name,
          s.map,
          s.max_players,
          s.is_active,
          s.country,
          s.last_seen,
          ps.is_polish_predicted,
          ps.confidence,
          ps.prediction_time,
          ps.prediction_reason
        FROM servers s
        LEFT JOIN polish_server_predictions ps ON s.id = ps.server_id
        ORDER BY s.last_seen DESC
        LIMIT 20
      `, [], (err, rows) => {
        if (err) {
          console.error('❌ Polish servers query failed:', err);
          reject(err);
        } else {
          console.log('✅ Polish servers retrieved:', rows.length, 'servers');
          resolve(rows);
        }
      });
    });

    database.closeConnection(db);
    res.json(allServers);

  } catch (error) {
    console.error('❌ Polish servers API error:', error);
    res.status(500).json({ error: 'Failed to fetch Polish servers' });
  }
});

module.exports = router;