import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const model = new Supabase.ai.Session('gte-small')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const { query, threshold = 0.7, count = 8 } = await req.json()
    if (typeof query !== 'string' || !query.trim()) return json({ results: [] })

    const embedding = await model.run(query, { mean_pool: true, normalize: true })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
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
    return json({ error: String(e) }, 500)
  }
})
