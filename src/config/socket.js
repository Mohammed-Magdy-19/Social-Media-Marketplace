import { Server } from "socket.io";
import AppError from "../utils/AppError.js";

let io;

/**
 * Initializes the Socket.io server and attaches it to the existing HTTP server.
 * Call this once from server.js, right after the HTTP server is created.
 *
 * Usage in server.js:
 *   import http from "http";
 *   import app from "./app.js";
 *   import { initSocket } from "./config/socket.js";
 *
 *   const server = http.createServer(app);
 *   initSocket(server);
 *   server.listen(env.port);
 */
export const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || "*",
            credentials: true,
        },
    });

    io.on("connection", (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        // ---- Room joins (client tells the server which rooms it cares about) ----

        // Join a single post's room to receive live comment/like updates
        // while that post is open on screen.
        socket.on("join_post_room", (postId) => {
            socket.join(`post_${postId}`);
        });

        socket.on("leave_post_room", (postId) => {
            socket.leave(`post_${postId}`);
        });

        // Join the user's own private room to receive personal notifications
        // (new follower, new like, new comment, new message) wherever they are
        // in the app. Call this right after the client authenticates.
        socket.on("register_user", (userId) => {
            socket.join(`user_${userId}`);
        });

        // Join a "feed" room per followed account, used to receive the
        // lightweight fan-out signal (feed_update_available) instead of a
        // per-follower database write when that account publishes a new post.
        socket.on("register_following_rooms", (followingIds = []) => {
            followingIds.forEach((id) => socket.join(`feed_${id}`));
        });

        // ---- Chat-only transient events (never touch MongoDB) ----

        socket.on("join_conversation", (conversationId) => {
            socket.join(`conversation_${conversationId}`);
        });

        socket.on("typing_message", ({ conversationId, userId }) => {
            socket.to(`conversation_${conversationId}`).emit("typing_message", { userId });
        });

        socket.on("stop_typing_message", ({ conversationId, userId }) => {
            socket.to(`conversation_${conversationId}`).emit("stop_typing_message", { userId });
        });

        socket.on("typing_comment", ({ postId, userId }) => {
            socket.to(`post_${postId}`).emit("typing_comment", { userId });
        });

        socket.on("stop_typing_comment", ({ postId, userId }) => {
            socket.to(`post_${postId}`).emit("stop_typing_comment", { userId });
        });

        socket.on("disconnect", () => {
            console.log(`Socket disconnected: ${socket.id}`);
        });
    });

    return io;
};

/**
 * Returns the initialized Socket.io instance so controllers/services can
 * emit events after a successful database write, e.g.:
 *
 *   import { getIO } from "../config/socket.js";
 *   getIO().to(`post_${postId}`).emit("comment_created", newComment);
 *
 * Throws if called before initSocket() has run, so a missing wire-up fails
 * loudly at the call site instead of silently doing nothing.
 */
export const getIO = () => {
    if (!io) {
        throw new AppError("Socket.io not initialized. Call initSocket(server) first.", 500);
    }
    return io;
};