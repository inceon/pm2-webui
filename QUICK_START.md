# PM2 WebUI Multi-VM Quick Start (Hub + Agent)

This setup gives you one dashboard on VM1 that controls PM2 on VM1, VM2 and VM3.

## 1) VM1 as Hub (web dashboard)

```bash
git clone https://github.com/inceon/pm2-webui
cd pm2-webui
npm install
cp env.example .env
```

Set hub env in `.env`:

```bash
APP_MODE=hub
HOST=0.0.0.0
PORT=4343
LOCAL_SERVER_NAME=vm1
```

Create login user and start:

```bash
npm run setup-admin-user
npm start
```

Open: `http://VM1_IP:4343`

## 2) VM2 / VM3 as Agents

Run the same install steps on each agent VM and set:

```bash
APP_MODE=agent
HOST=0.0.0.0
PORT=4343
LOCAL_SERVER_NAME=vm2   # use vm3 on VM3
AGENT_API_TOKEN=<LONG_RANDOM_TOKEN_32+>
```

Start on each agent:

```bash
npm start
```

## 3) Connect Agents from Hub UI

In VM1 dashboard:
1. Open `Remote Agents`.
2. Add server:
   - `Server name`: `vm2` / `vm3`
   - `Base URL`: `http://VM2_PRIVATE_IP:4343` / `http://VM3_PRIVATE_IP:4343`
   - `Agent token`: matching `AGENT_API_TOKEN`
3. Save.

Now VM1 dashboard shows apps from all connected servers, and actions (`reload/restart/stop`) work from one place.

## Security Checklist

- Keep agent VMs private; do not expose agent endpoints publicly.
- Allow port `4343` on VM2/VM3 only from VM1 IP.
- Use long unique token per agent.
- Prefer HTTPS between hub and agents when possible.
- Hub accepts `localhost` or private IPv4 agent hosts only.

## Notes

- Realtime SSE log streaming is local (hub VM) only in this MVP.
- Remote app detail supports logs and process actions.
