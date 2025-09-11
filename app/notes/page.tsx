'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Note = { id: string; content: string; created_at: string; user_id?: string }

export default function NotesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('Checking session...')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  // Initial session + first load
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user.id ?? null
      setUserId(uid)
      if (!uid) {
        setMsg('Not signed in — redirecting to /auth')
        router.push('/auth')
        return
      }
      setMsg('')
      await loadNotes()
    }
    init()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user.id ?? null
      setUserId(uid)
      if (!uid) router.push('/auth')
      else loadNotes()
    })
    return () => { sub.subscription.unsubscribe() }
  }, [router])

  // Realtime subscription (after userId known)
  useEffect(() => {
    if (!userId) return

    const ch = supabase
      .channel('notes-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNotes((prev) => [payload.new as Note, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setNotes((prev) =>
              prev.map((n) => (n.id === (payload.new as any).id ? (payload.new as Note) : n))
            )
          } else if (payload.eventType === 'DELETE') {
            setNotes((prev) => prev.filter((n) => n.id !== (payload.old as any).id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [userId])

  async function loadNotes() {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setMsg(error.message)
    else setNotes((data ?? []) as Note[])
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim() || !userId) return
    setLoading(true)
    const { error } = await supabase.from('notes').insert({ content, user_id: userId })
    setLoading(false)
    if (error) return alert(error.message)
    setContent('') // realtime will add it
  }

  function startEdit(n: Note) {
    setEditingId(n.id)
    setEditText(n.content)
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return
    setBusyId(id)
    const { error } = await supabase.from('notes').update({ content: editText }).eq('id', id)
    setBusyId(null)
    if (error) return alert(error.message)
    setEditingId(null)
    setEditText('') // realtime will update it
  }

  async function deleteNote(id: string) {
    if (!confirm('Delete this note?')) return
    setBusyId(id)
    const { error } = await supabase.from('notes').delete().eq('id', id)
    setBusyId(null)
    if (error) return alert(error.message)
    // realtime will remove it
  }

  return (
    <main style={{ maxWidth: 560, margin: '48px auto', fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
        Notes <span style={{ fontSize: 14, opacity: 0.6 }}>(live)</span>
      </h1>
      {msg && <p style={{ opacity: 0.8, marginBottom: 16 }}>{msg}</p>}

      <form onSubmit={addNote} style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a note…"
          required
          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: '10px 12px', borderRadius: 8, border: 'none', background: '#7c3aed', color: 'white', fontSize: 16, fontWeight: 600 }}
        >
          {loading ? 'Adding…' : 'Add Note'}
        </button>
      </form>

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
        {notes.map((n) => (
          <li key={n.id} style={{ padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
            {editingId === n.id ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => saveEdit(n.id)}
                    disabled={busyId === n.id}
                    style={{ padding: '8px 10px', borderRadius: 8, border: 'none', background: '#7c3aed', color: 'white', fontWeight: 600 }}
                  >
                    {busyId === n.id ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditingId(null); setEditText('') }}
                    style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', background: 'white', fontWeight: 600 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 15 }}>{n.content}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {new Date(n.created_at).toLocaleString()}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => startEdit(n)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', background: 'white', fontWeight: 600 }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteNote(n.id)}
                    disabled={busyId === n.id}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #f3d', background: 'white', fontWeight: 700 }}
                  >
                    {busyId === n.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
