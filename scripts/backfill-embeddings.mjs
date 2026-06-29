// One-time backfill: embed every song that has no embedding yet.
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-embeddings.mjs
//
// Calls the deployed embed-song edge function (which runs gte-small and writes
// songs.embedding). Safe to re-run: only null-embedding songs are processed.
import { createClient } from '@supabase/supabase-js'
import { buildEmbedText } from '../src/lib/embedText.js'

// supabase-js eagerly builds a Realtime client that needs a global WebSocket.
// Node 22+ has one natively. On Node <22, install ws (`npm i -D ws`) and we
// polyfill it here. (This script never uses realtime; it's just construction.)
if (!globalThis.WebSocket) {
  try {
    globalThis.WebSocket = (await import('ws')).default
  } catch {
    console.error('No global WebSocket. Run on Node 22+, or `npm i -D ws` first.')
    process.exit(1)
  }
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.')
  process.exit(1)
}

const supabase = createClient(url, key)

const { data: songs, error } = await supabase
  .from('songs')
  .select('*')
  .is('embedding', null)
if (error) throw error

console.log(`Embedding ${songs.length} song(s)…`)
let ok = 0
for (const song of songs) {
  const text = buildEmbedText(song)
  const { error: e } = await supabase.functions.invoke('embed-song', {
    body: { songId: song.id, text },
  })
  if (e) {
    console.warn(`  ✗ ${song.title}: ${e.message ?? e}`)
    continue
  }
  ok++
  console.log(`  ✓ ${song.title}`)
}
console.log(`Done: ${ok}/${songs.length} embedded.`)
