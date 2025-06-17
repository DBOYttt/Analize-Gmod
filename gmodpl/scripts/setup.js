#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up GMod Polska Scanner...\n');

// Create necessary directories
const directories = [
  'data',
  'logs',
  'public',
  'backups'
];

console.log('📁 Creating directories...');
directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  } else {
    console.log(`📁 Directory already exists: ${dir}`);
  }
});

// Create .env file if it doesn't exist
console.log('\n⚙️ Setting up environment configuration...');
const envPath = '.env';
if (!fs.existsSync(envPath)) {
  const envTemplate = `# Steam Web API Configuration
STEAM_API_KEY=

# Database Configuration
DB_PATH=./data/gmodpolska.db

# Server Configuration
PORT=3000
NODE_ENV=development

# IP Geolocation Service (Optional - for identifying Polish players)
IPGEOLOCATION_API_KEY=

# GMod Server Query Configuration
QUERY_INTERVAL_MINUTES=5
MAX_SERVERS_TO_TRACK=100

# Analytics Configuration
RETENTION_DAYS=30
CLEANUP_INTERVAL_HOURS=24
`;

  fs.writeFileSync(envPath, envTemplate);
  console.log('✅ Created .env file template');
  console.log('⚠️  Please edit .env file and add your Steam API key!');
} else {
  console.log('📄 .env file already exists');
}

// Create PM2 ecosystem file
console.log('\n🔧 Creating PM2 configuration...');
const pm2Config = `module.exports = {
  apps: [{
    name: 'gmod-polska',
    script: 'src/app.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    log_file: 'logs/combined.log',
    out_file: 'logs/out.log',
    error_file: 'logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
`;

fs.writeFileSync('ecosystem.config.js', pm2Config);
console.log('✅ Created PM2 ecosystem configuration');

console.log('\n🎉 Setup completed successfully!');
console.log('\n📋 Next steps:');
console.log('1. Edit .env file and add your Steam API key');
console.log('2. Run: npm install');
console.log('3. Run: npm run dev (for development)');
console.log('4. Run: npm run pm2:start (for production)');
console.log('\n📚 Available commands:');
console.log('  npm run dev        - Start in development mode');
console.log('  npm start          - Start in production mode');
console.log('  npm run health     - Check application health');
console.log('  npm run pm2:start  - Start with PM2');
console.log('  npm run backup     - Backup database');
console.log('\n🔗 Dashboard will be available at: http://localhost:3000');