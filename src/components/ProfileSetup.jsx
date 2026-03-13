import { useState } from "react"
import { doc, setDoc } from "firebase/firestore"
import { db } from "../firebase"
import { getEmbedding } from "../utils/embeddings"
import Groq from "groq-sdk"

const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
})

const BROAD_INTERESTS = ["Music", "Anime", "Gaming", "Film", "Books", "Art", "Sport", "Food", "Travel", "Tech"]
const BROAD_MUSIC = ["Indie", "Hip-hop", "Jazz", "Classical", "Pop", "Rock", "Electronic", "R&B", "Metal", "Folk"]
const BROAD_SHOWS = ["Anime", "Thriller", "Sci-fi", "Romance", "Comedy", "Documentary", "Horror", "Fantasy"]

async function getDrillDown(category, specificPicks) {
  const context = specificPicks.length > 0
    ? `They specifically like: ${specificPicks.join(", ")}.`
    : `They selected the broad category: ${category}.`

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{
      role: "user",
      content: `${context} Generate exactly 6 specific titles, artists, or names that fans of these would love — not just the same genre, but genuine taste-based recommendations. For example if they like Demon Slayer, suggest Jujutsu Kaisen and Vinland Saga, not just "anime". If they like Radiohead, suggest Portishead and Bon Iver, not just "indie". Be specific and confident. Return ONLY a JSON array of strings, no explanation, no markdown, no preamble. Example: ["example1","example2","example3","example4","example5","example6"]`
    }],
    max_tokens: 150,
    temperature: 0.8,
  })

  const text = response.choices[0].message.content.trim()
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\[.*?\]/)
    return match ? JSON.parse(match[0]) : []
  }
}

function TagSelector({ label, options, selected, onChange, drillDownOptions, setDrillDownOptions, loadingTag, setLoadingTag }) {

  const handleBroadToggle = async (item) => {
    const isSelected = selected.includes(item)

    if (isSelected) {
      // deselect broad + its drill-downs
      onChange(selected.filter(x => x !== item && !(drillDownOptions[item] || []).includes(x)))
      setDrillDownOptions(prev => { const n = { ...prev }; delete n[item]; return n })
    } else {
      // select broad and fire drill-down
      onChange([...selected, item])
      if (!drillDownOptions[item]) {
        setLoadingTag(item)
        try {
          const results = await getDrillDown(item, [])
          setDrillDownOptions(prev => ({ ...prev, [item]: results }))
        } catch (e) {
          console.error("drill down failed", e)
        }
        setLoadingTag(null)
      }
    }
  }

  const handleSpecificToggle = async (item, parent) => {
    const isSelected = selected.includes(item)
    if (isSelected) {
      onChange(selected.filter(x => x !== item))
    } else {
      onChange([...selected, item])
      // fire another drill-down based on this specific pick
      if (!drillDownOptions[item]) {
        setLoadingTag(item)
        try {
          const currentSpecific = selected.filter(x =>
            Object.values(drillDownOptions).flat().includes(x)
          )
          const results = await getDrillDown(parent, [...currentSpecific, item])
          // merge new suggestions, avoid dupes
          setDrillDownOptions(prev => ({
            ...prev,
            [item]: results.filter(r => !Object.values(prev).flat().includes(r) && !options.includes(r))
          }))
        } catch (e) {
          console.error("deep drill down failed", e)
        }
        setLoadingTag(null)
      }
    }
  }

  return (
  <div className="section">
    <h3>{label}</h3>

    {/* broad tags */}
    <div className="tags">
      {options.map(item => (
        <button
          key={item}
          className={`tag ${selected.includes(item) ? "active" : ""}`}
          onClick={() => handleBroadToggle(item)}
          disabled={loadingTag === item}
        >
          {loadingTag === item ? "..." : item}
        </button>
      ))}
    </div>

    {/* all drill-downs, deduplicated */}
    {Object.entries(drillDownOptions)
      .filter(([parent, children]) => children && children.length > 0 && selected.includes(parent))
      .filter(([parent], idx, arr) => arr.findIndex(([p]) => p === parent) === idx)
      .map(([parent, children]) => (
        <div key={parent} style={{ marginTop: "0.75rem" }}>
          <p style={{ fontSize: "0.75rem", color: options.includes(parent) ? "var(--peach)" : "var(--purple)", marginBottom: "0.5rem", fontWeight: 600 }}>
            because you like {parent}:
          </p>
          <div className="tags">
            {children.map(item => (
              <button
                key={item}
                className={`tag ${selected.includes(item) ? "active" : ""}`}
                onClick={() => options.includes(parent)
                  ? handleSpecificToggle(item, parent)
                  : onChange(selected.includes(item) ? selected.filter(x => x !== item) : [...selected, item])
                }
                disabled={loadingTag === item}
                style={{ fontSize: "0.78rem" }}
              >
                {loadingTag === item ? "..." : item}
              </button>
            ))}
          </div>
        </div>
      ))
    }
  </div>
    )
}

export default function ProfileSetup({ user, onDone }) {
    const [name, setName] = useState("")
    const [interests, setInterests] = useState([])
    const [music, setMusic] = useState([])
    const [shows, setShows] = useState([])
    const [loading, setLoading] = useState(false)

    const [interestDrillDown, setInterestDrillDown] = useState({})
    const [musicDrillDown, setMusicDrillDown] = useState({})
    const [showsDrillDown, setShowsDrillDown] = useState({})
    const [loadingTag, setLoadingTag] = useState(null)

    const handleSubmit = async () => {
    if (!name.trim() || interests.length === 0) return alert("Add a name and at least one interest!")
    setLoading(true)

        const allInterests = [...interests, ...music, ...shows]
        const vector = await getEmbedding(allInterests)

        const profile = { name, interests, music, shows, vector, uid: user.uid }
        await setDoc(doc(db, "users", user.uid), profile)
        onDone(profile)
    }

    return (
        <div className="screen">
        <h1>wavelength</h1>
        <p className="subtitle">tell us what you're into</p>

        <div className="section">
            <h3>your name</h3>
            <input
            className="input"
            placeholder="what do people call you?"
            value={name}
            onChange={e => setName(e.target.value)}
            />
        </div>

        <TagSelector
            label="Interests"
            options={BROAD_INTERESTS}
            selected={interests}
            onChange={setInterests}
            drillDownOptions={interestDrillDown}
            setDrillDownOptions={setInterestDrillDown}
            loadingTag={loadingTag}
            setLoadingTag={setLoadingTag}
        />

        <TagSelector
            label="Music"
            options={BROAD_MUSIC}
            selected={music}
            onChange={setMusic}
            drillDownOptions={musicDrillDown}
            setDrillDownOptions={setMusicDrillDown}
            loadingTag={loadingTag}
            setLoadingTag={setLoadingTag}
        />

        <TagSelector
            label="Shows & Film"
            options={BROAD_SHOWS}
            selected={shows}
            onChange={setShows}
            drillDownOptions={showsDrillDown}
            setDrillDownOptions={setShowsDrillDown}
            loadingTag={loadingTag}
            setLoadingTag={setLoadingTag}
        />

        <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "saving..." : "find my wavelength →"}
        </button>
        </div>
    )
}
