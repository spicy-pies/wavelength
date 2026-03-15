import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { requireAuth } from "./middleware/auth.js";
import { createUsersIndex } from "./lib/elasticsearch.js"
import { esClient } from "./lib/elasticsearch.js"
import { vectoriseInterests } from "./lib/vectorise.js"
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

// receives: userId and sectionData (interests)
// vectorises interests into 20 dimensional cultural taste vector
// saves vector to ElasticSearch using upsert
app.post("/api/profile", async (req, res) => {
  const { userId, sectionData } = req.body
  try {
    const vector = await vectoriseInterests(sectionData)
    await esClient.update({
      index: "users",
      id: userId,
      refresh: "wait_for",
      script: {
        source: "ctx._source.vector = params.vector; ctx._source.updatedAt = params.updatedAt;",
        params: { vector, updatedAt: new Date().toISOString() }
      },
      upsert: { userId, vector, updatedAt: new Date().toISOString() }
    })
    res.json({ ok: true })
  } catch (err) {
    console.error("[Backend] vector save error", err)
    res.status(500).json({ error: "Failed to save vector" })
  }
})

const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000" },
});

// Very small in-memory presence + chat relay layer.
// - register: map an anonymous userId to a socket
// - chat:request: forward a chat request to the target user
// - chat:accept: notify both sides that a conversation is active
// - chat:message: relay messages between two peers (no persistence)
// - location: index position in ES, run kNN+geo nearby query, emit nearby_users

const userIdToSocketId = new Map<string, string>();
/** Last known position per socket (for nearby queries; anonymised, no exact exposure). */
const lastPositionBySocket = new Map<string, { lat: number; lng: number }>();

io.on("connection", (socket) => {
  console.log("[Backend] Socket connected:", socket.id);

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

  socket.on("chat:accept", (payload: { fromId: string; toId: string; conversationId?: string; peerName?: string }) => {
    if (!payload?.fromId || !payload?.toId) return;
    const otherSocketId = userIdToSocketId.get(payload.fromId);
    const thisUserId = socket.data.userId as string | undefined;
    if (!otherSocketId || !thisUserId) return;

    const conversationId =
      payload.conversationId ?? [payload.fromId, payload.toId].sort().join(":");

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

  // Location + kNN matching: index position, run nearby query, emit nearby_users
  socket.on("location", async (data: { lat: number | string; lng: number | string; userId: string }) => {
    const lat = parseFloat(String(data?.lat));
    const lng = parseFloat(String(data?.lng));

    if (!isNaN(lat) && !isNaN(lng) && data.userId) {
      lastPositionBySocket.set(socket.id, { lat, lng });

      const existingDoc = await esClient.search({
        index: "users",
        query: { term: { userId: data.userId } },
        docvalue_fields: [{ field: "vector" }],
        _source: false,
        size: 1,
      }).catch(() => null);

      const hit = existingDoc?.hits?.hits?.[0];
      const existingVector = (hit?.fields as any)?.vector?.[0] ?? null;

      if (!existingVector) {
        console.log("[Backend] no vector yet for", data.userId);
        return;
      }

      await esClient.update({
        index: "users",
        id: data.userId,
        retry_on_conflict: 3,
        doc: {
          location: { lat, lon: lng },
          updatedAt: new Date().toISOString(),
        },
      });

      const nearby = await esClient.search({
        index: "users",
        knn: {
          field: "vector",
          query_vector: existingVector,
          k: 10,
          num_candidates: 50,
          filter: {
            geo_distance: {
              distance: "2km",
              location: { lat, lon: lng },
            },
          },
        },
      });

      const nearbyUsers = nearby.hits.hits
        .filter(hit => hit._id !== data.userId)
        .map(hit => ({
          ...(hit._source as any),
          similarity: hit._score,
        }));

      console.log("[Backend] nearby users found:", nearbyUsers.map((u: any) => ({ id: u.userId, similarity: u.similarity })));
      socket.emit("nearby_users", nearbyUsers);
    }
  });

  socket.on("disconnect", () => {
    const userId = socket.data.userId as string | undefined;
    if (userId) {
      const existing = userIdToSocketId.get(userId);
      if (existing === socket.id) {
        userIdToSocketId.delete(userId);
      }
    }
    lastPositionBySocket.delete(socket.id);
    console.log("[Backend] Socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT ?? 3001;

async function start() {
  await createUsersIndex()
  httpServer.listen(PORT, () => {
    console.log("[Backend] Listening on http://localhost:" + PORT)
  })
}

start()


