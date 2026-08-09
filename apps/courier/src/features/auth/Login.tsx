import { useState, type FormEvent } from 'react';
import { useAuth, translateAuthError } from '@delivery/shared';

export function Login({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) setError(translateAuthError(error));
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-surface p-6 shadow"
      >
        <h1 className="text-center text-xl font-bold">התחברות שליח</h1>

        <div className="space-y-1">
          <label className="block text-sm text-text-muted">אימייל</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm text-text-muted">סיסמה</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {submitting ? 'מתחבר...' : 'התחברות'}
        </button>

        <button type="button" onClick={onSwitchToSignUp} className="w-full text-sm text-secondary">
          עדיין אין לכם חשבון? הרשמה
        </button>
      </form>
    </div>
  );
}
