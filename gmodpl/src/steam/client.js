const axios = require('axios');
const NodeCache = require('node-cache');

class SteamAPIClient {
  constructor() {
    this.apiKey = process.env.STEAM_API_KEY;
    this.baseUrl = 'https://api.steampowered.com';
    
    // Rate limiting: 200 requests per 5 minutes
    this.rateLimitWindow = 5 * 60 * 1000; // 5 minutes in ms
    this.maxRequestsPerWindow = 200;
    this.requestHistory = [];
    
    // Cache Steam data for 24 hours
    this.cache = new NodeCache({ stdTTL: 24 * 60 * 60 });
    
    // Retry configuration
    this.maxRetries = 3;
    this.retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
    
    this.validateApiKey();
  }

  validateApiKey() {
    if (!this.apiKey) {
      console.error('❌ STEAM_API_KEY environment variable is missing');
      throw new Error('Steam API key is required but not provided');
    }
    console.log('✅ Steam API key loaded');
  }

  async checkRateLimit() {
    const now = Date.now();
    
    // Remove requests older than 5 minutes
    this.requestHistory = this.requestHistory.filter(
      timestamp => now - timestamp < this.rateLimitWindow
    );
    
    if (this.requestHistory.length >= this.maxRequestsPerWindow) {
      const oldestRequest = Math.min(...this.requestHistory);
      const waitTime = this.rateLimitWindow - (now - oldestRequest);
      
      console.log(`⏳ Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Clean up again after waiting
      this.requestHistory = this.requestHistory.filter(
        timestamp => Date.now() - timestamp < this.rateLimitWindow
      );
    }
    
    this.requestHistory.push(now);
  }

  async makeRequest(url, params) {
    await this.checkRateLimit();
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 Steam API request (attempt ${attempt}/${this.maxRetries}): ${url}`);
        
        const response = await axios.get(url, {
          params: {
            key: this.apiKey,
            ...params
          },
          timeout: 10000 // 10 second timeout
        });
        
        console.log(`✅ Steam API request successful (attempt ${attempt})`);
        return response.data;
        
      } catch (error) {
        console.error(`❌ Steam API request failed (attempt ${attempt}/${this.maxRetries}):`, error.message);
        
        if (attempt === this.maxRetries) {
          throw new Error(`Steam API request failed after ${this.maxRetries} attempts: ${error.message}`);
        }
        
        const delay = this.retryDelays[attempt - 1];
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async getPlayerSummaries(steamIds) {
    console.log(`👤 Fetching player summaries for ${steamIds.length} players`);
    
    // Check cache first
    const cachedResults = {};
    const uncachedIds = [];
    
    for (const steamId of steamIds) {
      const cached = this.cache.get(`player_${steamId}`);
      if (cached) {
        cachedResults[steamId] = cached;
        console.log(`💾 Using cached data for Steam ID: ${steamId}`);
      } else {
        uncachedIds.push(steamId);
      }
    }
    
    if (uncachedIds.length === 0) {
      console.log('✅ All player data retrieved from cache');
      return Object.values(cachedResults);
    }
    
    // Steam API allows up to 100 Steam IDs per request
    const batches = [];
    for (let i = 0; i < uncachedIds.length; i += 100) {
      batches.push(uncachedIds.slice(i, i + 100));
    }
    
    const allPlayers = [];
    
    for (const batch of batches) {
      try {
        const url = `${this.baseUrl}/ISteamUser/GetPlayerSummaries/v0002/`;
        const params = {
          steamids: batch.join(',')
        };
        
        const data = await this.makeRequest(url, params);
        
        if (data.response && data.response.players) {
          for (const player of data.response.players) {
            // Cache the player data
            this.cache.set(`player_${player.steamid}`, player);
            allPlayers.push(player);
            console.log(`✅ Fetched and cached player: ${player.personaname} (${player.steamid})`);
          }
        }
      } catch (error) {
        console.error(`❌ Failed to fetch batch of ${batch.length} players:`, error.message);
        throw error;
      }
    }
    
    // Combine cached and newly fetched results
    const combinedResults = [...Object.values(cachedResults), ...allPlayers];
    console.log(`✅ Retrieved ${combinedResults.length} total player summaries`);
    
    return combinedResults;
  }

  async getOwnedGames(steamId) {
    console.log(`🎮 Fetching owned games for Steam ID: ${steamId}`);
    
    // Check cache first
    const cacheKey = `games_${steamId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`💾 Using cached games data for Steam ID: ${steamId}`);
      return cached;
    }
    
    try {
      const url = `${this.baseUrl}/IPlayerService/GetOwnedGames/v0001/`;
      const params = {
        steamid: steamId,
        format: 'json',
        include_appinfo: true,
        include_played_free_games: true
      };
      
      const data = await this.makeRequest(url, params);
      
      if (data.response) {
        // Cache the games data
        this.cache.set(cacheKey, data.response);
        console.log(`✅ Fetched and cached ${data.response.game_count || 0} games for Steam ID: ${steamId}`);
        return data.response;
      } else {
        console.log(`⚠️ No games data available for Steam ID: ${steamId} (private profile)`);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ Failed to fetch games for Steam ID ${steamId}:`, error.message);
      throw error;
    }
  }

  async getPlayerData(steamId) {
    console.log(`🔍 Getting complete player data for Steam ID: ${steamId}`);
    
    try {
      const [playerSummaries, ownedGames] = await Promise.all([
        this.getPlayerSummaries([steamId]),
        this.getOwnedGames(steamId)
      ]);
      
      const playerSummary = playerSummaries[0];
      if (!playerSummary) {
        throw new Error(`No player summary found for Steam ID: ${steamId}`);
      }
      
      // Extract relevant data as specified in requirements
      const playerData = {
        steam_id: playerSummary.steamid,
        username: playerSummary.personaname,
        profile_url: playerSummary.profileurl,
        country: playerSummary.loccountrycode || null,
        creation_date: playerSummary.timecreated ? new Date(playerSummary.timecreated * 1000).toISOString() : null,
        avatar_url: playerSummary.avatarfull || playerSummary.avatarmedium || playerSummary.avatar,
        owns_gmod: false,
        total_games: 0
      };
      
      // Check if player owns Garry's Mod (App ID: 4000)
      if (ownedGames && ownedGames.games) {
        playerData.total_games = ownedGames.game_count || 0;
        playerData.owns_gmod = ownedGames.games.some(game => game.appid === 4000);
      }
      
      console.log(`✅ Complete player data retrieved for: ${playerData.username}`);
      return playerData;
      
    } catch (error) {
      console.error(`❌ Failed to get complete player data for Steam ID ${steamId}:`, error.message);
      throw error;
    }
  }

  getCacheStats() {
    const stats = this.cache.getStats();
    console.log('📊 Steam API Cache Stats:', {
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hits / (stats.hits + stats.misses) * 100
    });
    return stats;
  }
}

module.exports = SteamAPIClient;