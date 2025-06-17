const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseSchema {
  constructor() {
    this.dbPath = process.env.DB_PATH || './data/gmodpolska.db';
  }

  async createTables() {
    return new Promise((resolve, reject) => {
      // Ensure data directory exists
      const fs = require('fs');
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('📦 Connected to SQLite database');
      });

      // Execute schema creation
      db.serialize(() => {
        // Servers table
        db.run(`
          CREATE TABLE IF NOT EXISTS servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            port INTEGER NOT NULL,
            name TEXT,
            map TEXT,
            description TEXT,
            tags TEXT,
            max_players INTEGER,
            password_protected BOOLEAN DEFAULT 0,
            secure BOOLEAN DEFAULT 0,
            version TEXT,
            os TEXT,
            game_id INTEGER,
            first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT 1,
            country TEXT,
            region TEXT,
            UNIQUE(ip, port)
          )
        `);

        // Players table
        db.run(`
          CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            steam_id TEXT UNIQUE NOT NULL,
            username TEXT,
            profile_url TEXT,
            country TEXT,
            creation_date DATETIME,
            avatar_url TEXT,
            first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Detailed session tracking
        db.run(`
          CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER,
            server_id INTEGER,
            join_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            leave_time DATETIME,
            duration_seconds INTEGER,
            map_on_join TEXT,
            map_on_leave TEXT,
            events_count INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            FOREIGN KEY (player_id) REFERENCES players (id),
            FOREIGN KEY (server_id) REFERENCES servers (id)
          )
        `);

        // Session events (detailed tracking)
        db.run(`
          CREATE TABLE IF NOT EXISTS session_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            event_type TEXT, -- 'map_change', 'disconnect', 'reconnect', 'timeout'
            event_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            old_value TEXT,
            new_value TEXT,
            additional_data TEXT, -- JSON for extra data
            FOREIGN KEY (session_id) REFERENCES sessions (id)
          )
        `);

        // 5-minute server snapshots
        db.run(`
          CREATE TABLE IF NOT EXISTS server_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id INTEGER,
            snapshot_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            player_count INTEGER,
            max_players INTEGER,
            map TEXT,
            gamemode TEXT,
            gamemode_confidence REAL DEFAULT 0.0,
            is_polish_server BOOLEAN,
            polish_confidence REAL DEFAULT 0.0,
            ping_ms INTEGER,
            FOREIGN KEY (server_id) REFERENCES servers (id)
          )
        `);

        console.log('✅ Created core tables');
        resolve(db);
      });
    });
  }
}

module.exports = DatabaseSchema;