import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { requireAuth } from "./middleware/auth.js";
import { createUsersIndex } from "./lib/elasticsearch.js"
import { esClient } from "./lib/elasticsearch.js"
import "dotenv/config"

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[Backend] ${req.method} ${req.path}`);
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/me", requireAuth, (req, res) => {
  console.log("[Backend] GET /api/me ok", { userId: req.userId });
  res.json({ userId: req.userId, email: req.email ?? null });
});

app.post("/api/profile", requireAuth, (req, res) => {
  console.log("[Backend] POST /api/profile ok", { userId: req.userId });
  res.status(200).json({ ok: true, message: "Profile placeholder" });
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

  socket.on("chat:accept", (payload: { fromId: string; toId: string; peerName?: string }) => {
    if (!payload?.fromId || !payload?.toId) return;
    const otherSocketId = userIdToSocketId.get(payload.fromId);
    const thisUserId = socket.data.userId as string | undefined;
    if (!otherSocketId || !thisUserId) return;

    const conversationId =
      [payload.fromId, payload.toId].sort().join(":");

    // Tell the original sender that their request was accepted
    io.to(otherSocketId).emit("chat:accepted", {
      conversationId,
      peerId: payload.toId,
      peerName: payload.peerName ?? "Someone",
    });

    // Tell the accepter too
    socket.emit("chat:accepted", {
      conversationId,
      peerId: payload.fromId,
      peerName: payload.peerName ?? "Someone",
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
/** Last known position per socket (for nearby queries; anonymised, no exact exposure). */
const lastPositionBySocket = new Map<string, { lat: number; lng: number }>();

io.on("connection", (socket) => {
  console.log("[Backend] Socket connected:", socket.id)

  socket.on("location", async (data: { lat: number; lng: number; userId: string }) => {
    if (typeof data?.lat === "number" && typeof data?.lng === "number") {
      lastPositionBySocket.set(socket.id, { lat: data.lat, lng: data.lng })

      // upsert into Elasticsearch
      await esClient.index({
        index: "users",
        id: data.userId,
        document: {
          userId: data.userId,
          location: { lat: data.lat, lon: data.lng },
          updatedAt: new Date().toISOString(),
        },
      })

      // find everyone within 2km
      const nearby = await esClient.search({
        index: "users",
        query: {
          geo_distance: {
            distance: "2km",
            location: { lat: data.lat, lon: data.lng },
          },
        },
      })

      const nearbyUsers = nearby.hits.hits
        .filter(hit => hit._id !== data.userId)
        .map(hit => hit._source)

      socket.emit("nearby_users", nearbyUsers)
    }
  })

  socket.on("disconnect", () => {
    lastPositionBySocket.delete(socket.id)
    console.log("[Backend] Socket disconnected:", socket.id)
  })
})

const PORT = process.env.PORT ?? 3001;

async function start() {
  await createUsersIndex()
  httpServer.listen(PORT, () => {
    console.log("[Backend] Listening on http://localhost:" + PORT)
  })
}

start()


