### PM2 WebUI
Opensource Alternative to PM2 Plus

##### FEATURES
- Secure Login :white_check_mark:
- App Management :white_check_mark:
- Log Viewer :white_check_mark:
- Multi-VM Control (Hub + Agent) :white_check_mark:
- Responsive UI :white_check_mark:
- Telegram Bot Integration (with Git commands) :white_check_mark:
- Git Update Detection & Pull :white_check_mark:
- Manual and Auto(Github webhooks) Deployment
- Environment Management

##### QUICK START
### Hub (VM1 - central dashboard)
```bash
git clone https://github.com/inceon/pm2-webui
cd pm2-webui
npm install
cp env.example .env
echo "APP_MODE=hub" >> .env
npm run setup-admin-user  # Required for login
npm start
```

### Agent (VM2/VM3 - controlled nodes)
```bash
git clone https://github.com/inceon/pm2-webui
cd pm2-webui
npm install
cp env.example .env
echo "APP_MODE=agent" >> .env
echo "LOCAL_SERVER_NAME=vm2" >> .env
echo "AGENT_API_TOKEN=<long-random-token>" >> .env
npm start
```

**Hub Access**: `http://VM1:4343`  
Then add VM2/VM3 from dashboard using their base URL and token.

Security notes:
- Agent token must be at least 24 characters.
- Remote agent base URL host is restricted to `localhost` or private IPv4.

📚 **Documentation**:
- 🚀 [Quick Start for Multiple VMs](QUICK_START.md) - Start here!
- 🧭 [Hub + Agent Detailed Setup](HUB_AGENT_SETUP.md) - Full 3-VM walkthrough
- 📖 [Complete Setup Guide](SETUP_GUIDE.md) - Advanced configurations

##### FOR DEVELOPMENT USE
```bash
npm run start:dev
```

#### COMPLETED ✅
- [x] use fs-extra for filesystem operations
- [x] replace exec.util with [execa](https://www.npmjs.com/package/execa)
- [x] add multi-user support with roles (admin/viewer)
- [x] add CSRF protection
- [x] add request logging
- [x] add comprehensive error handling
- [x] add HTTPS support
- [x] migrate to ES Modules (ESM)
- [x] add Telegram bot integration (status, control, crash alerts, git management)
- [x] add git update detection and pull functionality (web UI + Telegram bot)

#### TODO
- [ ] support for relative paths
- [ ] use [jsonfile](https://www.npmjs.com/package/jsonfile) for config management
- [ ] add form based env management
- [ ] add realtime logs (WebSocket/SSE)
- [ ] add log viewer for deployments
- [ ] add deployment abort functionality
- [ ] add deployment triggers
- [ ] add web terminal
- [ ] add zero downtime deployment strategies - blue-green, rolling etc
- [ ] add docker provider support
- [ ] add metrics/monitoring dashboard

##### SCREENSHOTS
![PM2 Webui Login](/screenshots/login.png?raw=true "PM2 WebUI Login")
![PM2 Webui Dashboard](/screenshots/dashboard.png?raw=true "PM2 WebUI Dashboard")
![PM2 Webui App](/screenshots/app.png?raw=true "PM2 WebUI App")

##### LICENSE
MIT - Copyright (c) 2026 Inceon
