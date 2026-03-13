import { useState, useEffect } from "react"
import { auth } from "./firebase"
import { signInAnonymously } from "firebase/auth"
import LandingScreen from "./components/LandingScreen"
import ProfileSetup from "./components/ProfileSetup"
import RoomJoin from "./components/RoomJoin"
import MatchList from "./components/MatchList"

function App() {
  const [user, setUser] = useState(null)
  const [landed, setLanded] = useState(false)
  const [profile, setProfile] = useState(null)
  const [room, setRoom] = useState(null)

  useEffect(() => {
    signInAnonymously(auth).then((cred) => setUser(cred.user))
  }, [])

  if (!user) return <div className="loading">Connecting...</div>
  if (!landed) return <LandingScreen onEnter={() => setLanded(true)} />
  if (!profile) return <ProfileSetup user={user} onDone={setProfile} />
  if (!room) return <RoomJoin user={user} profile={profile} onJoin={setRoom} />
  return <MatchList user={user} profile={profile} room={room} />
}

export default App