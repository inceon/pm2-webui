# PM2 WebUI Hub + Agent Setup (Single UI for 3 VMs)

This guide is only for the new multi-VM mode:
- `hub` on VM1 (central UI)
- `agent` on VM2 and VM3 (remote PM2 control endpoints)

After setup, you open VM1 UI and control PM2 processes on all three machines.

---

## Architecture

- **VM1**: PM2 WebUI in `APP_MODE=hub`
- **VM2**: PM2 WebUI in `APP_MODE=agent`
- **VM3**: PM2 WebUI in `APP_MODE=agent`

Hub calls each agent over HTTP/HTTPS using bearer token auth.

---

## Prerequisites (all VMs)

1. Node.js installed
2. PM2 installed globally
3. Target applications already running under PM2

Example check:

```bash
node -v
pm2 -v
pm2 list
```

---

## Step 1: Configure VM1 as Hub

```bash
git clone https://github.com/inceon/pm2-webui
cd pm2-webui
npm install
cp env.example .env
```

Set `.env` on VM1:

```env
APP_MODE=hub
HOST=0.0.0.0
PORT=4343
LOCAL_SERVER_NAME=vm1

# Optional dedicated encryption secret for saved remote tokens
REMOTE_TOKEN_SECRET=replace_with_long_random_secret
```

Create admin user and start:

```bash
npm run setup-admin-user
npm start
```

Open: `http://VM1_IP:4343`

---

## Step 2: Configure VM2 as Agent

```bash
git clone https://github.com/inceon/pm2-webui
cd pm2-webui
npm install
cp env.example .env
```

Set `.env` on VM2:

```env
APP_MODE=agent
HOST=0.0.0.0
PORT=4343
LOCAL_SERVER_NAME=vm2
AGENT_API_TOKEN=replace_with_long_random_token_min_24_chars
```

Start:

```bash
npm start
```

---

## Step 3: Configure VM3 as Agent

Same steps as VM2, but use:

```env
LOCAL_SERVER_NAME=vm3
AGENT_API_TOKEN=another_long_random_token_min_24_chars
```

---

## Step 4: Add VM2 and VM3 in Hub UI

In VM1 dashboard:

1. Open `Remote Agents`
2. Add VM2:
   - Server name: `vm2`
   - Base URL: `http://<VM2_PRIVATE_IP>:4343`
   - Agent token: VM2 `AGENT_API_TOKEN`
3. Add VM3:
   - Server name: `vm3`
   - Base URL: `http://<VM3_PRIVATE_IP>:4343`
   - Agent token: VM3 `AGENT_API_TOKEN`

You should now see apps from local + both remote servers on one dashboard.

---

## Security Requirements

1. Agent token must be at least 24 chars (recommend 32+ random chars).
2. Use private network IPs only.
3. Firewall VM2/VM3 port `4343` to allow **only VM1 IP**.
4. Prefer HTTPS between hub and agents if available.
5. Use different tokens per agent.

Implementation constraints in app:
- Hub accepts only `localhost` or private IPv4 for agent base URL.
- Agent endpoints are bearer-token protected and rate-limited.

---

## Operations

From hub you can:
- View app status/uptime/cpu/memory across servers
- Run `reload`, `restart`, `stop` across servers
- Open app page and read logs

Local-only features (hub machine):
- Git update actions
- Env file edit
- Realtime SSE log stream

---

## Production Run (recommended)

Run PM2 WebUI itself under PM2 on each VM:

```bash
pm2 start src/app.js --name pm2-webui
pm2 save
pm2 startup
```

---

## Troubleshooting

### Remote server shows offline

1. Check VM2/VM3 process:
```bash
pm2 logs pm2-webui
```
2. Verify token in hub matches agent `.env`.
3. Verify firewall allows VM1 -> VM2/VM3 port `4343`.
4. Verify URL uses private IPv4 and no extra path.

### Add server fails immediately

Likely validation failure:
- Host not private IPv4/localhost
- Token too short
- URL contains unsupported path/query/hash

