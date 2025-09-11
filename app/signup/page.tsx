'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabaseClient.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }
    router.push('/onboarding/connect'); // next step after signup
  }

  return (
    <main className="p-8 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-4">Create your account</h1>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          className="border p-2 rounded"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="border p-2 rounded"
          type="password"
          placeholder="Password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          className="bg-black text-white py-2 rounded disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? 'Creating…' : 'Sign up'}
        </button>
      </form>

      <p className="text-sm mt-4">
        Already have an account? <a className="underline" href="/signin">Sign in</a>
      </p>
    </main>
  );
}
