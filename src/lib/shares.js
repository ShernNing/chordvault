import { supabase } from './supabase'

// Public read-only sharing.
//
// A share is an immutable *snapshot* of a song or setlist stored in the `shares`
// table and addressed by an unguessable random token. Anyone with the link can
// read it via the `get_share(token)` RPC, which returns only the one matching
// row; there is no table-wide SELECT, so shares can't be listed. Only the
// signed-in owner can create or delete their own shares. Because each share is
// a self-contained snapshot, the recipient never gets read access to the
// owner's live library — only to the exact content that was shared, frozen at
// share time.
//
// Schema + policies: supabase/migrations/20261108000000_shares_get_by_token.sql
// (see SHARING.md).

const SETUP_HINT =
  'Sharing needs a one-time database setup — run the shares-table SQL in your Supabase project (see SHARING.md).'

function newToken() {
  // URL-safe, unguessable. The token is the only secret protecting the link.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

function decorate(error) {
  const msg = error?.message || ''
  // Table doesn't exist yet — Postgres reports 42P01; PostgREST reports PGRST205
  // with a "could not find the table … in the schema cache" message.
  const missingTable =
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    // get_share RPC not created yet.
    error?.code === 'PGRST202' ||
    /could not find the function .*get_share/i.test(msg) ||
    /relation .*shares.* does not exist/i.test(msg) ||
    /could not find the table .*shares/i.test(msg) ||
    /shares.* in the schema cache/i.test(msg)
  if (missingTable) return new Error(SETUP_HINT)
  if (/row-level security/i.test(msg)) {
    return new Error('You need to be signed in to create a share link.')
  }
  return new Error(msg || 'Could not create share link.')
}

export function shareUrl(token) {
  return `${window.location.origin}/share/${token}`
}

export async function createSongShare(song) {
  if (!supabase) throw new Error('Sharing is unavailable — sign in to sync first.')
  const token = newToken()
  const payload = {
    title: song.title,
    artist: song.artist || null,
    original_key: song.original_key || null,
    parsed_content: song.parsed_content || [],
    tags: song.tags || [],
  }
  const { error } = await supabase.from('shares').insert({ token, kind: 'song', payload })
  if (error) throw decorate(error)
  return token
}

export async function createSetlistShare(setlist, slots) {
  if (!supabase) throw new Error('Sharing is unavailable — sign in to sync first.')
  const token = newToken()
  const payload = {
    name: setlist.name,
    songs: (slots || [])
      .filter((s) => s.song)
      .map((slot) => ({
        title: slot.song.title,
        artist: slot.song.artist || null,
        original_key: slot.song.original_key || null,
        parsed_content: slot.song.parsed_content || [],
        chosen_key: slot.chosen_key || null,
        capo: slot.capo || 0,
      })),
  }
  const { error } = await supabase.from('shares').insert({ token, kind: 'setlist', payload })
  if (error) throw decorate(error)
  return token
}

export async function getShare(token) {
  if (!supabase) throw new Error('This link cannot be opened — the app is not configured.')
  // Tokens are 32 hex chars (or a base36 fallback); reject anything else
  // before hitting the network.
  if (typeof token !== 'string' || !/^[a-z0-9]{8,64}$/i.test(token)) {
    throw new Error('This shared link was not found or has been removed.')
  }
  const { data, error } = await supabase.rpc('get_share', { p_token: token }).maybeSingle()
  if (error) throw decorate(error)
  if (!data) throw new Error('This shared link was not found or has been removed.')
  return data
}
