import { useState, type FormEvent } from 'react';
import { useAuth, translateAuthError, normalizePhone } from '@delivery/shared';
import { Field } from '../../components/Field';

export function SignUp({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { signUp } = useAuth();
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error } = await signUp(email, password, {
      role: 'business',
      business_name: businessName,
      address,
      phone: normalizePhone(phone),
    });
    setSubmitting(false);
    if (error) setError(translateAuthError(error));
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-surface p-6 shadow"
      >
        <h1 className="text-center text-xl font-bold">הרשמת עסק חדש</h1>

        <Field label="שם העסק" value={businessName} onChange={setBusinessName} required />
        <Field label="כתובת" value={address} onChange={setAddress} required />
        <Field label="טלפון" value={phone} onChange={setPhone} type="tel" required />
        <Field label="אימייל" value={email} onChange={setEmail} type="email" required />
        <Field label="סיסמה" value={password} onChange={setPassword} type="password" required />

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {submitting ? 'נרשם...' : 'הרשמה'}
        </button>

        <button type="button" onClick={onSwitchToLogin} className="w-full text-sm text-secondary">
          כבר יש לכם חשבון? התחברות
        </button>
      </form>
    </div>
  );
}
