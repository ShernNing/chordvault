import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import Dashboard from './views/Dashboard'
import NewSong from './views/NewSong'
import SongView from './views/SongView'
import Setlists from './views/Setlists'
import SetlistView from './views/SetlistView'
import ImportView from './views/ImportView'

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/songs/new" element={<NewSong />} />
          <Route path="/songs/:id" element={<SongView />} />
          <Route path="/setlists" element={<Setlists />} />
          <Route path="/setlists/:id" element={<SetlistView />} />
          <Route path="/import" element={<ImportView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
