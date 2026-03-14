"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { io, Socket } from "socket.io-client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NearbyUser {
  uid: string;
  similarity: number;
  lat: number;
  lng: number;
  sharedInterests: string[];
  name?: string;
}

// ─── HARDCODED CENTER (Sydney CBD) ───────────────────────────────────────────
const HARDCODED_CENTER = { lat: -33.8688, lng: 151.2093 };

// ─── HARDCODED NEARBY USERS — spread across ~2 km radius ────────────────────
const HARDCODED_USERS: NearbyUser[] = [
  { uid: "user-1", similarity: 0.88, lat: -33.8565, lng: 151.2050, sharedInterests: ["Radiohead", "Elden Ring", "Succession"] },
  { uid: "user-2", similarity: 0.72, lat: -33.8720, lng: 151.1900, sharedInterests: ["Bon Iver", "Hollow Knight", "The Bear"] },
  { uid: "user-3", similarity: 0.81, lat: -33.8580, lng: 151.2240, sharedInterests: ["Frank Ocean", "Disco Elysium", "Fleabag"] },
  { uid: "user-4", similarity: 0.10, lat: -33.8830, lng: 151.2180, sharedInterests: ["Tame Impala", "Stardew Valley", "Atlanta"] },
  { uid: "user-5", similarity: 0.69, lat: -33.8650, lng: 151.1950, sharedInterests: ["Mitski", "Hades", "Severance"] },
  { uid: "user-6", similarity: 0.46, lat: -33.8810, lng: 151.1980, sharedInterests: ["James Blake", "Celeste", "Skins"] },
  { uid: "user-7", similarity: 0.63, lat: -33.8770, lng: 151.2230, sharedInterests: ["FKA Twigs", "Outer Wilds", "Twin Peaks"] },
];

type ChatMessage = {
  conversationId: string;
  fromId: string;
  toId: string;
  text: string;
  timestamp: number;
};

