# GMod Polska Scanner 🇵🇱

A comprehensive Garry's Mod server scanner and player tracker focused on Polish gaming communities. This application automatically discovers GMod servers, tracks player activity, and uses machine learning to identify Polish servers and game modes.

## Features ✨

- **🔍 Server Discovery**: Automatically scans for Garry's Mod servers using Steam Master Server API
- **👥 Player Tracking**: Collects player data and Steam profiles
- **🤖 Machine Learning**: AI-powered gamemode detection and Polish server identification
- **📊 Analytics**: Real-time statistics and historical data tracking
- **🌐 Web Dashboard**: Modern web interface for monitoring and management
- **⚡ Real-time Updates**: Live server status and player activity
- **💾 Data Persistence**: SQLite database with automatic backups

## Quick Start 🚀

### Prerequisites

- Node.js 16+ ([Download](https://nodejs.org/))
- Steam Web API Key ([Get one here](https://steamcommunity.com/dev/apikey))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/DBOYttt/gmod-polska-scanner.git
   cd gmod-polska-scanner
   ```

2. **Run the installation script**
   ```bash
   chmod +x scripts/install.sh
   ./scripts/install.sh
   ```

3. **Configure environment**
   ```bash
   # Edit .env file and add your Steam API key
   nano .env
   ```

4. **Start the application**
   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

5. **Access the dashboard**
   Open [http://localhost:3000](http://localhost:3000) in your browser

## Configuration ⚙️

### Environment Variables

Create a `.env` file in the root directory:

```env
# Steam Web API Configuration
STEAM_API_KEY=your_steam_api_key_here

# Database Configuration
DB_PATH=./data/gmodpolska.db

# Server Configuration
PORT=3000
NODE_ENV=development

# IP Geolocation Service (Optional)
IPGEOLOCATION_API_KEY=your_ipgeolocation_key

# GMod Server Query Configuration
QUERY_INTERVAL_MINUTES=5
MAX_SERVERS_TO_TRACK=100

# Analytics Configuration
RETENTION_DAYS=30
CLEANUP_INTERVAL_HOURS=24
```

### Getting a Steam API Key

1. Visit [Steam Web API Key](https://steamcommunity.com/dev/apikey)
2. Log in with your Steam account
3. Enter your domain name (use `localhost` for development)
4. Copy the generated API key to your `.env` file

## Usage 📖

### Development Mode

```bash
npm run dev
```

This starts the application with:
- Auto-restart on file changes
- Detailed logging
- Development-friendly settings

### Production Mode

```bash
# Using Node.js directly
npm start

# Using PM2 (recommended for production)
npm run pm2:start
```

### Health Monitoring

```bash
# Check application health
npm run health

# View logs
npm run logs

# PM2 logs (if using PM2)
npm run pm2:logs
```

### Database Management

```bash
# Create database backup
npm run backup

# Restore from backup
npm run restore

# Run database migrations
npm run migrate
```

## API Documentation 📡

### Health Check

```http
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-06-17T13:40:14.000Z",
  "uptime": 3600,
  "services": {
    "database": { "status": "running", "error": null },
    "steam": { "status": "running", "error": null },
    "scanner": { "status": "running", "error": null },
    "ml": { "status": "running", "error": null }
  }
}
```

### Application Status

```http
GET /api/status
```

Response:
```json
{
  "services": {
    "database": { "status": "running", "lastCheck": "2025-06-17T13:40:14.000Z" },
    "steam": { "status": "running", "lastCheck": "2025-06-17T13:40:14.000Z" },
    "scanner": { "status": "running", "lastCheck": "2025-06-17T13:40:14.000Z" },
    "ml": { "status": "running", "lastCheck": "2025-06-17T13:40:14.000Z" }
  },
  "metrics": {
    "uptime": 3600,
    "totalServersScanned": 245,
    "totalPlayersProcessed": 1523,
    "totalMLPredictions": 189,
    "apiRequests": 45,
    "errors": 2
  },
  "config": {
    "queryInterval": 5,
    "maxServers": 100,
    "environment": "development"
  }
}
```

### Server Data

```http
GET /api/servers
GET /api/servers?country=PL
GET /api/servers?gamemode=darkrp
```

### Player Data

```http
GET /api/players
GET /api/players/:steamId
```

## Architecture 🏗️

### Service Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Dashboard │    │   REST API      │    │   Main App      │
│                 │◄───┤                 │◄───┤   Orchestrator  │
│   (Frontend)    │    │   (Express.js)  │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                        ┌───────────────────────────────┼───────────────────────────────┐
                        │                               │                               │
                        ▼                               ▼                               ▼
                ┌─────────────────┐            ┌─────────────────┐            ┌─────────────────┐
                │   Steam API     │            │   Server        │            │   Machine       │
                │   Service       │            │   Scanner       │            │   Learning      │
                │                 │            │   Service       │            │   Service       │
                └─────────────────┘            └─────────────────┘            └─────────────────┘
                        │                               │                               │
                        └───────────────────────────────┼───────────────────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │   SQLite        │
                                                │   Database      │
                                                │                 │
                                                └─────────────────┘
```

### Data Flow

1. **Server Discovery**: Scanner service discovers GMod servers using Steam Master Server API
2. **Server Querying**: Real-time server queries using Source Engine Query Protocol
3. **Player Data Collection**: Steam API fetches player profiles and game data
4. **ML Processing**: Machine learning service analyzes server data for gamemode and nationality
5. **Data Storage**: All data is stored in SQLite database with automatic backups
6. **Web Interface**: Dashboard provides real-time monitoring and analytics

## Database Schema 📊

### Core Tables

- **servers**: Server information (IP, port, name, tags, etc.)
- **players**: Player profiles from Steam API
- **server_snapshots**: Historical server states
- **player_sessions**: Player activity tracking

### ML Tables

- **gamemode_predictions**: AI-predicted game modes
- **polish_server_predictions**: Polish server identification
- **manual_feedback**: Human corrections for ML training

## Machine Learning 🤖

### Gamemode Detection

The ML service uses a hybrid approach:
- **Rule-based matching**: Pattern recognition for common gamemode names
- **Neural network**: TensorFlow.js model trained on server metadata
- **Confidence scoring**: Combines both approaches for accuracy

Supported gamemodes:
- DarkRP
- TTT (Trouble in Terrorist Town)
- Prop Hunt
- Sandbox
- Murder
- Deathrun
- Jailbreak
- Zombie Survival
- Cinema
- Military RP

### Polish Server Detection

Features used for detection:
- Server name analysis
- Tags and descriptions
- Map names
- Player nationality patterns

The system learns from manual feedback to improve accuracy over time.

## Production Deployment 🚀

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start application
npm run pm2:start

# Monitor
pm2 status
pm2 logs gmod-polska

# Restart
npm run pm2:restart

# Stop
npm run pm2:stop
```

### Using Docker

```bash
# Build image
docker build -t gmod-polska-scanner .

# Run container
docker run -d \
  --name gmod-polska \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  --env-file .env \
  gmod-polska-scanner
```

### Using Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Monitoring 📈

### Health Checks

The application provides several health check endpoints:

- `/api/health` - Overall application health
- `/api/status` - Detailed service status
- Service-specific health monitoring every 5 minutes
- Automatic service restart on failure

### Logging

Structured JSON logging includes:
- Application events
- Service status changes
- API requests
- Error tracking
- Performance metrics

### Metrics

Real-time metrics tracking:
- Server scan statistics
- Player processing counts
- ML prediction accuracy
- API usage statistics
- System uptime and performance

## Troubleshooting 🔧

### Common Issues

#### Steam API Key Issues
```bash
# Check if API key is set
echo $STEAM_API_KEY

# Verify API key works
curl "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=YOUR_KEY&steamids=76561198000000000"
```

#### Database Issues
```bash
# Check database file permissions
ls -la data/gmodpolska.db

# Verify database integrity
sqlite3 data/gmodpolska.db "PRAGMA integrity_check;"
```

#### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

#### Service Failures
```bash
# Check service logs
npm run logs

# Restart specific service
npm run pm2:restart
```

### Debug Mode

Enable debug logging:
```bash
NODE_ENV=development DEBUG=* npm run dev
```

## Contributing 🤝

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Submit a pull request

### Code Style

- Use ESLint configuration provided
- Follow standard JavaScript conventions
- Add JSDoc comments for functions
- Write tests for new features

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- --grep "Steam API"
```

## License 📄

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support 💬

- **Issues**: [GitHub Issues](https://github.com/DBOYttt/gmod-polska-scanner/issues)
- **Discussions**: [GitHub Discussions](https://github.com/DBOYttt/gmod-polska-scanner/discussions)
- **Discord**: [GMod Polska Community](https://discord.gg/gmodpolska)

## Acknowledgments 🙏

- Steam Web API for server and player data
- TensorFlow.js for machine learning capabilities
- SQLite for reliable data storage
- Express.js for web server framework
- GMod Polish community for inspiration and feedback

## Roadmap 🗺️

- [ ] Web-based configuration interface
- [ ] Advanced analytics dashboard
- [ ] Player behavior analysis
- [ ] Server recommendation system
- [ ] Mobile app companion
- [ ] Multi-language support
- [ ] Advanced ML models
- [ ] Real-time notifications
- [ ] Community features
- [ ] API rate limiting improvements

---

**Made with ❤️ for the Polish GMod community by DBOYttt**

*Last updated: June 17, 2025*