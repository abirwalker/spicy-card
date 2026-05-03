// Adapted from Spicy Lyrics — host hardcoded, version/session deps removed

const SPICY_LYRICS_HOST = "https://spicylyrics.spikerko.org"
const EXTENSION_VERSION = "1.0.0"

export type QueryInput = {
operation: string
variables?: any
}

export type QueryObjectResult = {
data: any
httpStatus: number
format: "text" | "json"
}

export interface QueryResultGetter {
get(operationId: string): QueryObjectResult | undefined
}

export async function Query(
queries: QueryInput[],
headers: Record<string, string> = {}
): Promise<QueryResultGetter> {
const res = await fetch(`${SPICY_LYRICS_HOST}/query`, {
method: "POST",
headers: {
"Content-Type": "application/json",
"SpicyLyrics-Version": EXTENSION_VERSION,
...headers,
},
body: JSON.stringify({
queries,
client: { version: EXTENSION_VERSION },
}),
})

if (!res.ok) {
throw new Error(`[SpicyCardView] Query failed with status ${res.status}`)
}

const data = await res.json()
const results: Map<string, QueryObjectResult> = new Map()
for (const job of data.queries) {
results.set(job.operationId, job.result)
}

return {
get(operationId: string): QueryObjectResult | undefined {
return results.get(operationId)
},
}
}
