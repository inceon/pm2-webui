import config from '../config/index.js';
import { RateLimit } from 'koa2-ratelimit';
import Router from '@koa/router';
import { listApps, describeApp, reloadApp, restartApp, stopApp, flushLogs } from '../providers/pm2/api.js';
import { validateAdminUser } from '../services/admin.service.js';
import { readLogsReverse } from '../utils/read-logs.util.js';
import { getCurrentGitBranch, getCurrentGitCommit, checkForUpdates, pullUpdates } from '../utils/git.util.js';
import { getEnvFileContent, writeEnvFileContent } from '../utils/env.util.js';
import { isAuthenticated, checkAuthentication } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/role-check.js';
import { requireAgentToken } from '../middlewares/agent-auth.js';
import {
    getRemoteServers,
    getRemoteServerById,
    createRemoteServer,
    deleteRemoteServer,
    normalizeAndValidateRemoteBaseUrl
} from '../services/remote-server.service.js';
import {
    checkAgentHealth,
    listAgentApps,
    describeAgentApp,
    getAgentLogs,
    executeAgentAction,
    clearAgentLogs
} from '../services/agent-client.service.js';
import AnsiConverter from 'ansi-to-html';

const router = new Router();
const ansiConvert = new AnsiConverter({ escapeXML: true });
const LOCAL_SERVER_ID = 'local';
const ALLOWED_ACTIONS = ['reload', 'restart', 'stop'];

const loginRateLimiter = RateLimit.middleware({
    interval: 2 * 60 * 1000,
    max: 100,
    prefixKey: '/login'
});

const agentRateLimiter = RateLimit.middleware({
    interval: 60 * 1000,
    max: 300,
    prefixKey: '/agent'
});

const ensureHubMode = async (ctx, next) => {
    if (config.APP_MODE !== 'hub') {
        ctx.throw(404, 'Route is available only in hub mode');
    }
    await next();
};

const ensureAgentMode = async (ctx, next) => {
    if (config.APP_MODE !== 'agent') {
        ctx.throw(404, 'Route is available only in agent mode');
    }
    await next();
};

const toDashboardApp = (app, server) => ({
    ...app,
    server_id: server.id,
    server_name: server.name,
    app_link: `/apps/${encodeURIComponent(server.id)}/${encodeURIComponent(app.name)}`
});

function sanitizeAgentApp(app) {
    if (!app) {
        return null;
    }

    return {
        name: app.name,
        status: app.status,
        cpu: app.cpu,
        memory: app.memory,
        uptime: app.uptime,
        pm_id: app.pm_id
    };
}

function normalizeLogs(logs) {
    if (!logs) {
        return { lines: '', nextKey: -1 };
    }

    if (Array.isArray(logs.lines)) {
        return {
            ...logs,
            lines: logs.lines.map(line => ansiConvert.toHtml(line)).join('<br/>')
        };
    }

    return {
        ...logs,
        lines: typeof logs.lines === 'string' ? logs.lines : ''
    };
}

function auditLog(ctx, action, details = {}) {
    const user = ctx.session?.user?.username || 'unknown';
    console.log('[AUDIT]', JSON.stringify({
        at: new Date().toISOString(),
        action,
        user,
        ip: ctx.ip,
        ...details
    }));
}

async function resolveServer(serverId) {
    if (!serverId || serverId === LOCAL_SERVER_ID) {
        return {
            id: LOCAL_SERVER_ID,
            name: config.LOCAL_SERVER_NAME,
            isLocal: true
        };
    }

    const remoteServer = await getRemoteServerById(serverId, { withToken: true });
    if (!remoteServer) {
        throw new Error('Server not found');
    }

    return {
        id: remoteServer.id,
        name: remoteServer.name,
        isLocal: false,
        remote: remoteServer
    };
}

async function fetchAppDetailsByServer(server, appName) {
    if (server.isLocal) {
        const app = await describeApp(appName);
        return app ? { ...app } : null;
    }

    const app = await describeAgentApp(server.remote, appName);
    return app ? { ...app } : null;
}

async function fetchLogsByServer(server, appName, logType, nextKey) {
    if (logType !== 'stdout' && logType !== 'stderr') {
        throw new Error('Log type must be stdout or stderr');
    }

    if (server.isLocal) {
        const app = await describeApp(appName);
        if (!app) {
            return null;
        }

        const filePath = logType === 'stdout' ? app.pm_out_log_path : app.pm_err_log_path;
        const logs = await readLogsReverse({ filePath, nextKey });
        return normalizeLogs(logs);
    }

    const logs = await getAgentLogs(server.remote, appName, logType, nextKey);
    return normalizeLogs(logs);
}

