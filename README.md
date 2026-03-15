# Wavelength
Find your people nearby. Anonymous compatibility between people in the same physical space — mutual interest only.

---

## How it works

Wavelength uses **k-Nearest Neighbours (kNN) vector search** inside Elasticsearch to match people by cultural taste in real time.

When you save your profile, **Groq LLaMA 3.3 70B** converts your interests (music, shows, games, hobbies) into a **20-dimensional cultural taste vector** — capturing dimensions like mainstream vs indie, emotional vs intellectual, dark vs lighthearted. This vector is stored as a `dense_vector` in Elasticsearch.

When you open the map, your GPS location is sent to the backend via **Socket.io WebSockets**. The backend fires a hybrid **kNN + geo query** against Elasticsearch:

```json
POST users/_search
{
  "knn": {
    "field": "vector",
    "query_vector": [...],
    "k": 10,
    "num_candidates": 50,
    "filter": {
      "geo_distance": {
        "distance": "2km",
        "location": { "lat": -33.87, "lon": 151.20 }
      }
    }
  }
}
```

One query. Finds your 10 most culturally compatible people within 2km. Returns cosine similarity scores. All inside Elasticsearch — no separate vector database needed.

Matches are delivered to your map in real time as heart markers. Darker heart = higher compatibility. Red strings connect you to each match.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind CSS, Framer Motion, Leaflet.js |
| Backend | Node.js, Express, Socket.io |
| AI / Vectorisation | Groq LLaMA 3.3 70B |
| Vector search | Elasticsearch (Elastic Cloud) — `dense_vector` + kNN |
| Auth + DB | Supabase (Postgres) |
| Hosting | Vercel (frontend), Railway (backend) |

---

## ML / AI components

**1. Interest vectorisation (Groq LLaMA 3.3 70B)**
Converts a user's cultural interests into a 20-dimensional vector across dimensions like mainstream vs indie, emotional vs intellectual, fast-paced vs contemplative. Uses `temperature: 0` and alphabetically sorted tags for maximum consistency.

**2. kNN vector search (Elasticsearch)**
Every user is a point in 20D cultural space. Elasticsearch's native kNN finds whoever is geometrically closest using cosine similarity — no separate ML service or vector database needed.

**3. Hybrid kNN + geo query**
Combines semantic similarity with geospatial filtering in a single Elasticsearch query — "who is most culturally similar to me AND within 2km right now."

**4. Groq autocomplete in profile setup**
LLaMA autocompletes interest searches in real time — type "radio" and get Radiohead, Radio Dept, etc. Makes profiles richer which feeds better data into the vector.

---

## Privacy

- Anonymous by default — identity never revealed unless mutual
- No exact coordinates stored or exposed
- Users removed from Elasticsearch on signout or browser close
- Supabase handles permanent profile data; Elasticsearch handles ephemeral presence only

---

## Setup (one-time)

**Frontend**
```bash
cd frontend
npm install
cp .env.example .env.local
```

**Backend**
```bash
cd backend
npm install
cp .env.example .env
```

**Auth (Supabase):** Create a project at [supabase.com](https://supabase.com). Enable Email and Google auth providers. Then:
- **Frontend** `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_BACKEND_URL`
- **Backend** `.env`: `SUPABASE_JWT_SECRET`, `ELASTICSEARCH_URL`, `ELASTICSEARCH_API_KEY`, `GROQ_API_KEY`, `PORT`, `FRONTEND_ORIGIN`

Never commit real secrets.

---

## Run

**Frontend:**
```bash
cd frontend
npm run dev
```
→ [http://localhost:3000](http://localhost:3000)

**Backend:**
```bash
cd backend
npm run dev
```
→ [http://localhost:3001](http://localhost:3001)

Open two terminals and run each `npm run dev` in its folder.

---

## Repo structure

- **frontend/** — Next.js app. Deploy to Vercel.
- **backend/** — Express + Socket.io server. Deploy to Railway.
- **supabase/** — database migrations and schema.

---

## License
Private.
