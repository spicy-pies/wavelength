import { useState, useEffect } from "react"
import { collection, onSnapshot, doc, setDoc, getDoc } from "firebase/firestore"
import { db } from "../firebase"

function calcCompatibility(a, b) {
  const allKeys = ["interests", "music", "shows"]
  let shared = []
  let total = new Set()

  allKeys.forEach(key => {
    const aSet = new Set(a[key] || [])
    const bSet = new Set(b[key] || [])
    ;(a[key] || []).forEach(x => total.add(`${key}:${x}`))
    ;(b[key] || []).forEach(x => total.add(`${key}:${x}`))
    aSet.forEach(x => { if (bSet.has(x)) shared.push(x) })
  })

  if (total.size === 0) return { score: 0, shared: [] }
  return {
    score: Math.round((shared.length / total.size) * 100),
    shared,
  }
}

function MatchCard({ match, user, room }) {
  const [interested, setInterested] = useState(false)
  const [connected, setConnected] = useState(false)

  const handleInterest = async () => {
    setInterested(true)
    const pairId = [user.uid, match.uid].sort().join("_")
    await setDoc(doc(db, "rooms", room, "interests", pairId, "votes", user.uid), {
      from: user.uid,
      to: match.uid,
      at: Date.now(),
    })

    // check if mutual
    const otherVote = await getDoc(doc(db, "rooms", room, "interests", pairId, "votes", match.uid))
    if (otherVote.exists()) setConnected(true)
  }

  return (
    <div className={`match-card ${connected ? "connected" : ""}`}>
      <div className="match-header">
        <span className="match-name">{match.name}</span>
        <span className={`match-score ${match.score >= 60 ? "high" : match.score >= 30 ? "mid" : "low"}`}>
          {match.score}%
        </span>
      </div>

      {match.shared.length > 0 && (
        <div className="shared-tags">
          {match.shared.slice(0, 4).map(tag => (
            <span key={tag} className="shared-tag">✨ {tag}</span>
          ))}
        </div>
      )}

      {connected ? (
        <div className="connected-msg">💙 you're on the same wavelength!</div>
      ) : interested ? (
        <div className="waiting-msg">waiting to see if they feel it too...</div>
      ) : (
        <button className="btn-connect" onClick={handleInterest}>
          connect →
        </button>
      )}
    </div>
  )
}

export default function MatchList({ user, profile, room }) {
  const [members, setMembers] = useState([])

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "rooms", room, "members"),
      (snap) => {
        const others = snap.docs
          .map(d => d.data())
          .filter(m => m.uid !== user.uid && m.visible && calcCompatibility(profile, m).score >= 50)
          .map(m => ({ ...m, ...calcCompatibility(profile, m) }))
          .sort((a, b) => b.score - a.score)
        setMembers(others)
      }
    )
    return unsub
  }, [room])

  return (
    <div className="screen">
      <div className="match-header-top">
        <h1>Wavelength</h1>
        <span className="room-badge">{room}</span>
      </div>
      <p className="subtitle">
        {members.length === 0 ? "waiting for others to join..." : `${members.length} people nearby`}
      </p>

      {members.length === 0 ? (
        <div className="empty-state">
          <div className="pulse">📡</div>
          <p>share the room code <strong>{room}</strong> with people around you</p>
        </div>
      ) : (
        members.map(m => (
          <MatchCard key={m.uid} match={m} user={user} room={room} />
        ))
      )}
    </div>
  )
}