async function executeActionByServer(server, appName, action) {
    if (!ALLOWED_ACTIONS.includes(action)) {
        throw new Error('Invalid action');
    }

    if (server.isLocal) {
        const actionMap = {
            reload: reloadApp,
            restart: restartApp,
            stop: stopApp
        };

        const result = await actionMap[action](appName);
        return Array.isArray(result) && result.length > 0;
    }

    const payload = await executeAgentAction(server.remote, appName, action);
    return payload?.success !== false;
}

async function clearLogsByServer(server, appName) {
    if (server.isLocal) {
        await flushLogs(appName);
        return true;
    }

    const payload = await clearAgentLogs(server.remote, appName);
    return payload?.success !== false;
}

router.get('/', async (ctx) => {
    if (config.APP_MODE === 'agent') {
        ctx.body = { mode: 'agent', message: 'PM2 WebUI agent is running' };
        return;
    }

    return ctx.redirect('/login');
});

router.get('/login', ensureHubMode, loginRateLimiter, checkAuthentication, async (ctx) => {
    return await ctx.render('auth/login', {
        layout: false,
        login: { username: '', password: '', error: null },
        csrf: ctx.state._csrf
    });
});

router.post('/login', ensureHubMode, loginRateLimiter, checkAuthentication, async (ctx) => {
    const { username, password } = ctx.request.body;
    try {
        const user = await validateAdminUser(username, password);
        ctx.session.isAuthenticated = true;
        ctx.session.user = user;
        return ctx.redirect('/apps');
    } catch (err) {
        return await ctx.render('auth/login', {
            layout: false,
            login: { username, password, error: err.message },
            csrf: ctx.state._csrf
        });
    }
});

router.get('/logout', ensureHubMode, (ctx) => {
    ctx.session = null;
    return ctx.redirect('/login');
});

router.get('/apps', ensureHubMode, isAuthenticated, async (ctx) => {
    const apps = [];
    const serverErrors = [];

    const localServer = { id: LOCAL_SERVER_ID, name: config.LOCAL_SERVER_NAME };
    try {
        const localApps = await listApps();
        apps.push(...localApps.map(app => toDashboardApp(app, localServer)));
    } catch (err) {
        serverErrors.push({
            id: LOCAL_SERVER_ID,
            name: config.LOCAL_SERVER_NAME,
            error: err.message
        });
    }

    const remoteServers = await getRemoteServers();
    const remoteChecks = await Promise.allSettled(remoteServers.map(async (server) => {
        const withToken = await getRemoteServerById(server.id, { withToken: true });
        const health = await checkAgentHealth(withToken);
        const remoteApps = await listAgentApps(withToken);
        return {
            server,
            health,
            apps: remoteApps
        };
    }));

    const remoteStatuses = remoteServers.map((server) => ({
        id: server.id,
        name: server.name,
        baseUrl: server.baseUrl,
        online: false,
        statusMessage: 'Unreachable'
    }));

    remoteChecks.forEach((result, index) => {
        const server = remoteServers[index];
        if (result.status === 'fulfilled') {
            const remoteServer = result.value.server;
            const remoteApps = result.value.apps || [];
            apps.push(...remoteApps.map(app => toDashboardApp(app, remoteServer)));

            const statusIndex = remoteStatuses.findIndex(s => s.id === remoteServer.id);
            if (statusIndex >= 0) {
                remoteStatuses[statusIndex].online = true;
                remoteStatuses[statusIndex].statusMessage = 'Online';
            }
            return;
        }

        serverErrors.push({
            id: server.id,
            name: server.name,
            error: result.reason?.message || 'Unable to reach agent'
        });
    });

    apps.sort((a, b) => {
        if (a.server_name === b.server_name) {
            return a.name.localeCompare(b.name);
        }
        return a.server_name.localeCompare(b.server_name);
    });

    return await ctx.render('apps/dashboard', {
        apps,
        remoteServers: remoteStatuses,
        serverErrors,
        isAdmin: ctx.session?.user?.role === 'admin',
        csrf: ctx.state._csrf
    });
});

