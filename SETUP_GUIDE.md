# PM2 WebUI Setup Guide

## ⚠️ IMPORTANT: Operating Modes

PM2 WebUI now supports two modes:

- **hub**: full web dashboard + local PM2 + remote agent management
- **agent**: token-protected API exposing local PM2 to hub

Security constraints in hub mode:
- Agent token must be at least 24 characters.
- Remote base URL host must be `localhost` or private IPv4.

```
VM1 (hub)  ---> controls local PM2 + VM2 agent + VM3 agent
VM2 (agent) ---> exposes local PM2 via /agent/* with token
VM3 (agent) ---> exposes local PM2 via /agent/* with token
```

For quickest setup, use [QUICK_START.md](QUICK_START.md).

## Installation Approaches

### Approach 1: One Instance Per VM (Recommended for Production)
✅ Install PM2 WebUI on **each VM** that has PM2 processes
✅ Each instance manages only that VM's apps
✅ Access each dashboard separately

**Use this when**: You have separate production/staging/dev environments

### Approach 2: SSH Tunneling (For Remote Access)
✅ Install PM2 WebUI on each VM (same as above)
✅ Use SSH tunnels to access all dashboards from your local machine
✅ No need to open firewall ports

**Use this when**: VMs are not publicly accessible or you want extra security

### Approach 3: Single VM Only
✅ Install PM2 WebUI on one VM
✅ Only manage that VM's processes

**Use this when**: You only have one server to manage

---

## Quick Start (Single VM)

### Prerequisites
- Node.js 14.13.0+ installed
- PM2 installed (`npm install -g pm2`)
- Your Node.js applications already running under PM2

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/inceon/pm2-webui
cd pm2-webui

# 2. Install dependencies
npm install

# 3. Copy environment configuration
cp env.example .env

# 4. Setup admin user
npm run setup-admin-user
# Follow the prompts to create username/password

# 5. Start PM2 WebUI
npm start
```

The web interface will be available at `http://127.0.0.1:4343`

---

## Production Setup: Multiple VMs

### Scenario: 2 VMs with Node.js Applications

```
Your Infrastructure:
┌─────────────────────────────────────────────────────────────┐
│  VM1 (192.168.1.10) - Production                           │
│  Running: API Server, Worker, WebSocket Server (all PM2)   │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  VM2 (192.168.1.20) - Staging                              │
│  Running: API Server, Background Jobs (all PM2)            │
└─────────────────────────────────────────────────────────────┘
```

### Step-by-Step Installation

#### Prerequisites (on EACH VM)
- ✅ Node.js 14.13.0+ installed
- ✅ PM2 installed globally (`npm install -g pm2`)
- ✅ Your applications already running via PM2 (`pm2 list` shows your apps)

---

#### Step 1: Install on VM1 (Production)

```bash
# SSH into VM1
ssh user@192.168.1.10

# Navigate to installation directory (can be anywhere)
cd /opt  # or /home/user or wherever you prefer

# Clone repository
git clone https://github.com/inceon/pm2-webui
cd pm2-webui

# Install dependencies
npm install

# Configure environment
cp env.example .env
nano .env
```

**Edit `.env` file on VM1:**
```bash
# IMPORTANT: Set to 0.0.0.0 to allow access from your network
HOST=0.0.0.0

# Default port
PORT=4343

# HTTPS (optional, but recommended for production)
HTTPS_ENABLED=false
# HTTPS_KEY_PATH=/path/to/ssl/key.pem
# HTTPS_CERT_PATH=/path/to/ssl/cert.pem
```

```bash
# Create admin user
npm run setup-admin-user
# Enter username (e.g., "admin")
# Enter password (strong password with symbols, uppercase, numbers)
# Confirm

# Start PM2 WebUI using PM2 (so it auto-restarts)
pm2 start src/app.js --name pm2-webui
pm2 save
pm2 startup  # Enable auto-start on boot
```

