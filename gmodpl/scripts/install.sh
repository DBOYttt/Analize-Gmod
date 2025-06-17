#!/bin/bash

echo "🚀 Installing GMod Polska Scanner..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    echo "📖 Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Run setup script
echo "⚙️ Running setup..."
npm run setup

# Install PM2 globally (optional)
echo ""
read -p "🔧 Install PM2 for production deployment? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm install -g pm2
    echo "✅ PM2 installed globally"
fi

echo ""
echo "🎉 Installation completed!"
echo ""
echo "📋 Quick Start:"
echo "1. Edit .env file and add your Steam API key"
echo "2. Run: npm run dev"
echo "3. Open: http://localhost:3000"
echo ""
echo "📚 Documentation: README.md"