router.get('/apps/:serverId/:appName', ensureHubMode, isAuthenticated, async (ctx) => {
    try {
        const { serverId, appName } = ctx.params;
        const server = await resolveServer(serverId);
        const app = await fetchAppDetailsByServer(server, appName);

        if (!app) {
            return ctx.redirect('/apps');
        }

        const stdout = await fetchLogsByServer(server, appName, 'stdout');
        const stderr = await fetchLogsByServer(server, appName, 'stderr');

        const canShowGit = server.isLocal && config.SHOW_GIT_INFO;
        const canManageEnv = server.isLocal && config.SHOW_ENV_FILE;

        if (server.isLocal && canShowGit) {
            app.git_branch = await getCurrentGitBranch(app.pm2_env_cwd);
            app.git_commit = await getCurrentGitCommit(app.pm2_env_cwd);
            app.git_update_status = await checkForUpdates(app.pm2_env_cwd);
        }

        if (server.isLocal && canManageEnv) {
            app.env_file = await getEnvFileContent(app.pm2_env_cwd);
        }

        app.server_id = server.id;
        app.server_name = server.name;

        return await ctx.render('apps/app', {
            app,
            logs: {
                stdout: stdout || { lines: '', nextKey: -1 },
                stderr: stderr || { lines: '', nextKey: -1 }
            },
            server,
            supportsRealtime: server.isLocal,
            canManageEnv,
            canManageGit: canShowGit,
            apiBasePath: `/api/servers/${encodeURIComponent(server.id)}/apps/${encodeURIComponent(app.name)}`,
            csrf: ctx.state._csrf
        });
    } catch (err) {
        console.error('Failed to fetch app details:', err);
        throw err;
    }
});

// Backward compatibility: local app route
router.get('/apps/:appName', ensureHubMode, isAuthenticated, async (ctx) => {
    const { appName } = ctx.params;
    return ctx.redirect(`/apps/${LOCAL_SERVER_ID}/${encodeURIComponent(appName)}`);
});

router.get('/api/servers', ensureHubMode, isAuthenticated, async (ctx) => {
    const servers = await getRemoteServers();
    const checks = await Promise.allSettled(servers.map(async (server) => {
        const withToken = await getRemoteServerById(server.id, { withToken: true });
        await checkAgentHealth(withToken);
        return { id: server.id, online: true, statusMessage: 'Online' };
    }));

    const statusById = {};
    checks.forEach((result, idx) => {
        const id = servers[idx].id;
        if (result.status === 'fulfilled') {
            statusById[id] = result.value;
        } else {
            statusById[id] = {
                id,
                online: false,
                statusMessage: result.reason?.message || 'Unreachable'
            };
        }
    });

    ctx.body = {
        servers: servers.map(server => ({
            ...server,
            ...statusById[server.id]
        }))
    };
});

router.post('/api/servers', ensureHubMode, isAuthenticated, requireRole('admin'), async (ctx) => {
    const { name, baseUrl, token } = ctx.request.body || {};
    if (!name || !baseUrl || !token) {
        ctx.throw(400, 'name, baseUrl and token are required');
    }
    if (String(token).trim().length < 24) {
        ctx.throw(400, 'Agent token must be at least 24 characters');
    }

    const normalizedBaseUrl = normalizeAndValidateRemoteBaseUrl(baseUrl);

    // Validate connectivity before persisting.
    await checkAgentHealth({
        name,
        baseUrl: normalizedBaseUrl,
        token
    });

    const server = await createRemoteServer({ name, baseUrl: normalizedBaseUrl, token });
    auditLog(ctx, 'server.add', { serverId: server.id, serverName: server.name, baseUrl: server.baseUrl });
    ctx.body = { success: true, server };
});

router.delete('/api/servers/:serverId', ensureHubMode, isAuthenticated, requireRole('admin'), async (ctx) => {
    const { serverId } = ctx.params;
    const server = await getRemoteServerById(serverId, { withToken: false });
    await deleteRemoteServer(serverId);
    auditLog(ctx, 'server.delete', { serverId, serverName: server?.name || 'unknown' });
    ctx.body = { success: true };
});

router.get('/api/servers/:serverId/apps/:appName/logs/:logType', ensureHubMode, isAuthenticated, async (ctx) => {
    const { serverId, appName, logType } = ctx.params;
    const { nextKey } = ctx.query;

    const server = await resolveServer(serverId);
    const logs = await fetchLogsByServer(server, appName, logType, nextKey);
    if (!logs) {
        ctx.throw(404, 'App not found');
    }

    ctx.body = { logs };
});

