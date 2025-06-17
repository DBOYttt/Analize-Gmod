const tf = require('@tensorflow/tfjs-node');
const database = require('../database');

class MLService {
  constructor() {
    // Models will be loaded/created here
    this.gamemodeModel = null;
    this.polishServerModel = null;
    
    // Confidence thresholds
    this.polishConfidenceThreshold = 0.7; // Above this = confident Polish server
    this.gamemodeConfidenceThreshold = 0.6; // Above this = confident gamemode
    this.reviewThreshold = 0.5; // Below this = needs manual review
    
    // Feature vocabularies (will be built from training data)
    this.gamemodeVocabulary = new Map();
    this.polishVocabulary = new Map();
    this.mapVocabulary = new Map();
    
    // Known gamemode patterns (initial seed data)
    this.gamemodePatterns = {
      'darkrp': /\b(darkrp|dark\s*rp|roleplay|rp)\b/i,
      'sandbox': /\b(sandbox|build|creative)\b/i,
      'ttt': /\b(ttt|trouble|terrorist|traitor)\b/i,
      'prophunt': /\b(prop\s*hunt|prophunt|hide)\b/i,
      'murder': /\b(murder|gm_murder)\b/i,
      'deathrun': /\b(deathrun|death\s*run|dr_)\b/i,
      'jailbreak': /\b(jailbreak|jail\s*break|prison)\b/i,
      'zombiesurvival': /\b(zombie|zs_|survival)\b/i,
      'cinema': /\b(cinema|movie|theater)\b/i,
      'militaryrp': /\b(military|milrp|army|war)\b/i
    };
    
    // Polish server patterns (initial seed data)
    this.polishPatterns = [
      /\b(pl|poland|polska|polish)\b/i,
      /\b(warszawa|krakow|gdansk|wroclaw|poznan|lodz|katowice)\b/i,
      /\[pl\]/i,
      /polska/i,
      /\bpl\b/i,
      /polsk/i,
      /🇵🇱/,
      /polish/i
    ];
    
    this.isInitialized = false;
  }

  async initialize() {
    console.log('🤖 Initializing ML Service...');
    
    try {
      // Ensure database is initialized
      if (!database.isInitialized) {
        await database.initialize();
      }
      
      // Load or create models
      await this.initializeModels();
      
      // Build vocabularies from existing data
      await this.buildVocabularies();
      
      this.isInitialized = true;
      console.log('✅ ML Service initialized');
      return true;
    } catch (error) {
      console.error('❌ ML Service initialization failed:', error);
      throw error;
    }
  }

  async initializeModels() {
    console.log('🧠 Initializing ML models...');
    
    try {
      // Try to load existing models
      await this.loadModels();
    } catch (error) {
      console.log('📚 No existing models found, creating new ones...');
      await this.createModels();
    }
    
    console.log('✅ ML models ready');
  }

  async loadModels() {
    // In a real implementation, these would be loaded from files
    // For now, we'll create them fresh each time
    throw new Error('No saved models found');
  }

