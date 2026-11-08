import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_QUERY_CHARS = 500
const MAX_COUNT = 50

const model = new Supabase.ai.Session('gte-small')

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(hi, Math.max(lo, n))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Missing Authorization header' }, 401)

  try {
    const body = await req.json()
    const query = typeof body?.query === 'string' ? body.query.trim() : ''
    if (!query) return json({ results: [] })
    const threshold = clamp(body.threshold, 0, 1, 0.7)
    const count = Math.round(clamp(body.count, 1, MAX_COUNT, 8))

    const embedding = await model.run(query.slice(0, MAX_QUERY_CHARS), {
      mean_pool: true,
      normalize: true,
    })

    // Run match_songs (SECURITY INVOKER) as the caller so songs RLS applies —
    // results can only reference songs this user is allowed to read.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authorization } } },
    )
    const { data, error } = await supabase.rpc('match_songs', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: count,
    })
    if (error) throw error

    // [{ id, similarity }] ranked most-similar first.
    return json({ results: data ?? [] })
  } catch (e) {
    console.error('search-songs failed:', e)
    return json({ error: 'Search failed' }, 500)
  }
})
