import { useState } from "react"
import { doc, setDoc } from "firebase/firestore"
import { db } from "../firebase"

const INTERESTS = ["Music", "Anime", "Gaming", "Film", "Books", "Art", "Sport", "Food", "Travel", "Tech"]
const MUSIC = ["Indie", "Hip-hop", "Jazz", "Classical", "Pop", "Rock", "Electronic", "R&B", "Metal", "Folk"]
const SHOWS = ["Anime", "Thriller", "Sci-fi", "Romance", "Comedy", "Documentary", "Horror", "Fantasy"]

function TagSelector({ label, options, selected, onChange }) {
  const toggle = (item) => {
    onChange(selected.includes(item) ? selected.filter(x => x !== item) : [...selected, item])
  }
  return (
    <div className="section">
      <h3>{label}</h3>
      <div className="tags">
        {options.map(item => (
          <button
            key={item}
            className={`tag ${selected.includes(item) ? "active" : ""}`}
            onClick={() => toggle(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ProfileSetup({ user, onDone }) {
  const [name, setName] = useState("")
  const [interests, setInterests] = useState([])
  const [music, setMusic] = useState([])
  const [shows, setShows] = useState([])
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim() || interests.length === 0) return alert("Add a name and at least one interest!")
    setLoading(true)
    const profile = { name, interests, music, shows, uid: user.uid }
    await setDoc(doc(db, "users", user.uid), profile)
    onDone(profile)
  }

  return (
    <div className="screen">
      <h1>👋 wavelength</h1>
      <p className="subtitle">find your people nearby</p>

      <div className="section">
        <h3>Your name</h3>
        <input
          className="input"
          placeholder="what do people call you?"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <TagSelector label="Interests" options={INTERESTS} selected={interests} onChange={setInterests} />
      <TagSelector label="Music" options={MUSIC} selected={music} onChange={setMusic} />
      <TagSelector label="Shows & Film" options={SHOWS} selected={shows} onChange={setShows} />

      <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
        {loading ? "saving..." : "find my wavelength →"}
      </button>
    </div>
  )
}