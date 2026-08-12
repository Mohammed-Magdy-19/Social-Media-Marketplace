// src/server.js
// HTTP server bootstrap + Socket.io attach + DB connect.
// This is the single process entry point — app.js only defines the Express
// app (middleware + routes); this file is responsible for turning it into a
// running server, opening the database connection, and wiring the
// real-time layer described throughout section 2 of the architecture doc
// (the Hybrid Approach: comment/like/follow broadcasts, feed_update_available
// pings, and the fully-socket-only conversation/message events).

// Fail fast and loud if required env vars are missing, before anything else
// in the app tries to use them.
import { env } from './config/env.js';

import { createServer } from 'http';
import app, { set } from './app';
import connectDB from './config/db.js';
import { initSocket } from './config/socket.js';

// -----------------------------------------------------------------------
// Process-level safety nets — catch anything that slips past
// express-async-errors (e.g. errors thrown outside the request/response
// cycle, such as inside a setInterval or a Socket.io event handler that
// isn't itself wrapped).
// -----------------------------------------------------------------------
process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error('UNCAUGHT EXCEPTION — shutting down...');
    // eslint-disable-next-line no-console
    console.error(err.name, err.message, err.stack);
    process.exit(1);
});

const httpServer = createServer(app);

// Attach Socket.io to the same HTTP server so it shares the port and
// (via corsOptions inside config/socket.js) the same origin whitelist as
// the REST API. initSocket() wires connection auth (JWT handshake),
// room-join handlers (post_<id>, feed_<authorId>, user-private rooms for
// notifications/messages), and the transient, never-persisted events
// (typing_comment, typing_message, send_message, etc.) described in the
// architecture doc's Hybrid Approach and section 2.12.
const io = initSocket(httpServer);

// Make the io instance reachable from anywhere that needs to emit a live
// event (controllers/services) without importing server.js and risking a
// circular require — app.set() attaches it to the shared Express app
// instance, retrievable via req.app.get('io').
set('io', io);

let server;

const startServer = async () => {
    // Connect to MongoDB before accepting traffic, so the first request
    // never races an unopened connection.
    await connectDB();

    server = httpServer.listen(env.port, () => {
        // eslint-disable-next-line no-console
        console.log(
            `Server running in ${env.nodeEnv} mode on port ${env.port}`
        );
    });
};

startServer();

// -----------------------------------------------------------------------
// Unhandled promise rejections — anything outside express-async-errors'
// reach (e.g. a rejected promise in a background job) is logged and the
// process is shut down gracefully rather than left in a corrupted state.
// -----------------------------------------------------------------------
process.on('unhandledRejection', (err) => {
    // eslint-disable-next-line no-console
    console.error('UNHANDLED REJECTION — shutting down...');
    // eslint-disable-next-line no-console
    console.error(err.name, err.message, err.stack);

    if (server) {
        server.close(() => process.exit(1));
    } else {
        process.exit(1);
    }
});

// -----------------------------------------------------------------------
// Graceful shutdown on SIGTERM (e.g. from a container orchestrator during
// a deploy) — stop accepting new connections, let in-flight requests
// finish, then exit.
// -----------------------------------------------------------------------
process.on('SIGTERM', () => {
    // eslint-disable-next-line no-console
    console.log('SIGTERM received — shutting down gracefully...');
    if (server) {
        server.close(() => {
            // eslint-disable-next-line no-console
            console.log('Process terminated.');
        });
    }
});

export default httpServer;