type IncomingRequest = {
  fromId: string;
  preview?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function similarityToColor(score: number): { fill: string; glow: string; text: string } {
  if (score >= 0.85) return { fill: "#C0392B", glow: "rgba(192,57,43,0.35)",   text: "#fff" };
  if (score >= 0.70) return { fill: "#E05B4B", glow: "rgba(224,91,75,0.30)",   text: "#fff" };
  if (score >= 0.55) return { fill: "#EF8C7E", glow: "rgba(239,140,126,0.25)", text: "#fff" };
  if (score >= 0.40) return { fill: "#F5B8B0", glow: "rgba(245,184,176,0.20)", text: "#9a3a30" };
  return                     { fill: "#FAD7D3", glow: "rgba(250,215,211,0.15)", text: "#b05048" };
}

const HEART_SIZE_BASE = 56;
const HEART_SIZE_MAX = 80;

// ─── Heart marker ────────────────────────────────────────────────────────────
// Uses heart-3d.png from public/. CSS filter: low % = paler, high % = brighter.
//   Low compatibility  → very desaturated + dimmer = pale, washed-out pink
//   High compatibility → saturated + brighter = vivid, strong red

function buildCuteHeart(_fill: string, _glow: string, _textColor: string, pct: number, index: number): string {
  const delay = (index * 0.4) % 2.8;
  const score01 = pct / 100;
  const size = Math.round(HEART_SIZE_BASE + score01 * (HEART_SIZE_MAX - HEART_SIZE_BASE));

  const saturate = (0.1 + score01 * 1.25).toFixed(2);   // 0.1 (pale) → 1.35 (vivid)
  const brightness = (0.82 + score01 * 0.32).toFixed(2); // 0.82 (dimmer) → 1.14 (brighter)

  return `
    <div class="wl-heart" style="
      position:relative;
      width:${size}px;height:${size}px;
      cursor:pointer;
      animation: wl-float ${2.5 + (index % 3) * 0.3}s ease-in-out ${delay}s infinite;
    ">
      <img
        src="/heart-3d.png"
        width="${size}" height="${size}"
        draggable="false"
        style="
          display:block;
          width:${size}px;height:${size}px;
          object-fit:contain;
          filter:
            saturate(${saturate})
            brightness(${brightness})
            drop-shadow(0 3px 8px rgba(120,20,20,0.2));
        "
      />
      <div style="
        position:absolute;inset:0;
        display:flex;align-items:center;justify-content:center;
        padding-bottom:2px;
        font-family:'DM Sans',system-ui,sans-serif;
        font-size:${Math.round(size * 0.22)}px;
        font-weight:700;
        color:white;
        text-shadow:0 1px 3px rgba(0,0,0,0.4);
        pointer-events:none;
      ">${pct}%</div>
    </div>
  `;
}

// ─── Inject animation keyframes once ─────────────────────────────────────────
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes wl-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }
    .wl-heart img {
      transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1);
    }
    .wl-heart:hover img {
      transform: scale(1.08);
    }
    .leaflet-marker-icon.leaflet-wavelength-heart {
      width: ${HEART_SIZE_MAX}px !important;
      height: ${HEART_SIZE_MAX}px !important;
      margin-left: -${HEART_SIZE_MAX / 2}px !important;
      margin-top: -${HEART_SIZE_MAX / 2}px !important;
    }
    .leaflet-marker-icon.leaflet-wavelength-heart.wl-heart-selected .wl-heart {
      box-shadow: 0 0 0 6px rgba(192,57,43,0.14), 0 10px 26px rgba(0,0,0,0.22);
      border-radius: 50%;
    }
    .leaflet-marker-icon.leaflet-wavelength-heart.wl-heart-selected .wl-heart img {
      transform: scale(1.12);
    }
  `;
  document.head.appendChild(s);
}

// ─── Compute thread as lat/lng points (cubic Bézier in geo-space) ────────────

function computeThreadPoints(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  index: number
): [number, number][] {
  const dLat = toLat - fromLat;
  const dLng = toLng - fromLng;

  const laterals = [0.30, -0.22, 0.42, -0.38, 0.18, -0.48, 0.35];
  const sags     = [0.35, 0.28, 0.40, 0.32, 0.25, 0.38, 0.30];
  const lateral = laterals[index % laterals.length];
  const sag = sags[index % sags.length];

  const perpLat = -dLng;
  const perpLng = dLat;

  const cp1Lat = fromLat + dLat * 0.30 + perpLat * lateral + Math.abs(dLat + dLng) * sag * 0.5;
  const cp1Lng = fromLng + dLng * 0.30 + perpLng * lateral;

  const cp2Lat = fromLat + dLat * 0.70 + perpLat * lateral * 0.4 + Math.abs(dLat + dLng) * sag * 0.25;
  const cp2Lng = fromLng + dLng * 0.70 + perpLng * lateral * 0.4;

  const pts: [number, number][] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    pts.push([
      u*u*u*fromLat + 3*u*u*t*cp1Lat + 3*u*t*t*cp2Lat + t*t*t*toLat,
      u*u*u*fromLng + 3*u*u*t*cp1Lng + 3*u*t*t*cp2Lng + t*t*t*toLng,
    ]);
  }
  return pts;
}

// ─── Profile Popup ────────────────────────────────────────────────────────────

function ProfilePopup({ user, onClose, onChat }: {
  user: NearbyUser;
  onClose: () => void;
  onChat: (uid: string) => void;
}) {
  const pct = Math.round(user.similarity * 100);
  const { fill } = similarityToColor(user.similarity);

  return (
    <div style={{
      position: "absolute", bottom: 24, left: "50%",
      transform: "translateX(-50%)", width: 300,
      background: "white", borderRadius: 20,
      boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
      padding: "20px 20px 16px", zIndex: 1000,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <button onClick={onClose} style={{
        position: "absolute", top: 12, right: 14,
        background: "none", border: "none", fontSize: 18,
        color: "#aaa", cursor: "pointer", lineHeight: 1,
      }}>×</button>

      <div style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "#FFF5F4", border: "1px solid #FFD5CF",
        borderRadius: 99, padding: "3px 10px",
        fontSize: 11, color: "#C0392B", fontWeight: 600,
        marginBottom: 12, letterSpacing: "0.03em",
      }}>
        <span style={{ fontSize: 10 }}>✦</span> MUTUAL VIBES ONLY
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
          <svg width={56} height={56} viewBox="0 0 56 56">
            <circle cx={28} cy={28} r={22} fill="none" stroke="#FDE8E6" strokeWidth={5} />
            <circle cx={28} cy={28} r={22} fill="none" stroke={fill} strokeWidth={5}
              strokeDasharray={`${2 * Math.PI * 22}`}
              strokeDashoffset={`${2 * Math.PI * 22 * (1 - user.similarity)}`}
              strokeLinecap="round" transform="rotate(-90 28 28)"
            />
          </svg>
          <span style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: fill,
          }}>{pct}%</span>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 2 }}>
            {pct >= 80 ? "Strong match" : pct >= 60 ? "Good match" : "Possible match"}
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>
            {user.name ?? "Someone nearby"}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#aaa", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 6 }}>
          BOTH INTO
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {user.sharedInterests.map(tag => (
            <span key={tag} style={{
              background: "#FFF5F4", color: "#C0392B",
              border: "1px solid #FFD5CF", borderRadius: 99,
              padding: "3px 10px", fontSize: 12, fontWeight: 500,
            }}>{tag}</span>
          ))}
        </div>
      </div>

      <button
        onClick={() => onChat(user.uid)}
        style={{
          width: "100%", background: fill, color: "#fff",
          border: "none", borderRadius: 12, padding: "11px 0",
          fontSize: 14, fontWeight: 600, cursor: "pointer",
          letterSpacing: "0.01em", transition: "opacity 0.15s",
        }}
        onMouseOver={e => (e.currentTarget.style.opacity = "0.88")}
        onMouseOut={e => (e.currentTarget.style.opacity = "1")}
      >
        Start conversation →
      </button>
    </div>
  );
}

// ─── Chat Overlay ─────────────────────────────────────────────────────────────

function ChatOverlay({
  open,
  onClose,
  peer,
  messages,
  myId,
  onSend,
  pendingIntro,
  canSendMore,
}: {
  open: boolean;
  onClose: () => void;
  peer: NearbyUser | null;
  messages: ChatMessage[];
  myId: string | null;
  onSend: (text: string) => void;
  pendingIntro: boolean;
  canSendMore: boolean;
}) {
  const [draft, setDraft] = useState("");

  if (!open || !peer || !myId) return null;

  return (
    <div
      style={{
        position: "absolute",
        right: 20,
        bottom: 24,
        width: 280,
        maxHeight: 360,
        background: "rgba(255,255,255,0.98)",
        borderRadius: 18,
        boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 900,
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#1a1a1a",
            }}
          >
            Chat on wavelength
          </div>
          <div style={{ fontSize: 11, color: "#999" }}>
            {peer.name ?? "Someone nearby"}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 16,
            color: "#bbb",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          flex: 1,
          padding: "8px 10px 6px",
          overflowY: "auto",
          fontSize: 12,
        }}
      >
        {messages.length === 0 && (
          <p
            style={{
              margin: 0,
              padding: "6px 4px 10px",
              color: "#999",
            }}
          >
            {pendingIntro
              ? "Send a first message. They’ll see it with an option to say hi back."
              : canSendMore
              ? "No messages yet. Say hi!"
              : "Waiting for them to accept your request."}
          </p>
        )}
        {messages.map((m) => {
          const mine = m.fromId === myId;
          return (
            <div
              key={m.timestamp + m.fromId}
              style={{
                display: "flex",
                justifyContent: mine ? "flex-end" : "flex-start",
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  maxWidth: "80%",
                  padding: "6px 9px",
                  borderRadius: 12,
                  fontSize: 12,
                  lineHeight: 1.4,
                  background: mine ? "#C0392B" : "#F5B8B0",
                  color: mine ? "#fff" : "#5a1e1a",
                }}
              >
                {m.text}
              </div>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim() || !canSendMore) return;
          onSend(draft.trim());
          setDraft("");
        }}
        style={{
          padding: "6px 8px 8px",
          borderTop: "1px solid rgba(0,0,0,0.06)",
          display: "flex",
          gap: 6,
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            canSendMore
              ? "Send a quick hello…"
              : "Waiting for them to accept…"
          }
          disabled={!canSendMore}
          style={{
            flex: 1,
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,0.12)",
            padding: "6px 10px",
            fontSize: 12,
            outline: "none",
          }}
        />
        <button
          type="submit"
          style={{
            borderRadius: 999,
            border: "none",
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 600,
            background: "#C0392B",
            color: "#fff",
            cursor: canSendMore ? "pointer" : "not-allowed",
            opacity: canSendMore ? 1 : 0.6,
          }}
          disabled={!canSendMore}
        >
          Send
        </button>
      </form>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MapScreen({ onChatRequest }: { onChatRequest?: (uid: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [chatPeer, setChatPeer] = useState<NearbyUser | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [conversations, setConversations] = useState<Record<string, ChatMessage[]>>({});
  const [incomingRequest, setIncomingRequest] = useState<IncomingRequest | null>(null);
  const [acceptedConversations, setAcceptedConversations] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    injectStyles();
    if ((window as any).L) { setLeafletLoaded(true); return; }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setLeafletLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Assign a stable anonymous id for this browser
  useEffect(() => {
    if (typeof window === "undefined") return;
    const KEY = "wavelength:anonUserId";
    let stored = window.localStorage.getItem(KEY);
    if (!stored) {
      stored = window.crypto.randomUUID();
      window.localStorage.setItem(KEY, stored);
    }
    setMyId(stored);
  }, []);

  // Connect socket.io for chat
  useEffect(() => {
    if (!myId) return;
    const url = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3001";
    const s = io(url, { transports: ["websocket"] });
    setSocket(s);
    s.emit("register", { userId: myId });

    s.on("chat:incoming", (payload: IncomingRequest) => {
      setIncomingRequest(payload);
    });

    s.on("chat:accepted", (payload: { conversationId: string; peerId: string }) => {
      const peer = HARDCODED_USERS.find((u) => u.uid === payload.peerId) ?? null;
      setChatPeer(peer);
      setConversationId(payload.conversationId);
      setChatOpen(true);
      setAcceptedConversations((prev) => ({
        ...prev,
        [payload.conversationId]: true,
      }));
    });

    s.on("chat:message", (payload: ChatMessage) => {
      setConversations((prev) => {
        const existing = prev[payload.conversationId] ?? [];
        return {
          ...prev,
          [payload.conversationId]: [...existing, payload],
        };
      });
    });

    return () => {
      s.disconnect();
    };
  }, [myId]);

  useEffect(() => {
    if (!leafletLoaded || !mapRef.current || mapInstanceRef.current) return;
    const L = (window as any).L;

    const map = L.map(mapRef.current, {
      center: [HARDCODED_CENTER.lat, HARDCODED_CENTER.lng],
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapInstanceRef.current = map;

    // Clicking on empty map clears selection + closes chat
    map.on("click", () => {
      setSelectedUser(null);
      setChatPeer(null);
      setChatOpen(false);
      setConversationId(null);
      // Clear visual selection halo when clicking empty map
      const existing = document.querySelectorAll(".leaflet-wavelength-heart.wl-heart-selected");
      existing.forEach((el) => el.classList.remove("wl-heart-selected"));
    });
  }, [leafletLoaded]);

  // When selectedUser is cleared (e.g. via popup close button),
  // also remove the halo on any heart.
  useEffect(() => {
    if (selectedUser) return;
    if (typeof document === "undefined") return;
    const existing = document.querySelectorAll(".leaflet-wavelength-heart.wl-heart-selected");
    existing.forEach((el) => el.classList.remove("wl-heart-selected"));
  }, [selectedUser]);

  const redrawMarkers = useCallback(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!map || !L) return;

    map.eachLayer((layer: any) => {
      if (layer._wavelength) map.removeLayer(layer);
    });

    const youIcon = L.divIcon({
      className: "",
      html: `<div style="
        width:18px;height:18px;background:#1abc9c;
        border:3px solid white;border-radius:50%;
        box-shadow:0 0 0 5px rgba(26,188,156,0.2),0 0 12px rgba(26,188,156,0.3);
      "></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    const youMarker = L.marker([HARDCODED_CENTER.lat, HARDCODED_CENTER.lng], { icon: youIcon });
    youMarker._wavelength = true;
    youMarker.addTo(map);

    const ring = L.circle([HARDCODED_CENTER.lat, HARDCODED_CENTER.lng], {
      radius: 2000,
      color: "rgba(192,57,43,0.12)",
      weight: 1.5,
      dashArray: "6 4",
      fillColor: "rgba(192,57,43,0.02)",
      fillOpacity: 1,
      interactive: false,
    });
    ring._wavelength = true;
    ring.addTo(map);

    HARDCODED_USERS.forEach((user, i) => {
      const { fill, glow, text } = similarityToColor(user.similarity);
      const pct = Math.round(user.similarity * 100);

      const pts = computeThreadPoints(
        HARDCODED_CENTER.lat, HARDCODED_CENTER.lng,
        user.lat, user.lng, i
      );
      const thread = L.polyline(pts, {
        color: "#C0392B",
        weight: 1.5,
        opacity: 0.35,
        smoothFactor: 1.5,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      });
      thread._wavelength = true;
      thread.addTo(map);

      const heartIcon = L.divIcon({
        className: "leaflet-wavelength-heart",
        html: buildCuteHeart(fill, glow, text, pct, i),
        iconSize: [HEART_SIZE_MAX, HEART_SIZE_MAX],
        iconAnchor: [HEART_SIZE_MAX / 2, HEART_SIZE_MAX / 2],
      });
      const marker = L.marker([user.lat, user.lng], { icon: heartIcon });
      marker._wavelength = true;
      marker.on("click", () => {
        // Clear selection on any existing hearts
        const existing = document.querySelectorAll(".leaflet-wavelength-heart.wl-heart-selected");
        existing.forEach((el) => el.classList.remove("wl-heart-selected"));

        const iconEl = (marker as any)._icon as HTMLElement | null;
        if (iconEl) {
          iconEl.classList.add("wl-heart-selected");
        }

        // Smoothly focus map toward this heart
        const targetZoom = Math.max(map.getZoom(), 16);
        map.setView([user.lat, user.lng], targetZoom, { animate: true });

        // Switch selection + close any previous chat/conversation until user starts again
        setSelectedUser(user);
        setChatPeer(null);
        setChatOpen(false);
        setConversationId(null);
      });
      marker.addTo(map);
    });
  }, []);

  useEffect(() => {
    if (mapInstanceRef.current && leafletLoaded) redrawMarkers();
  }, [leafletLoaded, redrawMarkers]);

  return (
    <div style={{
      position: "relative", width: "100%", height: "100vh",
      fontFamily: "'DM Sans', system-ui, sans-serif", overflow: "hidden",
    }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 64,
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)",
        borderBottom: "0.5px solid rgba(0,0,0,0.07)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", zIndex: 800,
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <svg width={20} height={14} viewBox="0 0 20 14">
            <polyline points="0,7 3,2 6,12 9,4 12,10 15,7 18,7"
              fill="none" stroke="#C0392B" strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 17, fontWeight: 600, color: "#1a1a1a", letterSpacing: "-0.3px" }}>
            wavelength
          </span>
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{
            background: "white", border: "0.5px solid rgba(0,0,0,0.12)",
            borderRadius: 20, padding: "7px 16px",
            fontSize: 13, fontWeight: 500, color: "#333", cursor: "pointer",
          }}>Find your people nearby</button>
          <button style={{
            background: "none", border: "none",
            fontSize: 13, fontWeight: 500, color: "#666",
            cursor: "pointer", padding: "7px 8px",
          }}>My Profile</button>
        </div>
        <div style={{
          width: 34, height: 34, borderRadius: "50%", background: "#F5B8B0",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#C0392B",
        }}>A</div>
      </div>

      <div style={{
        position: "absolute", bottom: 24, left: 20,
        background: "rgba(255,255,255,0.94)", backdropFilter: "blur(10px)",
        borderRadius: 16, padding: "14px 18px",
        boxShadow: "0 2px 20px rgba(0,0,0,0.10)",
        zIndex: 800, minWidth: 180,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#1abc9c" }} />
          <span style={{ fontSize: 13, color: "#444", fontWeight: 500 }}>You are here</span>
        </div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
          People nearby: <strong style={{ color: "#333" }}>{HARDCODED_USERS.length}</strong>
        </div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
          Matching radius: <strong style={{ color: "#333" }}>2 km</strong>
        </div>
        <div style={{ fontSize: 11, color: "#aaa", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 5 }}>
          COMPATIBILITY
        </div>
        <div style={{
          height: 4, borderRadius: 2,
          background: "linear-gradient(to right, #FAD7D3, #C0392B)",
          marginBottom: 4,
        }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#aaa" }}>
          <span>40%</span><span>90%</span>
        </div>
      </div>

      <div style={{
        position: "absolute", top: 80, right: 20,
        background: "rgba(255,255,255,0.96)", backdropFilter: "blur(10px)",
        borderRadius: 20, padding: "18px 20px",
        boxShadow: "0 2px 20px rgba(0,0,0,0.10)",
        zIndex: 800, maxWidth: 240,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ color: "#C0392B", fontSize: 12 }}>✦</span>
          <span style={{ fontSize: 12, color: "#C0392B", fontWeight: 600 }}>Mutual vibes only</span>
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: "#1a1a1a", fontWeight: 500, marginBottom: 6 }}>
          The person next to you might be your{" "}
          <span style={{ color: "#C0392B", fontWeight: 700 }}>people.</span>
        </p>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 14, lineHeight: 1.5 }}>
          You just don't know it yet.
        </p>
        <Link
          href="/how-it-works"
          style={{
            background: "none", border: "none",
            fontSize: 13, color: "#C0392B", fontWeight: 600,
            cursor: "pointer", padding: 0, textDecoration: "none",
          }}
        >
          How it works →
        </Link>
      </div>

      {selectedUser && (
        <ProfilePopup
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onChat={(uid) => {
            setSelectedUser(null);
            onChatRequest?.(uid);
            const peer = HARDCODED_USERS.find((u) => u.uid === uid) ?? null;
            setChatPeer(peer);
            setChatOpen(true);
            if (myId && socket) {
              socket.emit("chat:request", { fromId: myId, toId: uid });
              const cid = [myId, uid].sort().join(":");
              setConversationId(cid);
              setConversations((prev) => prev[cid] ? prev : { ...prev, [cid]: [] });
            }
          }}
        />
      )}

      {/* Incoming chat request toast */}
      {incomingRequest && (
        <div
          style={{
            position: "absolute",
            left: 20,
            bottom: 24,
            maxWidth: 260,
            padding: "10px 12px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.98)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            zIndex: 900,
            fontSize: 12,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Someone on your wavelength wants to chat.
          </div>
          {incomingRequest.preview && (
            <div
              style={{
                fontSize: 11,
                color: "#777",
                marginBottom: 6,
                padding: "4px 6px",
                borderRadius: 8,
                background: "#FFF5F4",
              }}
            >
              “{incomingRequest.preview}”
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setIncomingRequest(null)}
              style={{
                flex: 1,
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "#fff",
                padding: "5px 0",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Not now
            </button>
            <button
              onClick={() => {
                if (!socket || !myId || !incomingRequest) return;
                socket.emit("chat:accept", {
                  fromId: incomingRequest.fromId,
                  toId: myId,
                });
                const peer =
                  HARDCODED_USERS.find((u) => u.uid === incomingRequest.fromId) ??
                  null;
                setChatPeer(peer);
                setChatOpen(true);
              const cid = [incomingRequest.fromId, myId].sort().join(":");
              setConversationId(cid);
              setConversations((prev) => prev[cid] ? prev : { ...prev, [cid]: [] });
                setIncomingRequest(null);
              }}
              style={{
                flex: 1,
                borderRadius: 999,
                border: "none",
                background: "#C0392B",
                color: "#fff",
                padding: "5px 0",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Say hi back
            </button>
          </div>
        </div>
      )}

      <ChatOverlay
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        peer={chatPeer}
        messages={
          conversationId ? conversations[conversationId] ?? [] : []
        }
        myId={myId}
        pendingIntro={
          !conversationId ||
          !conversations[conversationId] ||
          conversations[conversationId].length === 0
        }
        canSendMore={(function () {
          if (!conversationId) return true;
          const msgs = conversations[conversationId] ?? [];
          const accepted = acceptedConversations[conversationId] ?? false;
          if (accepted) return true;
          // allow exactly one opener before accept
          return msgs.length === 0;
        })()}
        onSend={(text) => {
          if (!socket || !myId || !chatPeer) return;
          const cid =
            conversationId ?? [myId, chatPeer.uid].sort().join(":");
          const payload: ChatMessage = {
            conversationId: cid,
            fromId: myId,
            toId: chatPeer.uid,
            text,
            timestamp: Date.now(),
          };
          setConversationId(cid);
          setConversations((prev) => {
            const existing = prev[cid] ?? [];
            return { ...prev, [cid]: [...existing, payload] };
          });
          socket.emit("chat:message", payload);
          // Also send / update the preview so the other side sees the latest opener
          socket.emit("chat:request", {
            fromId: myId,
            toId: chatPeer.uid,
            preview: text,
          });
        }}
      />
    </div>
  );
}