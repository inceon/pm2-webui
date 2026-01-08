import TelegramBot from 'node-telegram-bot-api';
import pm2 from 'pm2';
import config from '../config/index.js';
import { listApps, restartApp, stopApp, reloadApp } from '../providers/pm2/api.js';

let bot = null;
let pm2Bus = null;

/**
 * Check if user is in the allowlist
 */
function isAllowedUser(userId) {
    if (config.TELEGRAM_ALLOWED_USER_IDS.length === 0) {
        return true; // No allowlist configured, allow all
    }
    return config.TELEGRAM_ALLOWED_USER_IDS.includes(userId);
}

/**
 * Get the first allowed user ID for sending alerts
 */
function getAlertChatId() {
    if (config.TELEGRAM_ALLOWED_USER_IDS.length > 0) {
        return config.TELEGRAM_ALLOWED_USER_IDS[0];
    }
    return null;
}

/**
 * Send alert message to the first allowed user
 */
async function sendAlert(message) {
    const chatId = getAlertChatId();
    if (bot && chatId) {
        try {
            await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
        } catch (err) {
            console.error('[Telegram] Failed to send alert:', err.message);
        }
    }
}

/**
 * Format apps list for Telegram message
 */
function formatAppsList(apps) {
    if (!apps || apps.length === 0) {
        return '📭 No PM2 processes found.';
    }

    const statusEmoji = {
        online: '🟢',
        stopping: '🟡',
        stopped: '🔴',
        errored: '❌',
        launching: '🔵'
    };

    let message = '📊 <b>PM2 Process Status</b>\n\n';
    apps.forEach(app => {
        const emoji = statusEmoji[app.status] || '⚪';
        message += `${emoji} <b>${app.name}</b> (ID: ${app.pm_id})\n`;
        message += `   Status: ${app.status}\n`;
        message += `   CPU: ${app.cpu}% | Memory: ${app.memory}\n`;
        message += `   Uptime: ${app.uptime}\n\n`;
    });

    return message;
}

/**
 * Start PM2 process by name or ID
 */
function startApp(process) {
    return new Promise((resolve, reject) => {
        pm2.connect((err) => {
            if (err) {
                reject(err);
                return;
            }
            // PM2 restart on a stopped process will start it
            pm2.restart(process, (err, proc) => {
                pm2.disconnect();
                if (err) {
                    reject(err);
                    return;
                }
                resolve(proc);
            });
        });
    });
}

/**
 * Subscribe to PM2 bus events for crash/restart alerts
 */
function subscribeToPm2Bus() {
    pm2.connect((err) => {
        if (err) {
            console.error('[Telegram] Failed to connect to PM2 for bus events:', err.message);
            return;
        }

        pm2.launchBus((err, bus) => {
            if (err) {
                console.error('[Telegram] Failed to launch PM2 bus:', err.message);
                pm2.disconnect();
                return;
            }

            pm2Bus = bus;
            console.log('[Telegram] Subscribed to PM2 bus events for alerts');

            bus.on('process:event', (data) => {
                const { event, process: proc } = data;
                const appName = proc?.name || 'Unknown';
                const timestamp = new Date().toLocaleString();

                let alertMessage = null;

                switch (event) {
                    case 'exit':
                        // Check if it's an unexpected exit (crash)
                        if (proc.exit_code !== 0) {
                            alertMessage = `🚨 <b>Process Crashed</b>\n\n` +
                                `📦 App: <b>${appName}</b>\n` +
                                `❌ Exit Code: ${proc.exit_code}\n` +
                                `🕐 Time: ${timestamp}`;
                        }
                        break;
                    case 'stop':
                        alertMessage = `🛑 <b>Process Stopped</b>\n\n` +
                            `📦 App: <b>${appName}</b>\n` +
                            `🕐 Time: ${timestamp}`;
                        break;
                    case 'restart':
                        alertMessage = `🔄 <b>Process Restarted</b>\n\n` +
                            `📦 App: <b>${appName}</b>\n` +
                            `🕐 Time: ${timestamp}`;
                        break;
                    case 'online':
                        alertMessage = `✅ <b>Process Online</b>\n\n` +
                            `📦 App: <b>${appName}</b>\n` +
                            `🕐 Time: ${timestamp}`;
                        break;
                }

                if (alertMessage) {
                    sendAlert(alertMessage);
                }
            });

            // Handle errors on the bus
            bus.on('error', (err) => {
                console.error('[Telegram] PM2 bus error:', err.message);
            });
        });
    });
}

/**
 * Initialize and start the Telegram bot
 */
