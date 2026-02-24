import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';
import { encryptText, decryptText } from '../utils/crypto.util.js';
import { generateRandomString } from '../utils/random.util.js';
import { normalizeAndValidateRemoteBaseUrl } from '../utils/network.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REMOTE_SERVERS_FILE = path.join(__dirname, '../config/remote-servers.json');

async function ensureRemoteServersFile() {
    await fs.ensureFile(REMOTE_SERVERS_FILE);
    try {
        const data = await fs.readJson(REMOTE_SERVERS_FILE);
        if (!data || !Array.isArray(data.servers)) {
            await fs.writeJson(REMOTE_SERVERS_FILE, { servers: [] }, { spaces: 2 });
        }
    } catch (_err) {
        await fs.writeJson(REMOTE_SERVERS_FILE, { servers: [] }, { spaces: 2 });
    }
}

function getRemoteTokenSecret() {
    return config.REMOTE_TOKEN_SECRET || config.APP_SESSION_SECRET;
}

function generateServerId(name) {
    const slug = String(name || 'server')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 24) || 'server';

    return `${slug}-${generateRandomString(8).toLowerCase()}`;
}

function sanitizeServerForView(server) {
    return {
        id: server.id,
        name: server.name,
        baseUrl: server.baseUrl,
        createdAt: server.createdAt,
        updatedAt: server.updatedAt
    };
}

async function readRemoteServersRaw() {
    await ensureRemoteServersFile();
    const data = await fs.readJson(REMOTE_SERVERS_FILE);
    return Array.isArray(data.servers) ? data.servers : [];
}

async function writeRemoteServersRaw(servers) {
    await fs.writeJson(REMOTE_SERVERS_FILE, { servers }, { spaces: 2 });
}

async function getRemoteServers() {
    const servers = await readRemoteServersRaw();
    return servers.map(sanitizeServerForView);
}

async function getRemoteServerById(serverId, options = {}) {
    const { withToken = false } = options;
    const servers = await readRemoteServersRaw();
    const server = servers.find(item => item.id === serverId);

    if (!server) {
        return null;
    }

    if (!withToken) {
        return sanitizeServerForView(server);
    }

    const secret = getRemoteTokenSecret();
    if (!secret) {
        throw new Error('Token encryption secret is not configured');
    }

    let token = null;
    if (server.tokenEncrypted) {
        token = decryptText(server.tokenEncrypted, secret);
    }

    return {
        ...sanitizeServerForView(server),
        token
    };
}

async function createRemoteServer({ name, baseUrl, token }) {
    if (!name || typeof name !== 'string' || !name.trim()) {
        throw new Error('Server name is required');
    }

    const sanitizedName = name.trim();
    if (!/^[A-Za-z0-9 _.-]{1,64}$/.test(sanitizedName)) {
        throw new Error('Server name must be 1-64 chars and use letters, numbers, space, dot, underscore or hyphen');
    }

    const sanitizedToken = String(token || '').trim();
    if (!sanitizedToken || sanitizedToken.length < 24) {
        throw new Error('Agent token must be at least 24 characters');
    }

    const normalizedBaseUrl = normalizeAndValidateRemoteBaseUrl(baseUrl);
    const secret = getRemoteTokenSecret();
    if (!secret) {
        throw new Error('Token encryption secret is not configured');
    }

    const servers = await readRemoteServersRaw();

    if (servers.find(item => item.baseUrl === normalizedBaseUrl)) {
        throw new Error('Server with this URL already exists');
    }

    const now = new Date().toISOString();
    const server = {
        id: generateServerId(sanitizedName),
        name: sanitizedName,
        baseUrl: normalizedBaseUrl,
        tokenEncrypted: encryptText(sanitizedToken, secret),
        createdAt: now,
        updatedAt: now
    };

    servers.push(server);
    await writeRemoteServersRaw(servers);
    return sanitizeServerForView(server);
}

async function deleteRemoteServer(serverId) {
    const servers = await readRemoteServersRaw();
    const filtered = servers.filter(item => item.id !== serverId);

    if (filtered.length === servers.length) {
        throw new Error('Server not found');
    }

    await writeRemoteServersRaw(filtered);
    return true;
}

export {
    getRemoteServers,
    getRemoteServerById,
    createRemoteServer,
    deleteRemoteServer,
    normalizeAndValidateRemoteBaseUrl
};
