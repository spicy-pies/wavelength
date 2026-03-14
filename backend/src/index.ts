import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000" },
});

// Very small in-memory presence + chat relay layer.
// - register: map an anonymous userId to a socket
// - chat:request: forward a chat request to the target user
// - chat:accept: notify both sides that a conversation is active
// - chat:message: relay messages between two peers (no persistence)

const userIdToSocketId = new Map<string, string>();

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("register", (payload: { userId: string }) => {
    if (!payload?.userId) return;
    socket.data.userId = payload.userId;
    userIdToSocketId.set(payload.userId, socket.id);
    console.log("Registered user", payload.userId, "->", socket.id);
  });

  socket.on("chat:request", (payload: { fromId: string; toId: string; preview?: string }) => {
    if (!payload?.fromId || !payload?.toId) return;
    const targetSocketId = userIdToSocketId.get(payload.toId);
    if (!targetSocketId) return;

    io.to(targetSocketId).emit("chat:incoming", {
      fromId: payload.fromId,
      preview: payload.preview ?? "",
    });
  });

  socket.on("chat:accept", (payload: { fromId: string; toId: string }) => {
    if (!payload?.fromId || !payload?.toId) return;
    const otherSocketId = userIdToSocketId.get(payload.fromId);
    const thisUserId = socket.data.userId as string | undefined;
    if (!otherSocketId || !thisUserId) return;

    const conversationId =
      [payload.fromId, payload.toId].sort().join(":");

    io.to(otherSocketId).emit("chat:accepted", {
      conversationId,
      peerId: payload.toId,
    });

    socket.emit("chat:accepted", {
      conversationId,
      peerId: payload.fromId,
    });
  });

  socket.on("chat:message", (payload: {
    conversationId: string;
    fromId: string;
    toId: string;
    text: string;
    timestamp: number;
  }) => {
    if (!payload?.conversationId || !payload?.fromId || !payload?.toId || !payload?.text) {
      return;
    }
    const targetSocketId = userIdToSocketId.get(payload.toId);
    if (!targetSocketId) return;

    io.to(targetSocketId).emit("chat:message", payload);
  });

  socket.on("disconnect", () => {
    const userId = socket.data.userId as string | undefined;
    if (userId) {
      const existing = userIdToSocketId.get(userId);
      if (existing === socket.id) {
        userIdToSocketId.delete(userId);
      }
    }
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