router.post('/api/servers/:serverId/apps/:appName/:action', ensureHubMode, isAuthenticated, requireRole('admin'), async (ctx) => {
    const { serverId, appName, action } = ctx.params;
    if (!ALLOWED_ACTIONS.includes(action)) {
        ctx.throw(400, 'Invalid action');
    }

    const server = await resolveServer(serverId);
    const success = await executeActionByServer(server, appName, action);
    auditLog(ctx, 'app.action', { serverId: server.id, serverName: server.name, appName, action, success });
    ctx.body = success
        ? { success: true }
        : { success: false, message: `Failed to ${action} app` };
});

router.post('/api/servers/:serverId/apps/:appName/logs/clear', ensureHubMode, isAuthenticated, requireRole('admin'), async (ctx) => {
    const { serverId, appName } = ctx.params;
    const server = await resolveServer(serverId);
    const success = await clearLogsByServer(server, appName);
    auditLog(ctx, 'app.logs.clear', { serverId: server.id, serverName: server.name, appName, success });
    ctx.body = success
        ? { success: true, message: 'Logs cleared successfully' }
        : { success: false, message: 'Failed to clear logs' };
});

// Backward compatibility: local app API routes
router.get('/api/apps/:appName/logs/:logType', ensureHubMode, isAuthenticated, async (ctx) => {
    const { appName, logType } = ctx.params;
    const { nextKey } = ctx.query;

    const server = { id: LOCAL_SERVER_ID, name: config.LOCAL_SERVER_NAME, isLocal: true };
    const logs = await fetchLogsByServer(server, appName, logType, nextKey);
    if (!logs) {
        ctx.throw(404, 'App not found');
    }
    ctx.body = { logs };
});

router.post('/api/apps/:appName/reload', ensureHubMode, isAuthenticated, requireRole('admin'), async (ctx) => {
    const success = await executeActionByServer({ id: LOCAL_SERVER_ID, name: config.LOCAL_SERVER_NAME, isLocal: true }, ctx.params.appName, 'reload');
    ctx.body = success ? { success: true } : { success: false, message: 'Failed to reload app' };
});

router.post('/api/apps/:appName/restart', ensureHubMode, isAuthenticated, requireRole('admin'), async (ctx) => {
    const success = await executeActionByServer({ id: LOCAL_SERVER_ID, name: config.LOCAL_SERVER_NAME, isLocal: true }, ctx.params.appName, 'restart');
    ctx.body = success ? { success: true } : { success: false, message: 'Failed to restart app' };
});

router.post('/api/apps/:appName/stop', ensureHubMode, isAuthenticated, requireRole('admin'), async (ctx) => {
    const success = await executeActionByServer({ id: LOCAL_SERVER_ID, name: config.LOCAL_SERVER_NAME, isLocal: true }, ctx.params.appName, 'stop');
    ctx.body = success ? { success: true } : { success: false, message: 'Failed to stop app' };
});

router.get('/api/apps/:appName/logs/:logType/stream', ensureHubMode, isAuthenticated, async (ctx) => {
    try {
        const { appName, logType } = ctx.params;

        if (logType !== 'stdout' && logType !== 'stderr') {
            ctx.throw(400, 'Log type must be stdout or stderr');
        }

        const app = await describeApp(appName);
        if (!app) {
            ctx.throw(404, 'App not found');
        }

        const filePath = logType === 'stdout' ? app.pm_out_log_path : app.pm_err_log_path;
        ctx.request.socket.setTimeout(0);
        ctx.req.socket.setNoDelay(true);
        ctx.req.socket.setKeepAlive(true);
        ctx.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        ctx.status = 200;

        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        const es = require('event-stream');
        const fs = require('fs-extra');

        const stream = fs.createReadStream(filePath, {
            encoding: 'utf-8',
            start: Math.max(0, (await fs.stat(filePath)).size - 10000)
        });

        ctx.body = stream.pipe(es.split()).pipe(es.map((line, cb) => {
            if (!line) {
                cb();
                return;
            }
            const html = ansiConvert.toHtml(line);
            cb(null, `data: ${JSON.stringify({ line: html })}\n\n`);
        }));

        const watcher = fs.watch(filePath, (eventType) => {
            if (eventType === 'change') {
                ctx.res.write(': ping\n\n');
            }
        });

        ctx.req.on('close', () => {
            watcher.close();
        });
    } catch (err) {
        console.error('Failed to stream logs:', err);
        throw err;
    }
});

