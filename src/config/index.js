import dotenv from 'dotenv';
dotenv.config();

const config = {
    APP_MODE: process.env.APP_MODE === 'agent' ? 'agent' : 'hub',
    HOST: process.env.HOST || '127.0.0.1',
    PORT: process.env.PORT || 4343,
    APP_DIR: process.cwd(),
    APP_SESSION_SECRET: process.env.APP_SESSION_SECRET || null,
    APP_USERNAME: process.env.APP_USERNAME || null,
    APP_PASSWORD: process.env.APP_PASSWORD || null,
    SHOW_GIT_INFO: process.env.SHOW_GIT_INFO === 'true',
    SHOW_ENV_FILE: process.env.SHOW_ENV_FILE === 'true',
    LOCAL_SERVER_NAME: process.env.LOCAL_SERVER_NAME || 'local',
    AGENT_API_TOKEN: process.env.AGENT_API_TOKEN || null,
    REMOTE_SERVER_REQUEST_TIMEOUT_MS: Number(process.env.REMOTE_SERVER_REQUEST_TIMEOUT_MS || 5000),
    REMOTE_TOKEN_SECRET: process.env.REMOTE_TOKEN_SECRET || null,
    HTTPS_ENABLED: process.env.HTTPS_ENABLED === 'true',
    HTTPS_KEY_PATH: process.env.HTTPS_KEY_PATH || null,
    HTTPS_CERT_PATH: process.env.HTTPS_CERT_PATH || null,
    // Telegram Bot Configuration
    TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED === 'true',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || null,
    TELEGRAM_ALLOWED_USER_IDS: process.env.TELEGRAM_ALLOWED_USER_IDS
        ? process.env.TELEGRAM_ALLOWED_USER_IDS.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id))
        : [],
    DEFAULTS: {
        LINES_PER_REQUEST: 50,
        BCRYPT_HASH_ROUNDS: 10,
    }
};

export default config;
