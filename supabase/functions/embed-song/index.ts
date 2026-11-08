import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// gte-small only sees ~512 tokens; anything past this is wasted compute.
const MAX_TEXT_CHARS = 4000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// gte-small embedding model, provided by the Edge runtime.
const model = new Supabase.ai.Session('gte-small')

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
    const { songId, text } = await req.json()
    if (typeof songId !== 'string' || !UUID_RE.test(songId) || typeof text !== 'string') {
      return json({ error: 'songId (uuid) and text are required' }, 400)
    }

    // Act AS THE CALLER, not as service role: the songs UPDATE policy then
    // decides whether this user may touch this song (ROLES.md — owner or
    // superuser). verify_jwt alone only proves the caller has *a* valid token.
    // The backfill script authenticates with the service-role key, which
    // bypasses RLS, so it keeps working.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authorization } } },
    )

    // 384-dim, mean-pooled, normalized embedding (matches the vector(384) column
    // and lets us use cosine distance directly).
    const embedding = await model.run(text.slice(0, MAX_TEXT_CHARS), {
      mean_pool: true,
      normalize: true,
    })

    // .select() so an RLS-filtered update (0 rows, no error) is detectable.
    const { data, error } = await supabase
      .from('songs')
      .update({ embedding })
      .eq('id', songId)
      .select('id')
    if (error) throw error
    if (!data?.length) return json({ error: 'Song not found or not editable by you' }, 403)

    return json({ ok: true })
  } catch (e) {
    console.error('embed-song failed:', e)
    return json({ error: 'Embedding failed' }, 500)
  }
})