router.post('/api/apps/:appName/env', ensureHubMode, isAuthenticated, requireRole('admin'), async (ctx) => {
    try {
        const { appName } = ctx.params;
        const { envContent } = ctx.request.body;

        if (!appName) {
            ctx.throw(400, 'App name is required');
        }

        if (typeof envContent !== 'string') {
            ctx.throw(400, 'Environment content must be a string');
        }

        const app = await describeApp(appName);

        if (!app) {
            ctx.throw(404, 'App not found');
        }

        await writeEnvFileContent(app.pm2_env_cwd, envContent);
        ctx.body = { success: true, message: 'Environment file saved successfully' };
    } catch (err) {
        console.error('Failed to save env file:', err);
        ctx.body = { success: false, message: err.message };
    }
});

router.get('/api/apps/:appName/git/check-updates', ensureHubMode, isAuthenticated, async (ctx) => {
    try {
        const { appName } = ctx.params;
        const app = await describeApp(appName);

        if (!app) {
            ctx.throw(404, 'App not found');
        }

        const updateStatus = await checkForUpdates(app.pm2_env_cwd);
        ctx.body = { success: true, updateStatus };
    } catch (err) {
        console.error('Failed to check for updates:', err);
        ctx.body = { success: false, message: err.message };
    }
});

router.post('/api/apps/:appName/git/pull', ensureHubMode, isAuthenticated, requireRole('admin'), async (ctx) => {
    try {
        const { appName } = ctx.params;
        const app = await describeApp(appName);
        if (!app) {
            ctx.throw(404, 'App not found');
        }

        const result = await pullUpdates(app.pm2_env_cwd);
        if (result.success) {
            const newCommit = await getCurrentGitCommit(app.pm2_env_cwd);
            ctx.body = {
                success: true,
                message: result.message,
                output: result.output,
                newCommit
            };
            return;
        }

        ctx.body = {
            success: false,
            message: result.message,
            error: result.error,
            output: result.output
        };
    } catch (err) {
        console.error('Failed to pull updates:', err);
        ctx.body = { success: false, message: err.message };
    }
});

router.post('/api/apps/:appName/logs/clear', ensureHubMode, isAuthenticated, requireRole('admin'), async (ctx) => {
    try {
        await flushLogs(ctx.params.appName);
        ctx.body = { success: true, message: 'Logs cleared successfully' };
    } catch (err) {
        console.error('Failed to clear logs:', err);
        ctx.body = { success: false, message: err.message };
    }
});

// Agent API
router.get('/agent/health', ensureAgentMode, agentRateLimiter, requireAgentToken, async (ctx) => {
    ctx.body = {
        success: true,
        mode: 'agent',
        hostname: config.LOCAL_SERVER_NAME,
        timestamp: new Date().toISOString()
    };
});

router.get('/agent/apps', ensureAgentMode, agentRateLimiter, requireAgentToken, async (ctx) => {
    const apps = await listApps();
    ctx.body = {
        success: true,
        apps: apps.map(sanitizeAgentApp)
    };
});

router.get('/agent/apps/:appName', ensureAgentMode, agentRateLimiter, requireAgentToken, async (ctx) => {
    const app = await describeApp(ctx.params.appName);
    if (!app) {
        ctx.throw(404, 'App not found');
    }

    ctx.body = {
        success: true,
        app: sanitizeAgentApp(app)
    };
});

router.get('/agent/apps/:appName/logs/:logType', ensureAgentMode, agentRateLimiter, requireAgentToken, async (ctx) => {
    const { appName, logType } = ctx.params;
    const { nextKey } = ctx.query;
    const app = await describeApp(appName);

    if (!app) {
        ctx.throw(404, 'App not found');
    }

    if (logType !== 'stdout' && logType !== 'stderr') {
        ctx.throw(400, 'Log type must be stdout or stderr');
    }

    const filePath = logType === 'stdout' ? app.pm_out_log_path : app.pm_err_log_path;
    const logs = await readLogsReverse({ filePath, nextKey });
    ctx.body = {
        success: true,
        logs: normalizeLogs(logs)
    };
});

router.post('/agent/apps/:appName/:action', ensureAgentMode, agentRateLimiter, requireAgentToken, async (ctx) => {
    const { appName, action } = ctx.params;
    if (!ALLOWED_ACTIONS.includes(action)) {
        ctx.throw(400, 'Invalid action');
    }

    const success = await executeActionByServer({ isLocal: true }, appName, action);
    ctx.body = success ? { success: true } : { success: false, message: `Failed to ${action} app` };
});

router.post('/agent/apps/:appName/logs/clear', ensureAgentMode, agentRateLimiter, requireAgentToken, async (ctx) => {
    await flushLogs(ctx.params.appName);
    ctx.body = { success: true, message: 'Logs cleared successfully' };
});

export default router;
