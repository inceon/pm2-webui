/**
 * Global error handling middleware for Koa
 * Catches all errors and provides consistent error responses
 */
const errorHandler = async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        const requestId = ctx.state?.requestId || null;
        const errorCode = err.code || err.cause?.code || null;

        // Log error details
        console.error('Error occurred:', {
            requestId,
            message: err.message,
            stack: err.stack,
            cause: err.cause
                ? {
                    name: err.cause.name,
                    message: err.cause.message,
                    code: err.cause.code
                }
                : null,
            path: ctx.path,
            method: ctx.method,
            ip: ctx.ip,
            timestamp: new Date().toISOString()
        });

        // Set status code
        ctx.status = err.status || err.statusCode || 500;

        // Determine if this is an API request
        const isApiRequest = ctx.path.startsWith('/api/') || ctx.path.startsWith('/agent/');
        const isAuthenticatedUser = Boolean(ctx.session?.isAuthenticated);
        const shouldExposeMessage = err.expose === true || ctx.status < 500 || isAuthenticatedUser;
        const message = shouldExposeMessage
            ? (err.message || 'Unknown error')
            : 'Internal server error';

        if (isApiRequest) {
            // API error response
            ctx.body = {
                error: {
                    message,
                    status: ctx.status,
                    requestId,
                    code: errorCode
                }
            };
        } else {
            // For HTML requests, redirect to error page or login
            if (ctx.status === 401 || ctx.status === 403) {
                ctx.redirect('/login');
            } else {
                // Render error page or show generic error
                ctx.body = `
                    <html>
                        <head><title>Error ${ctx.status}</title></head>
                        <body>
                            <h1>Error ${ctx.status}</h1>
                            <p>${message}</p>
                            ${requestId ? `<p>Request ID: <code>${requestId}</code></p>` : ''}
                            <a href="/apps">Go to Dashboard</a>
                        </body>
                    </html>
                `;
            }
        }

        // Emit error event for potential logging services
        ctx.app.emit('error', err, ctx);
    }
};

export default errorHandler;
