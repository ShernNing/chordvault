import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// gte-small embedding model, provided by the Edge runtime.
const model = new Supabase.ai.Session('gte-small')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const { songId, text } = await req.json()
    if (!songId || typeof text !== 'string') {
      return json({ error: 'songId and text are required' }, 400)
    }

    // 384-dim, mean-pooled, normalized embedding (matches the vector(384) column
    // and lets us use cosine distance directly).
    const embedding = await model.run(text, { mean_pool: true, normalize: true })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { error } = await supabase.from('songs').update({ embedding }).eq('id', songId)
    if (error) throw error

    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
