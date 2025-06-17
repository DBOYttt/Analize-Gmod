const dgram = require('dgram');
const axios = require('axios');
const database = require('../database');

class ServerScannerService {
  constructor() {
    // Configurable settings (will be frontend options later)
    this.scanInterval = 10 * 60 * 1000; // 10 minutes default
    this.maxConcurrentQueries = 50;
    this.queryTimeout = 5000; // 5 seconds
    this.polishScanInterval = 5 * 60 * 1000; // 5 minutes for Polish servers
    
    // Server discovery sources
    this.steamMasterServer = 'hl2master.steampowered.com:27011';
    this.gameTrackerAPI = 'https://api.gametracker.com/v1/games/garrysmod/servers';
    
    // Query protocol constants
    this.A2S_INFO = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x54, 0x53, 0x6F, 0x75, 0x72, 0x63, 0x65, 0x20, 0x45, 0x6E, 0x67, 0x69, 0x6E, 0x65, 0x20, 0x51, 0x75, 0x65, 0x72, 0x79, 0x00]);
    this.A2S_PLAYER = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x55, 0xFF, 0xFF, 0xFF, 0xFF]);
    
    // State tracking
    this.isScanning = false;
    this.activeQueries = 0;
    this.discoveredServers = new Set();
    this.polishServers = new Set();
    this.scanStats = {
      totalServers: 0,
      polishServers: 0,
      onlineServers: 0,
      offlineServers: 0,
      lastScan: null
    };
  }

  async initialize() {
    console.log('🚀 Initializing Server Scanner Service...');
    
    try {
      // Ensure database is initialized
      if (!database.isInitialized) {
        await database.initialize();
      }
      
      console.log('✅ Server Scanner Service initialized');
      return true;
    } catch (error) {
      console.error('❌ Server Scanner Service initialization failed:', error);
      throw error;
    }
  }

  async startScanning() {
    if (this.isScanning) {
      console.log('⚠️ Scanner is already running');
      return;
    }
    
    console.log('🔍 Starting server scanning...');
    this.isScanning = true;
    
    // Initial scan
    await this.performFullScan();
    
    // Schedule regular scans
    this.scanIntervalId = setInterval(async () => {
      await this.performFullScan();
    }, this.scanInterval);
    
    // Schedule frequent Polish server scans
    this.polishScanIntervalId = setInterval(async () => {
      await this.scanPolishServers();
    }, this.polishScanInterval);
    
    console.log(`🔄 Scanner started - Full scan every ${this.scanInterval/60000} minutes, Polish servers every ${this.polishScanInterval/60000} minutes`);
  }

  stopScanning() {
    if (!this.isScanning) {
      console.log('⚠️ Scanner is not running');
      return;
    }
    
    console.log('🛑 Stopping server scanning...');
    this.isScanning = false;
    
    if (this.scanIntervalId) {
      clearInterval(this.scanIntervalId);
    }
    if (this.polishScanIntervalId) {
      clearInterval(this.polishScanIntervalId);
    }
    
    console.log('✅ Scanner stopped');
  }

  async performFullScan() {
    console.log('🔍 Starting full server scan...');
    this.scanStats.lastScan = new Date().toISOString();
    
    try {
      // Discover servers from multiple sources
      const servers = new Set();
      
      // Steam Master Server
      const steamServers = await this.discoverFromSteamMaster();
      steamServers.forEach(server => servers.add(server));
      
      // GameTracker API
      const gameTrackerServers = await this.discoverFromGameTracker();
      gameTrackerServers.forEach(server => servers.add(server));
      
      console.log(`📊 Discovered ${servers.size} unique servers`);
      
      // Query all discovered servers
      await this.queryServersBatch(Array.from(servers));
      
      console.log('✅ Full scan completed');
      this.printScanStats();
      
    } catch (error) {
      console.error('❌ Full scan failed:', error.message);
    }
  }

  async discoverFromSteamMaster() {
    console.log('🎮 Discovering servers from Steam Master Server...');
    
    try {
      return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        const servers = [];
        
        // Steam Master Server query for Garry's Mod servers
        const query = Buffer.from([0x31, 0xFF, 0x30, 0x2E, 0x30, 0x2E, 0x30, 0x2E, 0x30, 0x3A, 0x30, 0x00, 0x5C, 0x67, 0x61, 0x6D, 0x65, 0x64, 0x69, 0x72, 0x5C, 0x67, 0x61, 0x72, 0x72, 0x79, 0x73, 0x6D, 0x6F, 0x64, 0x00]);
        
        socket.on('message', (msg) => {
          try {
            // Parse server list response
            let offset = 6; // Skip header
            while (offset < msg.length - 6) {
              const ip = `${msg[offset]}.${msg[offset+1]}.${msg[offset+2]}.${msg[offset+3]}`;
              const port = (msg[offset+4] << 8) | msg[offset+5];
              servers.push(`${ip}:${port}`);
              offset += 6;
            }
          } catch (parseError) {
            console.error('⚠️ Error parsing Steam Master response:', parseError.message);
          }
        });
        
        socket.on('error', (err) => {
          console.error('❌ Steam Master Server error:', err.message);
          socket.close();
          resolve(servers);
        });
        
        setTimeout(() => {
          socket.close();
          console.log(`✅ Steam Master Server: ${servers.length} servers discovered`);
          resolve(servers);
        }, 10000);
        
        socket.send(query, 27011, 'hl2master.steampowered.com');
      });
      
    } catch (error) {
      console.error('❌ Steam Master Server discovery failed:', error.message);
      return [];
    }
  }

  async discoverFromGameTracker() {
    console.log('🌐 Discovering servers from GameTracker...');
    
    try {
      const response = await axios.get('https://api.gametracker.com/v1/games/garrysmod/servers', {
        timeout: 10000,
        params: {
          limit: 1000
        }
      });
      
      const servers = [];
      if (response.data && response.data.servers) {
        for (const server of response.data.servers) {
          if (server.ip && server.port) {
            servers.push(`${server.ip}:${server.port}`);
          }
        }
      }
      
      console.log(`✅ GameTracker: ${servers.length} servers discovered`);
      return servers;
      
    } catch (error) {
      console.error('❌ GameTracker discovery failed:', error.message);
      return [];
    }
  }

  async queryServersBatch(servers) {
    console.log(`🔍 Querying ${servers.length} servers in batches...`);
    
    const batches = [];
    for (let i = 0; i < servers.length; i += this.maxConcurrentQueries) {
      batches.push(servers.slice(i, i + this.maxConcurrentQueries));
    }
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} servers)...`);
      
      const queries = batch.map(server => this.queryServer(server));
      await Promise.allSettled(queries);
      
      // Small delay between batches
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async queryServer(serverAddress) {
    const [ip, port] = serverAddress.split(':');
    const serverPort = parseInt(port) || 27015;
    
    try {
      console.log(`🔍 Querying server: ${ip}:${serverPort}`);
      
      // Query server info and players
      const [serverInfo, playerInfo] = await Promise.all([
        this.queryServerInfo(ip, serverPort),
        this.queryServerPlayers(ip, serverPort)
      ]);
      
      if (serverInfo || playerInfo) {
        await this.saveServerData(ip, serverPort, serverInfo, playerInfo);
        this.scanStats.onlineServers++;
        
        // Check if server is Polish
        if (this.isPolishServer(serverInfo)) {
          this.polishServers.add(serverAddress);
          this.scanStats.polishServers++;
        }
      } else {
        await this.markServerOffline(ip, serverPort);
        this.scanStats.offlineServers++;
      }
      
    } catch (error) {
      console.log(`⚠️ Server ${ip}:${serverPort} didn't respond: ${error.message}`);
      await this.markServerOffline(ip, serverPort);
      this.scanStats.offlineServers++;
    }
  }

  async queryServerInfo(ip, port) {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('Query timeout'));
      }, this.queryTimeout);
      
      socket.on('message', (msg) => {
        clearTimeout(timeout);
        socket.close();
        
        try {
          const serverInfo = this.parseA2SInfo(msg);
          resolve(serverInfo);
        } catch (parseError) {
          reject(parseError);
        }
      });
      
      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      });
      
      socket.send(this.A2S_INFO, port, ip);
    });
  }

  async queryServerPlayers(ip, port) {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('Player query timeout'));
      }, this.queryTimeout);
      
      socket.on('message', (msg) => {
        clearTimeout(timeout);
        socket.close();
        
        try {
          const playerInfo = this.parseA2SPlayer(msg);
          resolve(playerInfo);
        } catch (parseError) {
          reject(parseError);
        }
      });
      
      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      });
      
      socket.send(this.A2S_PLAYER, port, ip);
    });
  }

  parseA2SInfo(buffer) {
    try {
      let offset = 4; // Skip header
      
      const info = {
        protocol: buffer[offset++],
        name: this.readString(buffer, offset),
        map: '',
        folder: '',
        game: '',
        players: 0,
        max_players: 0,
        bots: 0,
        server_type: '',
        environment: '',
        visibility: 0,
        vac: 0,
        version: '',
        port: 0,
        tags: ''
      };
      
      offset += info.name.length + 1;
      
      const mapResult = this.readString(buffer, offset);
      info.map = mapResult.value;
      offset += mapResult.length + 1;
      
      const folderResult = this.readString(buffer, offset);
      info.folder = folderResult.value;
      offset += folderResult.length + 1;
      
      const gameResult = this.readString(buffer, offset);
      info.game = gameResult.value;
      offset += gameResult.length + 1;
      
      info.players = buffer[offset++];
      info.max_players = buffer[offset++];
      info.bots = buffer[offset++];
      info.server_type = String.fromCharCode(buffer[offset++]);
      info.environment = String.fromCharCode(buffer[offset++]);
      info.visibility = buffer[offset++];
      info.vac = buffer[offset++];
      
      const versionResult = this.readString(buffer, offset);
      info.version = versionResult.value;
      offset += versionResult.length + 1;
      
      return info;
      
    } catch (error) {
      throw new Error(`Failed to parse A2S_INFO: ${error.message}`);
    }
  }

  parseA2SPlayer(buffer) {
    try {
      let offset = 5; // Skip header
      const playerCount = buffer[offset++];
      const players = [];
      
      for (let i = 0; i < playerCount && offset < buffer.length; i++) {
        const index = buffer[offset++];
        
        const nameResult = this.readString(buffer, offset);
        const name = nameResult.value;
        offset += nameResult.length + 1;
        
        const score = buffer.readInt32LE(offset);
        offset += 4;
        
        const duration = buffer.readFloatLE(offset);
        offset += 4;
        
        players.push({
          index,
          name,
          score,
          duration
        });
      }
      
      return players;
      
    } catch (error) {
      throw new Error(`Failed to parse A2S_PLAYER: ${error.message}`);
    }
  }

  readString(buffer, offset) {
    let length = 0;
    while (offset + length < buffer.length && buffer[offset + length] !== 0) {
      length++;
    }
    return {
      value: buffer.slice(offset, offset + length).toString('utf8'),
      length: length
    };
  }

  isPolishServer(serverInfo) {
    if (!serverInfo) return false;
    
    const polishIndicators = [
      /\b(pl|poland|polska|polish)\b/i,
      /\b(warszawa|krakow|gdansk|wroclaw|poznan)\b/i,
      /\[pl\]/i,
      /polska/i,
      /\bpl\b/i
    ];
    
    const textToCheck = `${serverInfo.name} ${serverInfo.tags}`.toLowerCase();
    
    return polishIndicators.some(pattern => pattern.test(textToCheck));
  }

  async saveServerData(ip, port, serverInfo, playerInfo) {
    try {
      // Save/update server
      const serverData = {
        ip,
        port,
        name: serverInfo?.name || 'Unknown',
        map: serverInfo?.map || 'Unknown',
        description: '',
        tags: serverInfo?.tags || '',
        max_players: serverInfo?.max_players || 0,
        password_protected: serverInfo?.visibility === 1,
        secure: serverInfo?.vac === 1,
        version: serverInfo?.version || '',
        os: serverInfo?.environment || 'l',
        game_id: 4000, // Garry's Mod
        country: 'Unknown',
        region: 'Unknown'
      };
      
      await database.insertServer(serverData);
      
      // Create snapshot
      const snapshotData = {
        server_id: await this.getServerId(ip, port),
        player_count: serverInfo?.players || 0,
        max_players: serverInfo?.max_players || 0,
        map: serverInfo?.map || 'Unknown',
        gamemode: 'Unknown', // Will be determined by ML
        gamemode_confidence: 0,
        is_polish_server: this.isPolishServer(serverInfo),
        polish_confidence: this.isPolishServer(serverInfo) ? 0.9 : 0.1,
        ping_ms: 0 // TODO: Implement ping measurement
      };
      
      await database.createSnapshot(snapshotData);
      
      console.log(`✅ Saved data for server: ${serverInfo?.name || `${ip}:${port}`}`);
      
    } catch (error) {
      console.error(`❌ Failed to save server data for ${ip}:${port}:`, error.message);
      throw error;
    }
  }

  async markServerOffline(ip, port) {
    try {
      const sql = 'UPDATE servers SET last_seen = CURRENT_TIMESTAMP WHERE ip = ? AND port = ?';
      await database.executeWithRetry(sql, [ip, port]);
      console.log(`⚠️ Marked server offline: ${ip}:${port}`);
    } catch (error) {
      console.error(`❌ Failed to mark server offline ${ip}:${port}:`, error.message);
    }
  }

  async getServerId(ip, port) {
    const db = await database.getConnection();
    try {
      return new Promise((resolve, reject) => {
        const sql = 'SELECT id FROM servers WHERE ip = ? AND port = ?';
        db.get(sql, [ip, port], (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.id : null);
        });
      });
    } finally {
      database.closeConnection(db);
    }
  }

  async scanPolishServers() {
    if (this.polishServers.size === 0) {
      console.log('📍 No Polish servers to scan');
      return;
    }
    
    console.log(`📍 Scanning ${this.polishServers.size} Polish servers...`);
    await this.queryServersBatch(Array.from(this.polishServers));
    console.log('✅ Polish server scan completed');
  }

  printScanStats() {
    console.log('📊 Scan Statistics:');
    console.log(`   Total servers discovered: ${this.scanStats.totalServers}`);
    console.log(`   Polish servers: ${this.scanStats.polishServers}`);
    console.log(`   Online servers: ${this.scanStats.onlineServers}`);
    console.log(`   Offline servers: ${this.scanStats.offlineServers}`);
    console.log(`   Last scan: ${this.scanStats.lastScan}`);
  }

  getStats() {
    return {
      ...this.scanStats,
      isScanning: this.isScanning,
      activeQueries: this.activeQueries,
      polishServersCount: this.polishServers.size
    };
  }

  // Configuration methods (for frontend later)
  setScanInterval(minutes) {
    this.scanInterval = minutes * 60 * 1000;
    console.log(`⚙️ Scan interval set to ${minutes} minutes`);
  }

  setPolishScanInterval(minutes) {
    this.polishScanInterval = minutes * 60 * 1000;
    console.log(`⚙️ Polish scan interval set to ${minutes} minutes`);
  }

  setMaxConcurrentQueries(max) {
    this.maxConcurrentQueries = max;
    console.log(`⚙️ Max concurrent queries set to ${max}`);
  }
}

module.exports = ServerScannerService;