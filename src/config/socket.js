import { Server } from "socket.io";
import AppError from "../utils/AppError.js";
import { verifyToken } from "../utils/generateToken.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";

let io;

/**
 * Extracts the access token from a Socket.io handshake, mirroring
 * auth.middleware.js's `protect` — checks the `auth.token` payload the
 * client sends on `io(url, { auth: { token } })` first, then falls back
 * to an `accessToken` cookie for clients that rely on cookie transport.
 */
const extractToken = (socket) => {
    const authToken = socket.handshake.auth?.token;
    if (authToken) return authToken;

    const cookieHeader = socket.handshake.headers?.cookie;
    if (!cookieHeader) return null;

    const match = cookieHeader.match(/(?:^|;\s*)accessToken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
};

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

    /**
     * Handshake authentication middleware — runs once per connection
     * attempt, before the "connection" event fires, exactly like
     * `protect` gates REST requests. This is the fix for the previous
     * design, where `register_user(userId)` let any connected client
     * join ANY user's personal notification room by simply claiming
     * that id, with nothing checked server-side.
     *
     * On success, `socket.userId` is set from the verified token and is
     * the ONLY source of identity used anywhere below — never trust an
     * id sent in an event payload for anything identity-related again.
     */
    io.use(async (socket, next) => {
        try {
            const token = extractToken(socket);
            if (!token) {
                return next(new Error("Authentication required."));
            }

            let decoded;
            try {
                decoded = verifyToken(token);
            } catch (err) {
                if (err.name === "TokenExpiredError") {
                    return next(new Error("Session expired."));
                }
                return next(new Error("Invalid authentication token."));
            }

            const user = await User.findById(decoded.id);
            if (!user) {
                return next(new Error("The user belonging to this token no longer exists."));
            }
            if (user.status === "banned") {
                return next(new Error("This account has been banned. Access denied."));
            }
            if (user.status === "suspended") {
                return next(new Error("This account is currently suspended."));
            }

            socket.userId = String(user._id);
            next();
        } catch (err) {
            next(new Error("Socket authentication failed."));
        }
    });

    io.on("connection", (socket) => {
        console.log(`Socket connected: ${socket.id} (user ${socket.userId})`);

        // Personal notification room is now joined automatically from the
        // verified handshake identity — no client emit required, and
        // nothing client-supplied is trusted. This also fixes the room
        // surviving reconnects "for free," since this join runs inside
        // the connection handler itself and re-fires on every reconnect.
        socket.join(`user_${socket.userId}`);

        // ---- Room joins (client tells the server which rooms it cares about) ----

        // Join a single post's room to receive live comment/like updates
        // while that post is open on screen.
        socket.on("join_post_room", (postId) => {
            socket.join(`post_${postId}`);
        });

        socket.on("leave_post_room", (postId) => {
            socket.leave(`post_${postId}`);
        });

        // Kept as a deliberate no-op for backward compatibility with any
        // client still emitting this — identity is established at the
        // handshake now (see io.use above), so any id sent here is
        // ignored rather than trusted. Safe to delete entirely once all
        // clients are updated to rely on the automatic join above.
        socket.on("register_user", () => {
            // no-op — see io.use() handshake middleware
        });

        // Join a "feed" room per followed account, used to receive the
        // lightweight fan-out signal (feed_update_available) instead of a
        // per-follower database write when that account publishes a new post.
        // This one legitimately stays client-driven: the list of accounts
        // a user follows is arbitrary, non-identity data, not something
        // the handshake can derive on its own.
        socket.on("register_following_rooms", (followingIds = []) => {
            followingIds.forEach((id) => socket.join(`feed_${id}`));
        });

        // ---- Chat events ----
        socket.on("join_conversation", (data) => {
            const conversationId = typeof data === "string" ? data : data?.conversationId;
            if (conversationId) {
                socket.join(`conversation_${conversationId}`);
            }
        });

        socket.on("leave_conversation", (data) => {
            const conversationId = typeof data === "string" ? data : data?.conversationId;
            if (conversationId) {
                socket.leave(`conversation_${conversationId}`);
            }
        });

        // Handle sending a chat message over Socket.io
        socket.on("send_message", async (data) => {
            try {
                const { conversationId, body, text, clientMessageId } = data || {};
                const messageText = (body || text || "").trim();
                if (!conversationId || !messageText) return;

                const conversation = await Conversation.findById(conversationId);
                if (!conversation) return;

                const isParticipant = conversation.participants.some(
                    (p) => String(p) === String(socket.userId)
                );
                if (!isParticipant) return;

                const message = await Message.create({
                    conversation: conversationId,
                    sender: socket.userId,
                    text: messageText,
                });

                conversation.lastMessage = message._id;
                await conversation.save();

                await message.populate("sender", "username avatar");

                const payload = {
                    id: String(message._id),
                    _id: String(message._id),
                    messageId: String(message._id),
                    conversation: String(conversationId),
                    conversationId: String(conversationId),
                    sender: {
                        id: String(socket.userId),
                        _id: String(socket.userId),
                        username: message.sender?.username || "User",
                        avatar: message.sender?.avatar || null,
                    },
                    senderId: String(socket.userId),
                    body: message.text,
                    text: message.text,
                    createdAt: message.createdAt.toISOString(),
                    clientMessageId: clientMessageId || null,
                    status: "delivered",
                };

                // Broadcast to everyone in the conversation room (including sender so client gets echo)
                io.to(`conversation_${conversationId}`).emit("receive_message", payload);

                // Also notify other participants' user rooms to update their unread message badges/preview
                for (const participantId of conversation.participants) {
                    if (String(participantId) !== String(socket.userId)) {
                        io.to(`user_${participantId}`).emit("new_message", payload);
                    }
                }
            } catch (err) {
                console.error("send_message socket error:", err);
            }
        });

        // Server-trusted userId (socket.userId) is used here instead of a
        // client-supplied one, so a typing indicator can't be spoofed as
        // coming from a different user than the one actually connected.
        socket.on("typing_message", (data) => {
            const conversationId = typeof data === "string" ? data : data?.conversationId;
            if (conversationId) {
                socket.to(`conversation_${conversationId}`).emit("typing_message", { conversationId, userId: socket.userId });
            }
        });

        socket.on("stop_typing_message", (data) => {
            const conversationId = typeof data === "string" ? data : data?.conversationId;
            if (conversationId) {
                socket.to(`conversation_${conversationId}`).emit("stop_typing_message", { conversationId, userId: socket.userId });
            }
        });

        socket.on("typing_comment", ({ postId }) => {
            socket.to(`post_${postId}`).emit("typing_comment", { userId: socket.userId });
        });

        socket.on("stop_typing_comment", ({ postId }) => {
            socket.to(`post_${postId}`).emit("stop_typing_comment", { userId: socket.userId });
        });

        socket.on("disconnect", () => {
            console.log(`Socket disconnected: ${socket.id} (user ${socket.userId})`);
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