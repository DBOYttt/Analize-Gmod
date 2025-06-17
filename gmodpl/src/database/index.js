const DatabaseConnection = require('./connection');

class Database {
  constructor() {
    this.connection = new DatabaseConnection();
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      console.log('✅ Database already initialized');
      return true;
    }

    console.log('🚀 Starting database initialization...');
    
    try {
      await this.connection.initialize();
      this.isInitialized = true;
      console.log('✅ Database system ready');
      return true;
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  async getConnection() {
    if (!this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return await this.connection.getConnection();
  }

  closeConnection(db) {
    this.connection.closeConnection(db);
  }

  async executeWithRetry(sql, params = []) {
    const db = await this.getConnection();
    try {
      return await this.connection.executeWithRetry(db, sql, params);
    } finally {
      this.closeConnection(db);
    }
  }

  // Helper methods for common operations
  async insertServer(serverData) {
    console.log('💾 Inserting server data:', serverData.ip + ':' + serverData.port);
    
    const sql = `
      INSERT OR REPLACE INTO servers 
      (ip, port, name, map, description, tags, max_players, password_protected, secure, version, os, game_id, country, region, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    const params = [
      serverData.ip, serverData.port, serverData.name, serverData.map,
      serverData.description, serverData.tags, serverData.max_players,
      serverData.password_protected, serverData.secure, serverData.version,
      serverData.os, serverData.game_id, serverData.country, serverData.region
    ];
    
    return await this.executeWithRetry(sql, params);
  }

  async insertPlayer(playerData) {
    console.log('👤 Inserting player data:', playerData.steam_id);
    
    const sql = `
      INSERT OR REPLACE INTO players 
      (steam_id, username, profile_url, country, creation_date, avatar_url, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    const params = [
      playerData.steam_id, playerData.username, playerData.profile_url,
      playerData.country, playerData.creation_date, playerData.avatar_url
    ];
    
    return await this.executeWithRetry(sql, params);
  }

  async createSnapshot(snapshotData) {
    console.log('📸 Creating server snapshot for server:', snapshotData.server_id);
    
    const sql = `
      INSERT INTO server_snapshots 
      (server_id, player_count, max_players, map, gamemode, gamemode_confidence, is_polish_server, polish_confidence, ping_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      snapshotData.server_id, snapshotData.player_count, snapshotData.max_players,
      snapshotData.map, snapshotData.gamemode, snapshotData.gamemode_confidence,
      snapshotData.is_polish_server, snapshotData.polish_confidence, snapshotData.ping_ms
    ];
    
    return await this.executeWithRetry(sql, params);
  }

  async getServersNeedingReview() {
    console.log('🔍 Getting servers needing manual review...');
    
    const sql = `
      SELECT s.*, p.confidence, p.prediction_reason 
      FROM servers s 
      JOIN polish_server_predictions p ON s.id = p.server_id 
      WHERE p.needs_review = 1 AND p.manual_feedback IS NULL
      ORDER BY p.confidence DESC
    `;
    
    const db = await this.getConnection();
    try {
      return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
          if (err) {
            console.error('❌ Failed to get servers needing review:', err);
            reject(err);
          } else {
            console.log(`✅ Found ${rows.length} servers needing review`);
            resolve(rows);
          }
        });
      });
    } finally {
      this.closeConnection(db);
    }
  }

  async submitFeedback(serverId, feedback, reason = '') {
    console.log(`📝 Submitting feedback for server ${serverId}: ${feedback}`);
    
    const sql = `
      UPDATE polish_server_predictions 
      SET manual_feedback = ?, feedback_time = CURRENT_TIMESTAMP, feedback_reason = ?
      WHERE server_id = ? AND manual_feedback IS NULL
    `;
    
    return await this.executeWithRetry(sql, [feedback, reason, serverId]);
  }
}

// Export singleton instance
const database = new Database();
module.exports = database;