**Test VM1 installation:**
```bash
# From VM1
curl http://localhost:4343

# From your local machine (if firewall allows)
# Open browser: http://192.168.1.10:4343
```

---

#### Step 2: Install on VM2 (Staging)

```bash
# SSH into VM2
ssh user@192.168.1.20

# Repeat EXACT same steps as VM1
cd /opt
git clone https://github.com/inceon/pm2-webui
cd pm2-webui
npm install
cp env.example .env
nano .env  # Set HOST=0.0.0.0
npm run setup-admin-user  # Can use same or different credentials
pm2 start src/app.js --name pm2-webui
pm2 save
pm2 startup
```

---

#### Step 3: Configure Firewall (Important!)

**On VM1:**
```bash
# Option A: Allow from specific IPs only (recommended)
sudo ufw allow from YOUR_IP_ADDRESS to any port 4343
sudo ufw allow from YOUR_OFFICE_NETWORK/24 to any port 4343

# Option B: Allow from anywhere (less secure)
sudo ufw allow 4343

# Check status
sudo ufw status
```

**On VM2:**
```bash
# Same as VM1
sudo ufw allow from YOUR_IP_ADDRESS to any port 4343
sudo ufw status
```

---

#### Step 4: Access Your Dashboards

**Bookmark these URLs:**
- 📊 **Production (VM1)**: `http://192.168.1.10:4343`
- 📊 **Staging (VM2)**: `http://192.168.1.20:4343`

**Login** with the admin credentials you created.

**What you'll see:**
- VM1 dashboard shows ONLY VM1's PM2 apps
- VM2 dashboard shows ONLY VM2's PM2 apps

---

### Verification Checklist

After installation, verify everything works:

**On VM1:**
```bash
# 1. Check PM2 WebUI is running
pm2 list
# Should show "pm2-webui" as "online"

# 2. Check port is listening
sudo netstat -tulpn | grep 4343
# Should show node listening on port 4343

# 3. Check your apps are visible
curl http://localhost:4343/api/apps
# Should return JSON with your apps (after login)

# 4. Check logs if issues
pm2 logs pm2-webui
```

**On VM2:**
```bash
# Same checks as VM1
pm2 list
sudo netstat -tulpn | grep 4343
pm2 logs pm2-webui
```

---

### Important Notes

#### 🔴 Common Mistake:
**DO NOT install PM2 WebUI on a 3rd VM and expect it to manage VM1 and VM2.**

Each VM needs its own PM2 WebUI installation.

#### ✅ Correct Setup:
```
VM1 → PM2 WebUI on VM1 → Manages VM1 apps ✓
VM2 → PM2 WebUI on VM2 → Manages VM2 apps ✓
```

#### ❌ Incorrect Setup:
```
VM3 → PM2 WebUI on VM3 → Cannot manage VM1 or VM2 ✗
```

#### 💡 Why?
PM2 WebUI uses the local PM2 API (`pm2.connect()`) which only works on the same machine. It's not designed for remote connections.

#### 🔒 Security:
- Each dashboard has its own authentication
- Use different passwords for production vs staging
- Consider HTTPS for production (see HTTPS section below)
- Restrict firewall access to trusted IPs only

---

### Method 2: Central Dashboard with SSH Tunneling

Run PM2 WebUI on your local machine and use SSH tunnels to access each VM's PM2.

#### On Your Local Machine:

```bash
# Terminal 1 - Tunnel to VM1
ssh -L 4343:localhost:4343 user@192.168.1.10

# Terminal 2 - Tunnel to VM2
ssh -L 4344:localhost:4343 user@192.168.1.20
```

#### On Each VM:
```bash
# Install and run PM2 WebUI locally
cd ~/pm2-webui
npm install
cp env.example .env
npm run setup-admin-user
npm start
```

#### Access from Local Machine:
- VM1: `http://localhost:4343`
- VM2: `http://localhost:4344`

---

