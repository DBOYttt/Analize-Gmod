const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const DatabaseSchema = require('./schema');
const MLDatabaseSchema = require('./ml-schema');

class DatabaseConnection {
  constructor() {
    this.dbPath = process.env.DB_PATH || './data/gmodpolska.db';
    this.maxConnections = 10;
    this.connectionTimeout = 30000; // 30 seconds
    this.pool = [];
    this.activeConnections = 0;
    this.retryAttempts = 3;
    this.retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
  }

  async initialize() {
    console.log('🔄 Initializing database connection...');
    
    try {
      // Ensure data directory exists
      await this.ensureDataDirectory();
      
      // Create initial connection to test
      await this.createConnection();
      
      // Run migrations
      await this.runMigrations();
      
      console.log('✅ Database initialized successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      console.error('🚨 Application will exit due to database failure');
      process.exit(1);
    }
  }

  async ensureDataDirectory() {
    const dir = path.dirname(this.dbPath);
    console.log(`📁 Ensuring data directory exists: ${dir}`);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log('✅ Created data directory');
    }

    // Create .gitignore for data directory
    const gitignorePath = path.join(dir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, '# Ignore all database files\n*.db\n*.db-journal\n*.db-wal\n*.db-shm\n');
      console.log('✅ Created .gitignore for data directory');
    }
  }

  async createConnection() {
    return new Promise((resolve, reject) => {
      if (this.activeConnections >= this.maxConnections) {
        reject(new Error('Maximum connections reached'));
        return;
      }

      console.log(`🔌 Creating database connection (${this.activeConnections + 1}/${this.maxConnections})`);
      
      const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          console.error('❌ Failed to create database connection:', err);
          reject(err);
          return;
        }
        
        this.activeConnections++;
        console.log(`✅ Database connection created successfully (Active: ${this.activeConnections})`);
        
        // Configure connection
        db.configure('busyTimeout', this.connectionTimeout);
        db.run('PRAGMA foreign_keys = ON', (err) => {
          if (err) {
            console.error('⚠️ Failed to enable foreign keys:', err);
          } else {
            console.log('✅ Foreign keys enabled');
          }
        });
        
        resolve(db);
      });
    });
  }

  async runMigrations() {
    console.log('🔄 Starting database migrations...');
    
    const db = await this.createConnection();
    
    try {
      // Create main schema tables
      console.log('📋 Creating main schema tables...');
      const schema = new DatabaseSchema();
      await schema.createTables();
      console.log('✅ Main schema tables created');
      
      // Create ML schema tables
      console.log('🤖 Creating ML schema tables...');
      await MLDatabaseSchema.createMLTables(db);
      console.log('✅ ML schema tables created');
      
      // Create indexes for performance
      await this.createIndexes(db);
      
      console.log('✅ Database migrations completed successfully');
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    } finally {
      db.close((err) => {
        if (err) {
          console.error('⚠️ Error closing migration connection:', err);
        } else {
          this.activeConnections--;
          console.log('✅ Migration connection closed');
        }
      });
    }
  }

  async createIndexes(db) {
    console.log('📊 Creating database indexes...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_servers_ip_port ON servers(ip, port)',
      'CREATE INDEX IF NOT EXISTS idx_servers_last_seen ON servers(last_seen)',
      'CREATE INDEX IF NOT EXISTS idx_players_steam_id ON players(steam_id)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_player_server ON sessions(player_id, server_id)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_join_time ON sessions(join_time)',
      'CREATE INDEX IF NOT EXISTS idx_snapshots_server_time ON server_snapshots(server_id, snapshot_time)',
      'CREATE INDEX IF NOT EXISTS idx_gamemode_predictions_server ON gamemode_predictions(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_polish_predictions_server ON polish_server_predictions(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_polish_predictions_review ON polish_server_predictions(needs_review)'
    ];

    for (const indexSQL of indexes) {
      await this.executeWithRetry(db, indexSQL);
    }
    
    console.log('✅ Database indexes created');
  }

  async executeWithRetry(db, sql, params = []) {
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        console.log(`🔄 Executing SQL (attempt ${attempt}/${this.retryAttempts}): ${sql.substring(0, 50)}...`);
        
        const result = await new Promise((resolve, reject) => {
          db.run(sql, params, function(err) {
            if (err) {
              reject(err);
            } else {
              resolve(this);
            }
          });
        });
        
        console.log(`✅ SQL executed successfully (attempt ${attempt})`);
        return result;
        
      } catch (error) {
        console.error(`❌ SQL execution failed (attempt ${attempt}/${this.retryAttempts}):`, error);
        
        if (attempt === this.retryAttempts) {
          throw error;
        }
        
        const delay = this.retryDelays[attempt - 1];
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async getConnection() {
    return await this.createConnection();
  }

  closeConnection(db) {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('⚠️ Error closing connection:', err);
        } else {
          this.activeConnections--;
          console.log(`✅ Connection closed (Active: ${this.activeConnections})`);
        }
      });
    }
  }
}

module.exports = DatabaseConnection;