// quick test to check if the spicy lyrics api is up
// run: node test-api.mjs

const HOST = "https://api.spicylyrics.org"
const VERSION = "5.22.3"

// paste your spotify token here (grab from open.spotify.com devtools)
const TOKEN = null

const trackId = "0VjIjW4GlUZAMYd2vXMi3b" // blinding lights

if (!TOKEN) {
  console.log("no token set, just checking if server responds...")
}

const res = await fetch(`${HOST}/query`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "SpicyLyrics-Version": VERSION,
    ...(TOKEN ? { "SpicyLyrics-WebAuth": `Bearer ${TOKEN}` } : {})
  },
  body: JSON.stringify({
    queries: [{ operation: "lyrics", variables: { id: trackId, auth: "SpicyLyrics-WebAuth" } }],
    client: { version: VERSION }
  })
})

console.log("status:", res.status)
const data = await res.json()

if (TOKEN) {
  const lyrics = data?.queries?.[1]?.result?.data
  if (lyrics) {
    console.log("type:", lyrics.Type)
    console.log("first line:", lyrics.Lines?.[0]?.Text ?? lyrics.Content?.[0]?.Text ?? "?")
  } else {
    console.log("raw:", JSON.stringify(data).slice(0, 200))
  }
} else {
  console.log(JSON.stringify(data).slice(0, 100))
}
