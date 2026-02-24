import config from '../config/index.js';

const ALLOWED_ACTIONS = ['reload', 'restart', 'stop'];
const ALLOWED_LOG_TYPES = ['stdout', 'stderr'];

function getRequestTimeoutMs() {
    const timeout = Number(config.REMOTE_SERVER_REQUEST_TIMEOUT_MS);
    return Number.isFinite(timeout) && timeout > 0 ? timeout : 5000;
}

function createAgentRequestError(message, cause = null, statusCode = 502) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.expose = true;
    if (cause?.code) {
        err.code = cause.code;
    }
    if (cause) {
        err.cause = cause;
    }
    return err;
}

function formatFetchFailureMessage(error, targetUrl, timeoutMs) {
    if (error?.name === 'AbortError') {
        return `Timeout after ${timeoutMs}ms while connecting to ${targetUrl.origin}`;
    }

    const code = error?.cause?.code;
    const causeMessage = error?.cause?.message || error?.message || 'Unknown fetch error';

    if (code === 'ECONNREFUSED') {
        return `Connection refused by ${targetUrl.origin}. Ensure agent is running and reachable`;
    }
    if (code === 'ENOTFOUND') {
        return `Cannot resolve host for ${targetUrl.origin}`;
    }
    if (code === 'ETIMEDOUT') {
        return `Connection timed out to ${targetUrl.origin}`;
    }
    if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
        return `Network is unreachable for ${targetUrl.origin}`;
    }
    if (
        code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
        || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
        || code === 'CERT_HAS_EXPIRED'
        || code === 'ERR_TLS_CERT_ALTNAME_INVALID'
    ) {
        return `TLS certificate validation failed for ${targetUrl.origin}. Use a valid certificate or trusted HTTP in private network`;
    }

    return `Failed to reach agent at ${targetUrl.origin}: ${causeMessage}`;
}

async function callAgent(server, { method = 'GET', path, body = null }) {
    if (!server || !server.baseUrl || !server.token) {
        throw createAgentRequestError('Invalid agent server configuration', null, 500);
    }

    const controller = new AbortController();
    const timeoutMs = getRequestTimeoutMs();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const targetUrl = new URL(path, `${server.baseUrl}/`);

    try {
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
            throw createAgentRequestError(
                `Agent ${targetUrl.origin} returned ${response.status}: ${errorMessage}`,
                null,
                502
            );
        }

        return payload;
    } catch (err) {
        if (err?.statusCode) {
            throw err;
        }

        const message = formatFetchFailureMessage(err, targetUrl, timeoutMs);
        throw createAgentRequestError(message, err, 502);
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