function startTelegramBot() {
    if (!config.TELEGRAM_ENABLED) {
        console.log('[Telegram] Bot is disabled, skipping Telegram integration');
        return null;
    }

    if (!config.TELEGRAM_BOT_TOKEN) {
        console.log('[Telegram] Bot token not configured, skipping Telegram integration');
        return null;
    }

    try {
        bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });
        console.log('[Telegram] Bot started successfully');

        // Middleware: Check if user is allowed
        const checkAccess = (msg) => {
            const userId = msg.from.id;
            if (!isAllowedUser(userId)) {
                bot.sendMessage(msg.chat.id, '⛔ Access denied. You are not authorized to use this bot.');
                console.log(`[Telegram] Unauthorized access attempt from user ID: ${userId}`);
                return false;
            }
            return true;
        };

        // /start command
        bot.onText(/\/start/, (msg) => {
            if (!checkAccess(msg)) return;

            const welcomeMessage = `👋 <b>Welcome to PM2 WebUI Bot!</b>\n\n` +
                `Use this bot to monitor and control your PM2 processes.\n\n` +
                `<b>Available Commands:</b>\n` +
                `/status - List all PM2 processes\n` +
                `/start_app &lt;name|id&gt; - Start a process\n` +
                `/stop_app &lt;name|id&gt; - Stop a process\n` +
                `/restart_app &lt;name|id&gt; - Restart a process\n` +
                `/reload_app &lt;name|id&gt; - Reload a process\n` +
                `/help - Show this help message`;

            bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'HTML' });
        });

        // /help command
        bot.onText(/\/help/, (msg) => {
            if (!checkAccess(msg)) return;

            const helpMessage = `📚 <b>PM2 WebUI Bot Help</b>\n\n` +
                `<b>Commands:</b>\n\n` +
                `/status - Show status of all PM2 processes\n\n` +
                `/start_app &lt;name|id&gt; - Start a stopped process\n` +
                `  Example: /start_app my-api\n\n` +
                `/stop_app &lt;name|id&gt; - Stop a running process\n` +
                `  Example: /stop_app 0\n\n` +
                `/restart_app &lt;name|id&gt; - Restart a process\n` +
                `  Example: /restart_app my-api\n\n` +
                `/reload_app &lt;name|id&gt; - Gracefully reload a process\n` +
                `  Example: /reload_app my-api\n\n` +
                `💡 You can use either the process name or its PM2 ID.`;

            bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'HTML' });
        });

        // /status command
        bot.onText(/\/status/, async (msg) => {
            if (!checkAccess(msg)) return;

            try {
                const apps = await listApps();
                const message = formatAppsList(apps);
                bot.sendMessage(msg.chat.id, message, { parse_mode: 'HTML' });
            } catch (err) {
                bot.sendMessage(msg.chat.id, `❌ Failed to get status: ${err.message}`);
            }
        });

        // /start_app command
        bot.onText(/\/start_app(?:\s+(.+))?/, async (msg, match) => {
            if (!checkAccess(msg)) return;

            const processName = match[1]?.trim();
            if (!processName) {
                bot.sendMessage(msg.chat.id, '⚠️ Please provide a process name or ID.\nUsage: /start_app <name|id>');
                return;
            }

            try {
                await startApp(processName);
                bot.sendMessage(msg.chat.id, `✅ Process <b>${processName}</b> started successfully.`, { parse_mode: 'HTML' });
            } catch (err) {
                bot.sendMessage(msg.chat.id, `❌ Failed to start <b>${processName}</b>: ${err.message}`, { parse_mode: 'HTML' });
            }
        });

        // /stop_app command
        bot.onText(/\/stop_app(?:\s+(.+))?/, async (msg, match) => {
            if (!checkAccess(msg)) return;

            const processName = match[1]?.trim();
            if (!processName) {
                bot.sendMessage(msg.chat.id, '⚠️ Please provide a process name or ID.\nUsage: /stop_app <name|id>');
                return;
            }

            try {
                await stopApp(processName);
                bot.sendMessage(msg.chat.id, `✅ Process <b>${processName}</b> stopped successfully.`, { parse_mode: 'HTML' });
            } catch (err) {
                bot.sendMessage(msg.chat.id, `❌ Failed to stop <b>${processName}</b>: ${err.message}`, { parse_mode: 'HTML' });
            }
        });

        // /restart_app command
        bot.onText(/\/restart_app(?:\s+(.+))?/, async (msg, match) => {
            if (!checkAccess(msg)) return;

            const processName = match[1]?.trim();
            if (!processName) {
                bot.sendMessage(msg.chat.id, '⚠️ Please provide a process name or ID.\nUsage: /restart_app <name|id>');
                return;
            }

            try {
                await restartApp(processName);
                bot.sendMessage(msg.chat.id, `✅ Process <b>${processName}</b> restarted successfully.`, { parse_mode: 'HTML' });
            } catch (err) {
                bot.sendMessage(msg.chat.id, `❌ Failed to restart <b>${processName}</b>: ${err.message}`, { parse_mode: 'HTML' });
            }
        });

        // /reload_app command
        bot.onText(/\/reload_app(?:\s+(.+))?/, async (msg, match) => {
            if (!checkAccess(msg)) return;

            const processName = match[1]?.trim();
            if (!processName) {
                bot.sendMessage(msg.chat.id, '⚠️ Please provide a process name or ID.\nUsage: /reload_app <name|id>');
                return;
            }

            try {
                await reloadApp(processName);
                bot.sendMessage(msg.chat.id, `✅ Process <b>${processName}</b> reloaded successfully.`, { parse_mode: 'HTML' });
            } catch (err) {
                bot.sendMessage(msg.chat.id, `❌ Failed to reload <b>${processName}</b>: ${err.message}`, { parse_mode: 'HTML' });
            }
        });

        // Handle polling errors
        bot.on('polling_error', (err) => {
            console.error('[Telegram] Polling error:', err.message);
        });

        // Subscribe to PM2 bus for alerts
        subscribeToPm2Bus();

        return bot;
    } catch (err) {
        console.error('[Telegram] Failed to start bot:', err.message);
        return null;
    }
}

/**
 * Stop the Telegram bot and cleanup
 */
function stopTelegramBot() {
    if (bot) {
        bot.stopPolling();
        bot = null;
        console.log('[Telegram] Bot stopped');
    }
    if (pm2Bus) {
        pm2Bus.close();
        pm2Bus = null;
    }
}

export { startTelegramBot, stopTelegramBot, sendAlert };
