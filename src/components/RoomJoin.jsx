import { useState } from "react"
import { doc, setDoc } from "firebase/firestore"
import { db } from "../firebase"

export default function RoomJoin({ user, profile, onJoin }) {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)

  const handleJoin = async () => {
    if (code.trim().length < 2) return alert("Enter a room code!")
    setLoading(true)
    const roomCode = code.trim().toUpperCase()

    await setDoc(doc(db, "rooms", roomCode, "members", user.uid), {
      ...profile,
      joinedAt: Date.now(),
      visible: true,
    })

    onJoin(roomCode)
  }

  return (
    <div className="screen">
      <h1>Wavelength</h1>
      <p className="subtitle">join a room to find matches nearby :D</p>

      <div className="section">
        <h3>Room code</h3>
        <input
          className="input"
          placeholder="e.g. HACK or CAFE"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          maxLength={8}
        />
        <p style={{ color: "#666", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          everyone in the same space uses the same code
        </p>
      </div>

      <button className="btn-primary" onClick={handleJoin} disabled={loading}>
        {loading ? "joining..." : "join room →"}
      </button>
    </div>
  )
}