### Method 3: Nginx Reverse Proxy (Production Setup)

Use Nginx as a reverse proxy to access multiple PM2 WebUI instances from a single domain.

#### Nginx Configuration:

```nginx
# /etc/nginx/sites-available/pm2-webui

server {
    listen 80;
    server_name pm2.yourdomain.com;

    # VM1 - Production
    location /vm1/ {
        proxy_pass http://192.168.1.10:4343/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # VM2 - Staging
    location /vm2/ {
        proxy_pass http://192.168.1.20:4343/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/pm2-webui /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Access:
- VM1: `http://pm2.yourdomain.com/vm1`
- VM2: `http://pm2.yourdomain.com/vm2`

---

## Configuration Options

### Environment Variables (.env)

```bash
# Network Configuration
HOST=127.0.0.1          # 0.0.0.0 for external access
PORT=4343               # Web interface port

# HTTPS Configuration (Optional)
HTTPS_ENABLED=false
HTTPS_KEY_PATH=/path/to/private.key
HTTPS_CERT_PATH=/path/to/certificate.crt

# Authentication (Set via npm run setup-admin-user)
APP_USERNAME=admin
APP_PASSWORD=<bcrypt_hashed_password>
APP_SESSION_SECRET=<auto_generated>

# Features
SHOW_GIT_INFO=false     # Show git branch/commit info
SHOW_ENV_FILE=false     # Show environment variables

# Telegram Bot (Optional)
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
```

---

## Security Best Practices

### 1. Use HTTPS in Production

```bash
# Generate self-signed certificate (development)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Update .env
HTTPS_ENABLED=true
HTTPS_KEY_PATH=/path/to/key.pem
HTTPS_CERT_PATH=/path/to/cert.pem
```

### 2. Firewall Rules

Only allow trusted IPs to access the web interface:

```bash
# UFW (Ubuntu)
sudo ufw allow from 192.168.1.0/24 to any port 4343
sudo ufw deny 4343

# iptables
sudo iptables -A INPUT -p tcp -s 192.168.1.0/24 --dport 4343 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 4343 -j DROP
```

### 3. User Roles

PM2 WebUI supports two roles:

- **admin**: Full access (restart, stop, reload apps)
- **viewer**: Read-only access (view apps and logs only)

```bash
# Add viewer user (after first startup)
# Use the user management API or modify src/config/users.json
{
  "users": [
    {
      "username": "admin",
      "password": "<bcrypt_hash>",
      "role": "admin",
      "createdAt": "2025-10-02T..."
    },
    {
      "username": "developer",
      "password": "<bcrypt_hash>",
      "role": "viewer",
      "createdAt": "2025-10-02T..."
    }
  ]
}
```

### 4. Run as systemd Service

Create `/etc/systemd/system/pm2-webui.service`:

```ini
[Unit]
Description=PM2 Web UI
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/pm2-webui
ExecStart=/usr/bin/node /opt/pm2-webui/src/app.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=pm2-webui

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable pm2-webui
sudo systemctl start pm2-webui
sudo systemctl status pm2-webui
```

---

## Common Use Cases

### Use Case 1: Managing Multiple Apps on One Server

1. Start your Node.js apps with PM2:
```bash
pm2 start app1.js --name "api-server"
pm2 start app2.js --name "worker-service"
pm2 start app3.js --name "websocket-server"
pm2 save
```

2. Access PM2 WebUI at `http://your-server:4343`
3. View all apps, logs, restart/reload as needed

### Use Case 2: Development + Production Separation

**Production VM** (198.51.100.10):
```bash
cd /opt/pm2-webui
nano .env
# HOST=0.0.0.0
# PORT=4343
npm start
```

**Staging VM** (198.51.100.20):
```bash
cd /opt/pm2-webui
nano .env
# HOST=0.0.0.0
# PORT=4343
npm start
```

Bookmark both URLs:
- Production: `http://198.51.100.10:4343`
- Staging: `http://198.51.100.20:4343`

