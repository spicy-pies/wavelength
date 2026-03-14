import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { requireAuth } from "./middleware/auth.js";

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ userId: req.userId, email: req.email ?? null });
});

app.post("/api/profile", requireAuth, (_req, res) => {
  res.status(200).json({ ok: true, message: "Profile placeholder" });
});

const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000" },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
