import config from '../config/index.js';
import crypto from 'crypto';

function parseBearerToken(authorizationHeader) {
    if (!authorizationHeader || typeof authorizationHeader !== 'string') {
        return null;
    }

    const [scheme, token] = authorizationHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return null;
    }

    return token.trim();
}

function safeEquals(left, right) {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

const requireAgentToken = async (ctx, next) => {
    if (config.APP_MODE !== 'agent') {
        ctx.throw(404, 'Agent API is available only in agent mode');
    }

    if (!config.AGENT_API_TOKEN || String(config.AGENT_API_TOKEN).length < 24) {
        ctx.throw(503, 'Agent token is not configured');
    }

    const token = parseBearerToken(ctx.headers.authorization);
    if (!token || !safeEquals(token, config.AGENT_API_TOKEN)) {
        ctx.throw(401, 'Invalid agent token');
    }

    await next();
};

export { requireAgentToken };