### Use Case 3: Team Access with Different Permissions

1. Create admin account:
```bash
npm run setup-admin-user
# Username: admin
# Password: <strong-password>
```

2. Add viewer accounts by editing `src/config/users.json`:
```json
{
  "users": [
    {
      "username": "admin",
      "password": "$2a$10$...",
      "role": "admin",
      "createdAt": "2025-10-02T10:00:00Z"
    },
    {
      "username": "dev_team",
      "password": "$2a$10$...",
      "role": "viewer",
      "createdAt": "2025-10-02T10:05:00Z"
    }
  ]
}
```

3. Developers log in with `dev_team` account (read-only)
4. DevOps uses `admin` account (full control)

---

## Troubleshooting

### Port Already in Use
```bash
# Find what's using port 4343
sudo lsof -i :4343
# Or
sudo netstat -tulpn | grep 4343

# Kill the process or change PORT in .env
```

### Cannot Connect Remotely
```bash
# Check HOST setting in .env
# Should be 0.0.0.0 not 127.0.0.1

# Check firewall
sudo ufw status
sudo iptables -L -n | grep 4343
```

### PM2 Apps Not Showing
```bash
# Ensure PM2 daemon is running
pm2 list

# Check PM2 WebUI is running as same user as PM2
whoami
ps aux | grep PM2

# PM2 WebUI must run as the same user who started PM2
```

### EACCES: Permission Denied
```bash
# Run as the correct user
sudo -u nodejs npm start

# Or fix permissions
sudo chown -R nodejs:nodejs /opt/pm2-webui
```

---

## Advanced Features

### Telegram Bot Integration

Control PM2 processes and receive crash alerts via Telegram.

#### Setup

