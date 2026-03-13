import Groq from "groq-sdk"

const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
})

export async function getEmbedding(interests) {
  const text = interests.join(", ")

  // use Groq to convert interests into a semantic description
  // then manually create a pseudo-vector from the response
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{
      role: "user",
      content: `Given these interests: "${text}", rate their affinity to each of these 20 cultural dimensions on a scale of 0-10. Return ONLY a JSON array of 20 numbers, no explanation, no keys, just the array.

Dimensions: [indie/alternative, mainstream/pop, anime/manga, western-media, gaming, outdoor/sport, intellectual/academic, creative/artistic, tech/science, food/lifestyle, classical/jazz, hip-hop/urban, fantasy/scifi, thriller/drama, comedy/light, romance, horror/dark, travel/adventure, social/people, solo/introspective]`
    }],
    max_tokens: 100,
    temperature: 0.1,
  })

  const text2 = response.choices[0].message.content.trim()
  try {
    const arr = JSON.parse(text2.match(/\[.*?\]/s)?.[0] || text2)
    return arr.map(Number)
  } catch {
    return new Array(20).fill(5) // fallback neutral vector
  }
}

export function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
  if (magA === 0 || magB === 0) return 0
  return dot / (magA * magB)
}