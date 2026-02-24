// Get CSRF token from meta tag
function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
}

async function pm2AppAction(appName, action){
    let serverId = 'local';
    let targetAppName = appName;
    let targetAction = action;

    // New signature: pm2AppAction(serverId, appName, action)
    if (arguments.length === 3) {
        serverId = arguments[0] || 'local';
        targetAppName = arguments[1];
        targetAction = arguments[2];
    }

    const csrfToken = getCsrfToken();
    const headers = {
        'Content-Type': 'application/json'
    };

    if (csrfToken) {
        headers['csrf-token'] = csrfToken;
    }

    const response = await fetch(`/api/servers/${encodeURIComponent(serverId)}/apps/${encodeURIComponent(targetAppName)}/${targetAction}`, {
        method: 'POST',
        headers: headers
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = data?.error?.message || data?.message || 'Action failed';
        alert(message);
        return;
    }

    location.reload();
}
