#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = 'backups';
const dbPath = process.env.DB_PATH || './data/gmodpolska.db';

console.log('💾 Starting database backup...');

// Ensure backup directory exists
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.error('❌ Database file not found:', dbPath);
  process.exit(1);
}

try {
  // Create backup filename
  const backupFile = path.join(backupDir, `gmodpolska-${timestamp}.db`);
  
  // Copy database file
  fs.copyFileSync(dbPath, backupFile);
  
  // Compress backup (optional)
  if (process.argv.includes('--compress')) {
    console.log('🗜️ Compressing backup...');
    execSync(`gzip "${backupFile}"`);
    console.log(`✅ Backup created and compressed: ${backupFile}.gz`);
  } else {
    console.log(`✅ Backup created: ${backupFile}`);
  }
  
  // Clean up old backups (keep last 10)
  const backupFiles = fs.readdirSync(backupDir)
    .filter(file => file.startsWith('gmodpolska-') && (file.endsWith('.db') || file.endsWith('.db.gz')))
    .sort()
    .reverse();
  
  if (backupFiles.length > 10) {
    const filesToDelete = backupFiles.slice(10);
    filesToDelete.forEach(file => {
      const filePath = path.join(backupDir, file);
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted old backup: ${file}`);
    });
  }
  
  console.log('✅ Backup completed successfully');
  
} catch (error) {
  console.error('❌ Backup failed:', error.message);
  process.exit(1);
}