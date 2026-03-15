"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/utils/supabase/client";

// ─── Types matching Supabase schema ──────────────────────────────────────────

export type ConnectionIntent = {
  id: number;
  from_user_id: string;
  to_user_id: string;
  status: string; // "pending" | "accepted" | "declined"
  created_at: string;
};

export type Match = {
  id: number;
  user1_id: string;
  user2_id: string;
  created_at: string;
};

export type DbMessage = {
  id: number;
  match_id: number;
  sender_user_id: string;
  body: string;
  created_at: string;
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSupabaseChat(myId: string | null) {
  const supabase = createClient();
  const [incomingIntents, setIncomingIntents] = useState<ConnectionIntent[]>([]);
  const [myMatches, setMyMatches] = useState<Match[]>([]);
  const [messagesByMatch, setMessagesByMatch] = useState<Record<number, DbMessage[]>>({});
  const subscriptionsRef = useRef<any[]>([]);

  // ── Load existing data on mount ──
  useEffect(() => {
    if (!myId) return;

    // Load pending incoming intents
    supabase
      .from("connection_intents")
      .select("*")
      .eq("to_user_id", myId)
      .eq("status", "pending")
      .then(({ data }) => {
        if (data) setIncomingIntents(data);
      });

    // Load my matches
    supabase
      .from("matches")
      .select("*")
      .or(`user1_id.eq.${myId},user2_id.eq.${myId}`)
      .then(({ data }) => {
        if (data) {
          setMyMatches(data);
          // Load messages for each match
          data.forEach((match) => {
            supabase
              .from("messages")
              .select("*")
              .eq("match_id", match.id)
              .order("created_at", { ascending: true })
              .then(({ data: msgs }) => {
                if (msgs) {
                  setMessagesByMatch((prev) => ({ ...prev, [match.id]: msgs }));
                }
              });
          });
        }
      });
  }, [myId]);

  // ── Realtime subscriptions ──
  useEffect(() => {
    if (!myId) return;

    // 1. Subscribe to new connection_intents TO me
    const intentSub = supabase
      .channel("intents-to-me")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "connection_intents",
          filter: `to_user_id=eq.${myId}`,
        },
        (payload) => {
          const intent = payload.new as ConnectionIntent;
          if (intent.status === "pending") {
            setIncomingIntents((prev) => {
              if (prev.some((i) => i.id === intent.id)) return prev;
              return [...prev, intent];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "connection_intents",
          filter: `from_user_id=eq.${myId}`,
        },
        (payload) => {
          // My outgoing intent was accepted — a match should appear
          const intent = payload.new as ConnectionIntent;
          if (intent.status === "accepted") {
            // Reload matches
            supabase
              .from("matches")
              .select("*")
              .or(`user1_id.eq.${myId},user2_id.eq.${myId}`)
              .then(({ data }) => {
                if (data) setMyMatches(data);
              });
          }
        }
      )
      .subscribe();

    // 2. Subscribe to new matches involving me
    const matchSub = supabase
      .channel("matches-for-me")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "matches",
        },
        (payload) => {
          const match = payload.new as Match;
          if (match.user1_id === myId || match.user2_id === myId) {
            setMyMatches((prev) => {
              if (prev.some((m) => m.id === match.id)) return prev;
              return [...prev, match];
            });
          }
        }
      )
      .subscribe();

    // 3. Subscribe to ALL new messages — filter client-side by match_id
    const msgSub = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new as DbMessage;
          setMessagesByMatch((prev) => {
            const existing = prev[msg.match_id] ?? [];
            if (existing.some((m) => m.id === msg.id)) return prev;
            return { ...prev, [msg.match_id]: [...existing, msg] };
          });
        }
      )
      .subscribe();

    subscriptionsRef.current = [intentSub, matchSub, msgSub];

    return () => {
      subscriptionsRef.current.forEach((sub) => supabase.removeChannel(sub));
      subscriptionsRef.current = [];
    };
  }, [myId]);

  // ── Send a connection request (first message) ──
  const sendConnectionRequest = useCallback(
    async (toUserId: string, messageBody: string) => {
      if (!myId) return null;

      // 1. Insert connection_intent
      const { data: intent, error: intentErr } = await supabase
        .from("connection_intents")
        .insert({ from_user_id: myId, to_user_id: toUserId, status: "pending" })
        .select()
        .single();

      if (intentErr || !intent) {
        console.error("[Chat] failed to create intent", intentErr);
        return null;
      }

      // Store the first message body on the intent for preview
      // (We don't insert into messages yet — no match_id exists until accepted)
      // Instead we'll use the intent + a separate preview approach
      // For hackathon: store preview in localStorage keyed by intent id
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`intent-preview-${intent.id}`, messageBody);
      }

      return intent;
    },
    [myId]
  );

  // ── Accept a connection request ──
  const acceptConnectionRequest = useCallback(
    async (intent: ConnectionIntent) => {
      if (!myId) return null;

      // 1. Update intent status
      await supabase
        .from("connection_intents")
        .update({ status: "accepted" })
        .eq("id", intent.id);

      // 2. Create match (user1 < user2 for consistency)
      const [u1, u2] = [intent.from_user_id, intent.to_user_id].sort();
      const { data: match, error: matchErr } = await supabase
        .from("matches")
        .insert({ user1_id: u1, user2_id: u2 })
        .select()
        .single();

      if (matchErr || !match) {
        console.error("[Chat] failed to create match", matchErr);
        return null;
      }

      // 3. Insert the original first message into messages table
      const preview =
        typeof window !== "undefined"
          ? window.localStorage.getItem(`intent-preview-${intent.id}`)
          : null;
      if (preview) {
        await supabase.from("messages").insert({
          match_id: match.id,
          sender_user_id: intent.from_user_id,
          body: preview,
        });
      }

      // 4. Remove from incoming intents
      setIncomingIntents((prev) => prev.filter((i) => i.id !== intent.id));

      // 5. Add to matches
      setMyMatches((prev) => {
        if (prev.some((m) => m.id === match.id)) return prev;
        return [...prev, match];
      });

      return match;
    },
    [myId]
  );

  // ── Decline a connection request ──
  const declineConnectionRequest = useCallback(
    async (intentId: number) => {
      await supabase
        .from("connection_intents")
        .update({ status: "declined" })
        .eq("id", intentId);

      setIncomingIntents((prev) => prev.filter((i) => i.id !== intentId));
    },
    []
  );

  // ── Send a message in an accepted match ──
  const sendMessage = useCallback(
    async (matchId: number, body: string) => {
      if (!myId) return;

      const { data, error } = await supabase
        .from("messages")
        .insert({ match_id: matchId, sender_user_id: myId, body })
        .select()
        .single();

      if (error) {
        console.error("[Chat] failed to send message", error);
        return;
      }

      // Optimistically add to local state (realtime will also deliver it)
      if (data) {
        setMessagesByMatch((prev) => {
          const existing = prev[matchId] ?? [];
          if (existing.some((m) => m.id === data.id)) return prev;
          return { ...prev, [matchId]: [...existing, data] };
        });
      }
    },
    [myId]
  );

  // ── Get match for a peer userId ──
  const getMatchForPeer = useCallback(
    (peerUid: string): Match | null => {
      return (
        myMatches.find(
          (m) =>
            (m.user1_id === myId && m.user2_id === peerUid) ||
            (m.user1_id === peerUid && m.user2_id === myId)
        ) ?? null
      );
    },
    [myMatches, myId]
  );

  // ── Get incoming intent from a specific user ──
  const getIncomingIntentFrom = useCallback(
    (fromUid: string): ConnectionIntent | null => {
      return incomingIntents.find((i) => i.from_user_id === fromUid) ?? null;
    },
    [incomingIntents]
  );

  // ── Get preview for an intent ──
  const getIntentPreview = useCallback((intentId: number): string => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(`intent-preview-${intentId}`) ?? "";
  }, []);

  return {
    incomingIntents,
    myMatches,
    messagesByMatch,
    sendConnectionRequest,
    acceptConnectionRequest,
    declineConnectionRequest,
    sendMessage,
    getMatchForPeer,
    getIncomingIntentFrom,
    getIntentPreview,
  };
}