const sqlite3 = require('sqlite3').verbose();

class MLDatabaseSchema {
  static createMLTables(db) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Gamemode predictions and learning
        db.run(`
          CREATE TABLE IF NOT EXISTS gamemode_predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id INTEGER,
            predicted_gamemode TEXT,
            confidence REAL,
            features_json TEXT, -- JSON: {server_name_keywords, map_patterns, tags, etc}
            prediction_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_correct BOOLEAN, -- NULL until verified
            correction_feedback TEXT, -- manual correction if wrong
            model_version TEXT,
            FOREIGN KEY (server_id) REFERENCES servers (id)
          )
        `);

        // Polish server detection with feedback system
        db.run(`
          CREATE TABLE IF NOT EXISTS polish_server_predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id INTEGER,
            is_polish_predicted BOOLEAN,
            confidence REAL,
            prediction_reason TEXT, -- 'geolocation', 'name_analysis', 'player_analysis', etc
            features_json TEXT, -- JSON: {country, polish_keywords, player_polish_ratio, etc}
            prediction_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            needs_review BOOLEAN DEFAULT 0, -- confidence 30-70% = needs manual review
            manual_feedback TEXT, -- 'accept', 'reject', 'unsure'
            feedback_time DATETIME,
            feedback_reason TEXT, -- why user accepted/rejected
            model_version TEXT,
            FOREIGN KEY (server_id) REFERENCES servers (id)
          )
        `);

        // Manual labels for training
        db.run(`
          CREATE TABLE IF NOT EXISTS manual_labels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id INTEGER,
            label_type TEXT, -- 'gamemode' or 'polish_server'
            label_value TEXT, -- actual gamemode name or 'polish'/'not_polish'
            labeled_by TEXT DEFAULT 'DBOYttt',
            label_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            confidence INTEGER DEFAULT 100, -- how sure are you (1-100)
            notes TEXT,
            FOREIGN KEY (server_id) REFERENCES servers (id)
          )
        `);

        // Model performance tracking
        db.run(`
          CREATE TABLE IF NOT EXISTS model_performance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_type TEXT, -- 'gamemode' or 'polish_server'
            model_version TEXT,
            accuracy REAL,
            precision_score REAL,
            recall_score REAL,
            total_predictions INTEGER,
            correct_predictions INTEGER,
            evaluation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_current_best BOOLEAN DEFAULT 0,
            training_data_size INTEGER
          )
        `);

        // Feature extraction patterns (for learning)
        db.run(`
          CREATE TABLE IF NOT EXISTS learned_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern_type TEXT, -- 'gamemode_keyword', 'polish_name_pattern', 'map_gamemode'
            pattern_value TEXT, -- the actual pattern
            confidence REAL, -- how reliable this pattern is
            usage_count INTEGER DEFAULT 1,
            success_rate REAL DEFAULT 0.0,
            created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        console.log('✅ Created ML learning tables');
        resolve();
      });
    });
  }
}

module.exports = MLDatabaseSchema;