1. **Create a bot** via [@BotFather](https://t.me/BotFather) on Telegram
2. **Get your user ID** via [@userinfobot](https://t.me/userinfobot)
3. **Configure `.env`**:
```bash
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ALLOWED_USER_IDS=123456789
```

4. **Restart PM2 WebUI** - the bot will start automatically

#### Available Commands

**Process Management:**

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and command list |
| `/help` | Show all available commands |
| `/status` | List all PM2 processes with status, CPU, memory, uptime |
| `/start_app <name\|id>` | Start a stopped process |
| `/stop_app <name\|id>` | Stop a running process |
| `/restart_app <name\|id>` | Restart a process |
| `/reload_app <name\|id>` | Gracefully reload a process (zero downtime) |

**Git Management:**

| Command | Description |
|---------|-------------|
| `/git_status <name\|id>` | Show git branch and current commit |
| `/git_check <name\|id>` | Check for available updates from remote |
| `/git_pull <name\|id>` | Pull updates from remote repository |

**Examples:**
```
/git_status my-api
/git_check my-api
/git_pull my-api
/reload_app my-api    (after pulling updates)
```

#### Alerts

The bot automatically sends alerts to the first allowed user when:
- 🚨 A process crashes (non-zero exit code)
- 🛑 A process is stopped
- 🔄 A process is restarted
- ✅ A process comes online

#### Git Update Workflow via Telegram

1. Check for updates: `/git_check my-api`
2. If updates available, pull them: `/git_pull my-api`
3. Reload the app to apply changes: `/reload_app my-api`

The bot will show you:
- Current and remote commit hashes
- Number of commits behind
- Success/failure messages with details

#### Security

- Only users listed in `TELEGRAM_ALLOWED_USER_IDS` can use the bot
- Multiple user IDs can be comma-separated
- Unauthorized users receive an "Access denied" message
- Git operations use the server's configured credentials

---

### Viewing Real-time Logs

1. Click on an app name in the dashboard
2. View stdout and stderr logs
3. Logs are paginated (50 lines per page)
4. Scroll to load more

### Git Information

Enable in `.env`:
```bash
SHOW_GIT_INFO=true
```

Shows current branch and commit for each app (if running from a git repo).

### Environment Variables

Enable in `.env`:
```bash
SHOW_ENV_FILE=true
```

View `.env` file contents for each app directory.

---

## Git Update Management

PM2 WebUI can automatically detect and pull updates from git repositories for applications managed by PM2.

### Features

- **Automatic Update Detection**: Checks for new commits on the remote repository
- **Visual Indicators**: Shows update status in the app detail view
- **One-Click Updates**: Pull updates directly from the web interface
- **Commit Tracking**: Displays current and remote commit hashes
- **Admin-Only Access**: Only admin users can pull updates

### How It Works

When viewing an application detail page:

1. **Automatic Check**: PM2 WebUI automatically fetches from the remote and compares commits
2. **Update Alert**: If updates are available, an info alert shows the number of commits behind
3. **Pull Updates**: Click the "Pull Updates" button to execute `git pull`
4. **Confirmation**: A confirmation dialog ensures intentional updates
5. **Result**: After successful pull, the new commit hash is displayed

### Requirements

For the git update feature to work, the application must:

- Be in a git repository with a remote configured
- Have a clean working directory (no uncommitted changes)
- Have proper git credentials configured (for private repositories)

### Usage

#### Viewing Update Status

1. Navigate to any application detail page
2. Look for the git section showing:
   - **Git Branch**: Current branch name (e.g., `master`, `main`)
   - **Git Commit**: Current commit hash (e.g., `0a755e3`)
   - **Update Status**: Alert banner if updates are available

#### Checking for Updates

- **Automatic**: Updates are checked when the page loads
- **Manual**: Click the "Check for Updates" or "Refresh" button

#### Pulling Updates

1. Click the **"Pull Updates"** button in the update alert
2. Confirm the action in the dialog
3. Wait for the pull operation to complete
4. Review the result message
5. **Important**: Restart or reload the application to apply changes

### Example Workflow

**Web UI:**
```bash
# Scenario: You pushed new commits to your app's repository

1. Open PM2 WebUI → Navigate to your app
2. See alert: "2 commits behind"
3. Click "Pull Updates"
4. Confirm the dialog
5. Success message: "Updates pulled successfully! New commit: abc1234"
6. Click "Reload" or "Restart" button to apply changes
```

**Telegram Bot:**
```bash
# Scenario: Manage updates from your phone

1. Send: /git_check my-api
2. Bot replies: "🆕 Updates Available! 2 commits behind"
3. Send: /git_pull my-api
4. Bot replies: "✅ Updates Pulled Successfully! New commit: abc1234"
5. Send: /reload_app my-api
6. Bot replies: "✅ Process reloaded successfully"
```

### Using Telegram Bot for Git Updates

The Telegram bot provides full git management capabilities, perfect for remote administration.

#### Show Git Information

```
/git_status my-api
```

Response:
```
🔀 Git Status for my-api

📌 Branch: main
📝 Commit: 0a755e3

💡 Use /git_check my-api to check for updates
```

#### Check for Updates

```
/git_check my-api
```

Response if updates available:
```
🔀 Update Status for my-api

📝 Current: 0a755e3
📡 Remote: f3d92a1

🆕 Updates Available!
📊 2 commits behind

💡 Use /git_pull my-api to pull updates
```

Response if up-to-date:
```
🔀 Update Status for my-api

📝 Current: f3d92a1
📡 Remote: f3d92a1

✅ Up to date! No updates available.
```

#### Pull Updates

```
/git_pull my-api
```

Success response:
```
✅ Updates Pulled Successfully!

📦 App: my-api
📝 New Commit: f3d92a1

⚠️ Remember to reload the app:
/reload_app my-api
```

Error response:
```
❌ Failed to Pull Updates

📦 App: my-api
⚠️ Failed to pull updates

error: Your local changes to the following files would be overwritten by merge:
...
```

#### Complete Update Flow

1. **Check status**: `/git_check my-api`
2. **Pull updates**: `/git_pull my-api` (if available)
3. **Apply changes**: `/reload_app my-api` (for zero downtime) or `/restart_app my-api`

#### Advantages of Telegram Bot

- ✅ Update apps from anywhere (phone, desktop)
- ✅ No need to access web interface
- ✅ Quick status checks
- ✅ Immediate feedback with detailed messages
- ✅ Same security as web interface (user allowlist)

### API Endpoints

The git update feature exposes these API endpoints:

- `GET /api/apps/:appName/git/check-updates`
  - Check if updates are available
  - Returns update status and commit information
  - Accessible to all authenticated users

- `POST /api/apps/:appName/git/pull`
  - Pull updates from remote repository
  - Returns new commit hash and git output
  - **Admin only** - requires admin role

### Troubleshooting

#### "Unable to check for updates"

- Ensure the application directory is a git repository
- Verify remote is configured: `git remote -v`
- Check network access to git server

#### Pull fails with merge conflicts

- The application has uncommitted local changes
- Resolve manually via SSH: `cd /path/to/app && git status`
- Stash or commit local changes, then try again

#### Authentication errors

For private repositories, configure credentials:

```bash
# SSH (recommended)
git remote set-url origin git@github.com:user/repo.git

# HTTPS with credential helper
git config --global credential.helper store
git pull  # Enter credentials once
```

### Security Considerations

- Only **admin users** can pull updates (viewers cannot)
- CSRF protection is enforced on pull requests
- Git credentials must be configured at OS level
- Consider using SSH keys for authentication

---

## Upgrading PM2 WebUI

```bash
cd pm2-webui
git pull origin main
npm install
pm2 restart pm2-webui  # If running via PM2
# Or
sudo systemctl restart pm2-webui  # If using systemd
```

---

## Support & Contributing

- **Issues**: https://github.com/inceon/pm2-webui/issues
- **Docs**: https://github.com/inceon/pm2-webui
- **License**: MIT

---

## Quick Reference

| Action | Command |
|--------|---------|
| Install | `npm install` |
| Setup Admin | `npm run setup-admin-user` |
| Start (Dev) | `npm run start:dev` |
| Start (Prod) | `npm start` |
| Access Local | `http://localhost:4343` |
| Access Remote | `http://your-server-ip:4343` |
| View Logs | Click app name → View logs tab |
| Restart App | Click app → Restart button |
| Reload App | Click app → Reload button (0 downtime) |
| Stop App | Click app → Stop button |
| Check Updates | App detail page → Auto-check on load |
| Pull Updates | Click "Pull Updates" in update alert (admin only) |

---

## Example Multi-VM Setup

```
                    ┌─────────────────┐
                    │  Your Browser   │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
         ┌──────▼──────┐          ┌──────▼──────┐
         │   VM1:4343  │          │   VM2:4343  │
         │ (Production)│          │  (Staging)  │
         └──────┬──────┘          └──────┬──────┘
                │                        │
         ┌──────▼──────┐          ┌──────▼──────┐
         │ PM2 WebUI   │          │ PM2 WebUI   │
         │   Instance  │          │   Instance  │
         └──────┬──────┘          └──────┬──────┘
                │                        │
         ┌──────▼──────┐          ┌──────▼──────┐
         │    PM2      │          │    PM2      │
         │  Daemon     │          │  Daemon     │
         └──────┬──────┘          └──────┬──────┘
                │                        │
    ┌───────────┴───────────┐   ┌────────┴────────┐
    │                       │   │                 │
┌───▼───┐  ┌───▼───┐  ┌───▼───┐  ┌───▼───┐  ┌───▼───┐
│ App1  │  │ App2  │  │ App3  │  │ App4  │  │ App5  │
└───────┘  └───────┘  └───────┘  └───────┘  └───────┘
```

Each VM runs its own PM2 WebUI instance managing its local PM2 processes.
