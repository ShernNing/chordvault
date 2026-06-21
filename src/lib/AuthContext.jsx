import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

// ── Role model (see ROLES.md) ───────────────────────────────────────────────
// member     — view-only + setlists. Cannot add/edit/delete songs.
// leader     — add songs + edit/delete own songs. Cannot edit/delete others',
//              cannot change roles.
// superuser  — full control: add/edit/delete any song + promote/demote users.
// New signups default to member; a superuser promotes them afterwards.
// eslint-disable-next-line react-refresh/only-export-components -- ROLES constant intentionally exported alongside the provider
export const ROLES = ['member', 'leader', 'superuser']

const AuthContext = createContext({
  session: null,
  isLoggedIn: false,
  email: undefined,
  userId: undefined,
  role: 'member',
  isSuperuser: false,
  isLeader: false,
  isMember: true,
  canAddSongs: false,
  canEditSong: () => false,
  canDeleteSong: () => false,
})

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState('member')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load the user's role from their profile. Re-runs whenever the user changes.
  // Defaults to 'member' if the profiles table/row is missing (e.g. RLS setup
  // not run yet) so the app degrades gracefully to least privilege.
  const userId = session?.user?.id
  useEffect(() => {
    if (!supabase || !userId) { setRole('member'); return }
    let cancelled = false
    supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
      .then(({ data }) => { if (!cancelled) setRole(data?.role || 'member') })
    return () => { cancelled = true }
  }, [userId])

  const isSuperuser = role === 'superuser'
  const isLeader = role === 'leader'
  const canAddSongs = isSuperuser || isLeader

  // Edit: superuser edits anything; a leader edits only songs they created.
  // Members never edit. Mirrors the songs RLS policies in ROLES.md — the UI
  // only hides what Postgres would reject anyway.
  const canEditSong = (song) =>
    isSuperuser || (isLeader && !!song?.created_by && song.created_by === userId)

  // Delete: superuser deletes anything; a leader deletes only songs they
  // created. Members never delete. Mirrors the songs RLS policies in ROLES.md.
  const canDeleteSong = (song) =>
    isSuperuser || (isLeader && !!song?.created_by && song.created_by === userId)

  return (
    <AuthContext.Provider value={{
      session,
      isLoggedIn: !!session,
      email: session?.user?.email,
      userId,
      role,
      isSuperuser,
      isLeader,
      isMember: !isSuperuser && !isLeader,
      canAddSongs,
      canEditSong,
      canDeleteSong,
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth hook is intentionally exported alongside the provider
export const useAuth = () => useContext(AuthContext)
