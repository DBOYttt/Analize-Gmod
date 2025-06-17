const SteamAPIClient = require('./client');
const database = require('../database');

class SteamDataService {
  constructor() {
    this.steamClient = new SteamAPIClient();
    this.processingQueue = [];
    this.isProcessing = false;
    this.batchSize = 50;
    this.batchDelay = 2000; // 2 seconds between batches
    this.refreshInterval = 24 * 60 * 60 * 1000; // 24 hours in ms
  }

  async initialize() {
    console.log('🚀 Initializing Steam Data Service...');
    
    try {
      // Ensure database is initialized
      if (!database.isInitialized) {
        await database.initialize();
      }
      
      console.log('✅ Steam Data Service initialized');
      return true;
    } catch (error) {
      console.error('❌ Steam Data Service initialization failed:', error);
      throw error;
    }
  }

  async addToQueue(steamIds, priority = 'normal') {
    console.log(`📥 Adding ${steamIds.length} Steam IDs to processing queue (priority: ${priority})`);
    
    const queueItems = steamIds.map(steamId => ({
      steamId,
      priority,
      addedAt: Date.now(),
      retryCount: 0
    }));
    
    if (priority === 'high') {
      // Add high priority items to the front
      this.processingQueue.unshift(...queueItems);
    } else {
      this.processingQueue.push(...queueItems);
    }
    
    console.log(`📊 Queue size: ${this.processingQueue.length}`);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    console.log('🔄 Starting Steam data processing queue...');
    
    try {
      while (this.processingQueue.length > 0) {
        // Sort queue by priority and recency
        this.processingQueue.sort((a, b) => {
          if (a.priority === 'high' && b.priority !== 'high') return -1;
          if (b.priority === 'high' && a.priority !== 'high') return 1;
          return b.addedAt - a.addedAt; // Recently seen first
        });
        
        // Take a batch from the queue
        const batch = this.processingQueue.splice(0, this.batchSize);
        const steamIds = batch.map(item => item.steamId);
        
        console.log(`🔄 Processing batch of ${steamIds.length} Steam IDs...`);
        
        try {
          await this.processBatch(steamIds);
          console.log(`✅ Successfully processed batch of ${steamIds.length} Steam IDs`);
        } catch (error) {
          console.error(`❌ Failed to process batch:`, error.message);
          
          // Add failed items back to queue for retry
          const failedItems = batch.map(item => ({
            ...item,
            retryCount: item.retryCount + 1
          })).filter(item => item.retryCount < 3); // Max 3 retries
          
          if (failedItems.length > 0) {
            console.log(`🔄 Adding ${failedItems.length} failed items back to queue for retry`);
            this.processingQueue.push(...failedItems);
          }
        }
        
        // Delay between batches to respect rate limits
        if (this.processingQueue.length > 0) {
          console.log(`⏳ Waiting ${this.batchDelay}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, this.batchDelay));
        }
      }
      
      console.log('✅ Queue processing completed');
      
    } catch (error) {
      console.error('❌ Queue processing failed:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async processBatch(steamIds) {
    console.log(`👥 Processing batch of ${steamIds.length} players...`);
    
    try {
      // Get player summaries from Steam API
      const playerSummaries = await this.steamClient.getPlayerSummaries(steamIds);
      
      // Process each player and save to database
      for (const playerSummary of playerSummaries) {
        try {
          await this.processPlayer(playerSummary);
        } catch (error) {
          console.error(`❌ Failed to process player ${playerSummary.steamid}:`, error.message);
          // Continue with other players even if one fails
        }
      }
      
      console.log(`✅ Batch processing completed for ${playerSummaries.length} players`);
      
    } catch (error) {
      console.error('❌ Batch processing failed:', error.message);
      throw error;
    }
  }

  async processPlayer(playerSummary) {
    const steamId = playerSummary.steamid;
    console.log(`👤 Processing player: ${playerSummary.personaname} (${steamId})`);
    
    try {
      // Check if player needs updating
      const shouldUpdate = await this.shouldUpdatePlayer(steamId);
      if (!shouldUpdate) {
        console.log(`⏭️ Skipping player ${steamId} - recently updated`);
        return;
      }
      
      // Get owned games data
      let ownedGames = null;
      try {
        ownedGames = await this.steamClient.getOwnedGames(steamId);
      } catch (error) {
        console.log(`⚠️ Could not fetch games for player ${steamId} (private profile)`);
      }
      
      // Prepare player data
      const playerData = {
        steam_id: steamId,
        username: playerSummary.personaname,
        profile_url: playerSummary.profileurl,
        country: playerSummary.loccountrycode || null,
        creation_date: playerSummary.timecreated ? new Date(playerSummary.timecreated * 1000).toISOString() : null,
        avatar_url: playerSummary.avatarfull || playerSummary.avatarmedium || playerSummary.avatar,
        owns_gmod: false,
        total_games: 0
      };
      
      // Check game ownership
      if (ownedGames && ownedGames.games) {
        playerData.total_games = ownedGames.game_count || 0;
        playerData.owns_gmod = ownedGames.games.some(game => game.appid === 4000);
      }
      
      // Save to database
      await database.insertPlayer(playerData);
      console.log(`✅ Player data saved: ${playerData.username}`);
      
    } catch (error) {
      console.error(`❌ Failed to process player ${steamId}:`, error.message);
      throw error;
    }
  }

  async shouldUpdatePlayer(steamId) {
    try {
      const db = await database.getConnection();
      
      return new Promise((resolve, reject) => {
        const sql = 'SELECT last_updated FROM players WHERE steam_id = ?';
        
        db.get(sql, [steamId], (err, row) => {
          database.closeConnection(db);
          
          if (err) {
            reject(err);
            return;
          }
          
          if (!row) {
            // Player doesn't exist, needs to be added
            resolve(true);
            return;
          }
          
          const lastUpdated = new Date(row.last_updated);
          const now = new Date();
          const timeDiff = now - lastUpdated;
          
          // Update if more than 24 hours old
          const needsUpdate = timeDiff > this.refreshInterval;
          resolve(needsUpdate);
        });
      });
      
    } catch (error) {
      console.error(`❌ Error checking if player ${steamId} needs update:`, error.message);
      throw error;
    }
  }

  async processNewPlayers(steamIds) {
    console.log(`🆕 Processing ${steamIds.length} new players with high priority`);
    await this.addToQueue(steamIds, 'high');
  }

  async refreshOldPlayers() {
    console.log('🔄 Finding players that need data refresh...');
    
    try {
      const db = await database.getConnection();
      
      const sql = `
        SELECT steam_id FROM players 
        WHERE last_updated < datetime('now', '-1 day')
        ORDER BY last_updated ASC
        LIMIT 1000
      `;
      
      const rows = await new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
          database.closeConnection(db);
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      if (rows.length > 0) {
        const steamIds = rows.map(row => row.steam_id);
        console.log(`📅 Found ${steamIds.length} players needing refresh`);
        await this.addToQueue(steamIds, 'normal');
      } else {
        console.log('✅ No players need refresh');
      }
      
    } catch (error) {
      console.error('❌ Failed to refresh old players:', error.message);
      throw error;
    }
  }

  getQueueStats() {
    const stats = {
      queueSize: this.processingQueue.length,
      isProcessing: this.isProcessing,
      highPriorityCount: this.processingQueue.filter(item => item.priority === 'high').length,
      cacheStats: this.steamClient.getCacheStats()
    };
    
    console.log('📊 Steam Service Stats:', stats);
    return stats;
  }
}

module.exports = SteamDataService;