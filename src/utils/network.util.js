function isValidIPv4(hostname) {
    const parts = String(hostname || '').split('.');
    if (parts.length !== 4) {
        return false;
    }

    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) {
            return false;
        }
        const value = Number(part);
        if (value < 0 || value > 255) {
            return false;
        }
    }

    return true;
}

function isPrivateIPv4(hostname) {
    if (!isValidIPv4(hostname)) {
        return false;
    }

    const [a, b] = hostname.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
}

function normalizeAndValidateRemoteBaseUrl(url) {
    if (typeof url !== 'string' || !url.trim()) {
        throw new Error('Base URL is required');
    }

    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Base URL must use http or https');
    }

    if (parsed.username || parsed.password) {
        throw new Error('Base URL must not include credentials');
    }

    if (parsed.search || parsed.hash) {
        throw new Error('Base URL must not include query or hash');
    }

    // Restrict remote targets to local/private endpoints to reduce SSRF blast radius.
    const hostname = parsed.hostname.toLowerCase();
    const isLocalhost = hostname === 'localhost';
    if (!isLocalhost && !isPrivateIPv4(hostname)) {
        throw new Error('Base URL host must be localhost or a private IPv4 address');
    }

    if (parsed.pathname && parsed.pathname !== '/') {
        throw new Error('Base URL path must be root');
    }

    return `${parsed.protocol}//${parsed.host}`;
}

export { normalizeAndValidateRemoteBaseUrl };