  async createModels() {
    console.log('🏗️ Creating new ML models...');
    
    // Gamemode prediction model
    this.gamemodeModel = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [100], units: 64, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: Object.keys(this.gamemodePatterns).length, activation: 'softmax' })
      ]
    });
    
    this.gamemodeModel.compile({
      optimizer: 'adam',
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });
    
    // Polish server detection model
    this.polishServerModel = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [100], units: 32, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 16, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
      ]
    });
    
    this.polishServerModel.compile({
      optimizer: 'adam',
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });
    
    console.log('✅ ML models created');
  }

  async buildVocabularies() {
    console.log('📖 Building feature vocabularies from existing data...');
    
    try {
      const db = await database.getConnection();
      
      const servers = await new Promise((resolve, reject) => {
        const sql = 'SELECT name, tags, map FROM servers WHERE name IS NOT NULL';
        db.all(sql, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      database.closeConnection(db);
      
      // Build vocabularies
      const allText = new Set();
      
      for (const server of servers) {
        const text = `${server.name || ''} ${server.tags || ''} ${server.map || ''}`.toLowerCase();
        const words = text.split(/\s+/).filter(word => word.length > 2);
        words.forEach(word => allText.add(word));
      }
      
      // Convert to indexed vocabulary
      Array.from(allText).forEach((word, index) => {
        this.gamemodeVocabulary.set(word, index);
        this.polishVocabulary.set(word, index);
      });
      
      console.log(`✅ Built vocabulary with ${allText.size} unique words`);
      
    } catch (error) {
      console.error('❌ Failed to build vocabularies:', error);
      // Use empty vocabularies if database query fails
    }
  }

  async predictGamemode(serverData) {
    console.log(`🎮 Predicting gamemode for server: ${serverData.name}`);
    
    try {
      // Rule-based prediction first (fast and reliable)
      const ruleBasedResult = this.predictGamemodeRuleBased(serverData);
      
      // If high confidence rule-based prediction, use it
      if (ruleBasedResult.confidence > this.gamemodeConfidenceThreshold) {
        console.log(`✅ High confidence rule-based prediction: ${ruleBasedResult.gamemode} (${ruleBasedResult.confidence})`);
        return ruleBasedResult;
      }
      
      // Otherwise, use ML model
      const mlResult = await this.predictGamemodeML(serverData);
      
      // Combine rule-based and ML predictions
      const combinedResult = this.combineGamemodePredictions(ruleBasedResult, mlResult);
      
      console.log(`🎯 Final gamemode prediction: ${combinedResult.gamemode} (confidence: ${combinedResult.confidence})`);
      return combinedResult;
      
    } catch (error) {
      console.error(`❌ Gamemode prediction failed for ${serverData.name}:`, error.message);
      return {
        gamemode: 'unknown',
        confidence: 0,
        needs_review: true,
        prediction_reason: `Error: ${error.message}`
      };
    }
  }

  predictGamemodeRuleBased(serverData) {
    const text = `${serverData.name || ''} ${serverData.tags || ''} ${serverData.map || ''}`.toLowerCase();
    
    let bestMatch = null;
    let highestScore = 0;
    
    for (const [gamemode, pattern] of Object.entries(this.gamemodePatterns)) {
      if (pattern.test(text)) {
        // Simple scoring based on pattern strength
        const matches = text.match(pattern);
        const score = matches ? matches[0].length / text.length + 0.5 : 0;
        
        if (score > highestScore) {
          highestScore = score;
          bestMatch = gamemode;
        }
      }
    }
    
    return {
      gamemode: bestMatch || 'unknown',
      confidence: Math.min(highestScore, 0.95), // Cap at 95% for rule-based
      needs_review: highestScore < this.reviewThreshold,
      prediction_reason: bestMatch ? `Rule-based match: ${bestMatch}` : 'No pattern match'
    };
  }

  async predictGamemodeML(serverData) {
    try {
      // Convert server data to feature vector
      const features = this.extractFeatures(serverData, this.gamemodeVocabulary);
      const inputTensor = tf.tensor2d([features]);
      
      // Make prediction
      const prediction = this.gamemodeModel.predict(inputTensor);
      const probabilities = await prediction.data();
      
      // Find best prediction
      const maxIndex = probabilities.indexOf(Math.max(...probabilities));
      const gamemode = Object.keys(this.gamemodePatterns)[maxIndex] || 'unknown';
      const confidence = probabilities[maxIndex];
      
      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();
      
      return {
        gamemode,
        confidence,
        needs_review: confidence < this.reviewThreshold,
        prediction_reason: `ML prediction (${Math.round(confidence * 100)}% confidence)`
      };
      
    } catch (error) {
      console.error('❌ ML gamemode prediction failed:', error);
      return {
        gamemode: 'unknown',
        confidence: 0,
        needs_review: true,
        prediction_reason: `ML error: ${error.message}`
      };
    }
  }

  combineGamemodePredictions(ruleBased, ml) {
    // If rule-based has high confidence, prefer it
    if (ruleBased.confidence > 0.8) {
      return ruleBased;
    }
    
    // If ML has higher confidence, use it
    if (ml.confidence > ruleBased.confidence) {
      return ml;
    }
    
    // Otherwise, use rule-based as fallback
    return ruleBased;
  }

  async predictPolishServer(serverData) {
    console.log(`🇵🇱 Predicting Polish server for: ${serverData.name}`);
    
    try {
      // Rule-based prediction first
      const ruleBasedResult = this.predictPolishServerRuleBased(serverData);
      
      // ML prediction
      const mlResult = await this.predictPolishServerML(serverData);
      
      // Combine predictions
      const combinedResult = this.combinePolishPredictions(ruleBasedResult, mlResult);
      
      console.log(`🎯 Polish server prediction: ${combinedResult.is_polish} (confidence: ${combinedResult.confidence})`);
      return combinedResult;
      
    } catch (error) {
      console.error(`❌ Polish server prediction failed for ${serverData.name}:`, error.message);
      return {
        is_polish: false,
        confidence: 0,
        needs_review: true,
        prediction_reason: `Error: ${error.message}`
      };
    }
  }

  predictPolishServerRuleBased(serverData) {
    const text = `${serverData.name || ''} ${serverData.tags || ''} ${serverData.map || ''}`.toLowerCase();
    
    let matchCount = 0;
    let totalStrength = 0;
    
    for (const pattern of this.polishPatterns) {
      if (pattern.test(text)) {
        matchCount++;
        // Weight stronger indicators higher
        if (pattern.source.includes('polska') || pattern.source.includes('poland')) {
          totalStrength += 0.9;
        } else if (pattern.source.includes('🇵🇱')) {
          totalStrength += 0.8;
        } else {
          totalStrength += 0.6;
        }
      }
    }
    
    const confidence = Math.min(totalStrength, 0.95);
    const isPolish = confidence > this.reviewThreshold;
    
    return {
      is_polish: isPolish,
      confidence,
      needs_review: confidence < this.polishConfidenceThreshold && confidence > 0.3,
      prediction_reason: `Rule-based: ${matchCount} patterns matched`
    };
  }

  async predictPolishServerML(serverData) {
    try {
      // Convert server data to feature vector
      const features = this.extractFeatures(serverData, this.polishVocabulary);
      const inputTensor = tf.tensor2d([features]);
      
      // Make prediction
      const prediction = this.polishServerModel.predict(inputTensor);
      const probability = (await prediction.data())[0];
      
      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();
      
      return {
        is_polish: probability > 0.5,
        confidence: probability,
        needs_review: probability > 0.3 && probability < this.polishConfidenceThreshold,
        prediction_reason: `ML prediction (${Math.round(probability * 100)}% confidence)`
      };
      
    } catch (error) {
      console.error('❌ ML Polish prediction failed:', error);
      return {
        is_polish: false,
        confidence: 0,
        needs_review: true,
        prediction_reason: `ML error: ${error.message}`
      };
    }
  }

  combinePolishPredictions(ruleBased, ml) {
    // Weighted average with rule-based having slightly higher weight
    const combinedConfidence = (ruleBased.confidence * 0.6) + (ml.confidence * 0.4);
    const isPolish = combinedConfidence > 0.5;
    
    return {
      is_polish: isPolish,
      confidence: combinedConfidence,
      needs_review: combinedConfidence > 0.3 && combinedConfidence < this.polishConfidenceThreshold,
      prediction_reason: `Combined: Rule=${Math.round(ruleBased.confidence*100)}%, ML=${Math.round(ml.confidence*100)}%`
    };
  }

  extractFeatures(serverData, vocabulary) {
    const text = `${serverData.name || ''} ${serverData.tags || ''} ${serverData.map || ''}`.toLowerCase();
    const words = text.split(/\s+/).filter(word => word.length > 2);
    
    // Create feature vector (bag of words)
    const features = new Array(100).fill(0); // Fixed size vector
    
    for (const word of words) {
      const index = vocabulary.get(word);
      if (index !== undefined && index < features.length) {
        features[index] = 1;
      }
    }
    
    return features;
  }

  async processServer(serverData) {
    if (!this.isInitialized) {
      throw new Error('ML Service not initialized');
    }
    
    console.log(`🤖 Processing server with ML: ${serverData.name}`);
    
    try {
      // Make predictions
      const [gamemodeResult, polishResult] = await Promise.all([
        this.predictGamemode(serverData),
        this.predictPolishServer(serverData)
      ]);
      
      // Save predictions to database
      await this.savePredictions(serverData, gamemodeResult, polishResult);
      
      console.log(`✅ ML processing completed for: ${serverData.name}`);
      return {
        gamemode: gamemodeResult,
        polish: polishResult
      };
      
    } catch (error) {
      console.error(`❌ ML processing failed for ${serverData.name}:`, error.message);
      throw error;
    }
  }

  async savePredictions(serverData, gamemodeResult, polishResult) {
    try {
      const serverId = await this.getServerId(serverData.ip, serverData.port);
      
      if (!serverId) {
        throw new Error('Server not found in database');
      }
      
      // Save gamemode prediction
      const gamemodeSql = `
        INSERT OR REPLACE INTO gamemode_predictions 
        (server_id, predicted_gamemode, confidence, needs_review, prediction_reason, prediction_time)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      await database.executeWithRetry(gamemodeSql, [
        serverId, 
        gamemodeResult.gamemode, 
        gamemodeResult.confidence,
        gamemodeResult.needs_review ? 1 : 0,
        gamemodeResult.prediction_reason
      ]);
      
      // Save Polish server prediction
      const polishSql = `
        INSERT OR REPLACE INTO polish_server_predictions 
        (server_id, is_polish_server, confidence, needs_review, prediction_reason, prediction_time)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      await database.executeWithRetry(polishSql, [
        serverId,
        polishResult.is_polish ? 1 : 0,
        polishResult.confidence,
        polishResult.needs_review ? 1 : 0,
        polishResult.prediction_reason
      ]);
      
      console.log(`💾 Saved ML predictions for server ${serverId}`);
      
    } catch (error) {
      console.error('❌ Failed to save ML predictions:', error.message);
      throw error;
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

  async learnFromFeedback() {
    console.log('📚 Learning from manual feedback...');
    
    try {
      // Get feedback data from database
      const feedbackData = await this.getFeedbackData();
      
      if (feedbackData.length > 0) {
        await this.retrainModels(feedbackData);
        console.log(`✅ Learned from ${feedbackData.length} feedback entries`);
      } else {
        console.log('📭 No new feedback data available');
      }
      
    } catch (error) {
      console.error('❌ Learning from feedback failed:', error.message);
    }
  }

  async getFeedbackData() {
    const db = await database.getConnection();
    try {
      return new Promise((resolve, reject) => {
        const sql = `
          SELECT s.name, s.tags, s.map, p.manual_feedback, p.is_polish_server
          FROM servers s
          JOIN polish_server_predictions p ON s.id = p.server_id
          WHERE p.manual_feedback IS NOT NULL
        `;
        
        db.all(sql, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    } finally {
      database.closeConnection(db);
    }
  }

  async retrainModels(feedbackData) {
    console.log(`🔄 Retraining models with ${feedbackData.length} feedback samples...`);
    
    // Prepare training data
    const features = feedbackData.map(data => 
      this.extractFeatures(data, this.polishVocabulary)
    );
    const labels = feedbackData.map(data => 
      data.manual_feedback === 'polish' ? 1 : 0
    );
    
    // Convert to tensors
    const xs = tf.tensor2d(features);
    const ys = tf.tensor2d(labels, [labels.length, 1]);
    
    try {
      // Retrain Polish server model
      await this.polishServerModel.fit(xs, ys, {
        epochs: 10,
        batchSize: 32,
        validationSplit: 0.2,
        verbose: 0
      });
      
      console.log('✅ Model retraining completed');
      
    } catch (error) {
      console.error('❌ Model retraining failed:', error);
    } finally {
      xs.dispose();
      ys.dispose();
    }
  }

  getStats() {
    return {
      isInitialized: this.isInitialized,
      vocabularySize: this.polishVocabulary.size,
      gamemodePatterns: Object.keys(this.gamemodePatterns).length,
      polishPatterns: this.polishPatterns.length,
      thresholds: {
        polishConfidence: this.polishConfidenceThreshold,
        gamemodeConfidence: this.gamemodeConfidenceThreshold,
        review: this.reviewThreshold
      }
    };
  }
}

module.exports = MLService;