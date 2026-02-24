import config from '../config/index.js';

const ALLOWED_ACTIONS = ['reload', 'restart', 'stop'];
const ALLOWED_LOG_TYPES = ['stdout', 'stderr'];

function getRequestTimeoutMs() {
    const timeout = Number(config.REMOTE_SERVER_REQUEST_TIMEOUT_MS);
    return Number.isFinite(timeout) && timeout > 0 ? timeout : 5000;
}

async function callAgent(server, { method = 'GET', path, body = null }) {
    if (!server || !server.baseUrl || !server.token) {
        throw new Error('Invalid agent server configuration');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), getRequestTimeoutMs());

    try {
        const targetUrl = new URL(path, `${server.baseUrl}/`);
        const headers = {
            'Authorization': `Bearer ${server.token}`
        };

        if (body !== null) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(targetUrl, {
            method,
            headers,
            body: body !== null ? JSON.stringify(body) : undefined,
            signal: controller.signal,
            redirect: 'error'
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            const errorMessage = payload?.error?.message || payload?.message || `Agent request failed with status ${response.status}`;
            throw new Error(errorMessage);
        }

        return payload;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function checkAgentHealth(server) {
    return callAgent(server, { path: '/agent/health' });
}

async function listAgentApps(server) {
    const payload = await callAgent(server, { path: '/agent/apps' });
    return Array.isArray(payload.apps) ? payload.apps : [];
}

async function describeAgentApp(server, appName) {
    const payload = await callAgent(server, { path: `/agent/apps/${encodeURIComponent(appName)}` });
    return payload.app || null;
}

async function getAgentLogs(server, appName, logType, nextKey) {
    if (!ALLOWED_LOG_TYPES.includes(logType)) {
        throw new Error('Invalid log type');
    }

    let path = `/agent/apps/${encodeURIComponent(appName)}/logs/${logType}`;
    if (typeof nextKey !== 'undefined' && nextKey !== null && String(nextKey).trim() !== '') {
        path += `?nextKey=${encodeURIComponent(String(nextKey))}`;
    }

    const payload = await callAgent(server, { path });
    return payload.logs || null;
}

async function executeAgentAction(server, appName, action) {
    if (!ALLOWED_ACTIONS.includes(action)) {
        throw new Error('Invalid action');
    }

    return callAgent(server, {
        method: 'POST',
        path: `/agent/apps/${encodeURIComponent(appName)}/${action}`
    });
}

async function clearAgentLogs(server, appName) {
    return callAgent(server, {
        method: 'POST',
        path: `/agent/apps/${encodeURIComponent(appName)}/logs/clear`
    });
}

export {
    checkAgentHealth,
    listAgentApps,
    describeAgentApp,
    getAgentLogs,
    executeAgentAction,
    clearAgentLogs
};
