// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Task = {
  id: string
  title: string
  done: boolean
  due_at: string | null
  created_at: string
  user_id?: string
}

export default function TasksPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState('')
  const [due, setDue] = useState<string>('') // yyyy-mm-dd
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('Checking session…')
  const [busyId, setBusyId] = useState<string | null>(null)

  // session + first load
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user.id ?? null
      setUserId(uid)
      if (!uid) { setMsg('Not signed in — redirecting to /auth'); router.push('/auth'); return }
      setMsg('')
      await load()
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_e: unknown, session: any) => {
      const uid = session?.user.id ?? null
      setUserId(uid)
      if (!uid) router.push('/auth')
      else load()
    })
    return () => { sub.subscription.unsubscribe() }
  }, [router])

  // realtime
  useEffect(() => {
    if (!userId) return
    const ch = supabase
      .channel('tasks-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks((prev) => [payload.new as Task, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setTasks((prev) => prev.map(t => t.id === (payload.new as any).id ? (payload.new as Task) : t))
          } else if (payload.eventType === 'DELETE') {
            setTasks((prev) => prev.filter(t => t.id !== (payload.old as any).id))
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId])

  async function load() {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('done', { ascending: true })
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) setMsg(error.message)
    else setTasks((data ?? []) as Task[])
  }

  function toISODateMidnightLocal(yyyy_mm_dd: string): string | null {
    if (!yyyy_mm_dd) return null
    const d = new Date(`${yyyy_mm_dd}T00:00:00`)
    return d.toISOString()
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !userId) return
    setLoading(true)
    const payload = { title: title.trim(), due_at: toISODateMidnightLocal(due), user_id: userId }
    const { error } = await supabase.from('tasks').insert(payload)
    setLoading(false)
    if (error) return alert(error.message)
    setTitle(''); setDue('') // realtime appends it
  }

  async function toggleDone(t: Task) {
    setBusyId(t.id)
    const { error } = await supabase.from('tasks').update({ done: !t.done }).eq('id', t.id)
    setBusyId(null)
    if (error) alert(error.message)
  }

  async function updateDue(t: Task, v: string) {
    setBusyId(t.id)
    const { error } = await supabase.from('tasks')
      .update({ due_at: toISODateMidnightLocal(v) })
      .eq('id', t.id)
    setBusyId(null)
    if (error) alert(error.message)
  }

  async function updateTitle(t: Task, v: string) {
    setBusyId(t.id)
    const { error } = await supabase.from('tasks').update({ title: v }).eq('id', t.id)
    setBusyId(null)
    if (error) alert(error.message)
  }

  async function removeTask(id: string) {
    if (!confirm('Delete this task?')) return
    setBusyId(id)
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    setBusyId(null)
    if (error) alert(error.message)
  }

  return (
    <main style={{ maxWidth: 680, margin: '48px auto', fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Tasks <span style={{ fontSize: 14, opacity: 0.6 }}>(live)</span></h1>
      {msg && <p style={{ opacity: 0.8, marginBottom: 16 }}>{msg}</p>}

      <form onSubmit={addTask} style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 180px 120px', alignItems: 'center', marginBottom: 18 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          required
          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16 }}
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: '10px 12px', borderRadius: 8, border: 'none', background: '#7c3aed', color: 'white', fontSize: 16, fontWeight: 700 }}
        >
          {loading ? 'Adding…' : 'Add Task'}
        </button>
      </form>

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
        {tasks.map((t) => {
          const dueLocal = t.due_at ? new Date(t.due_at).toISOString().slice(0,10) : ''
          return (
            <li key={t.id} style={{ padding: 12, border: '1px solid #eee', borderRadius: 10, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={t.done} onChange={() => toggleDone(t)} />
                <input
                  value={t.title}
                  onChange={(e) => updateTitle(t, e.target.value)}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd',
                    textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.6 : 1
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <label>Due:</label>
                <input
                  type="date"
                  value={dueLocal}
                  onChange={(e) => updateDue(t, e.target.value)}
                  style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #ddd' }}
                />
                <span style={{ marginLeft: 'auto', opacity: 0.6 }}>
                  {new Date(t.created_at).toLocaleString()}
                </span>
                <button
                  onClick={() => removeTask(t.id)}
                  disabled={busyId === t.id}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #f3d', background: 'white', fontWeight: 700 }}
                >
                  {busyId === t.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
