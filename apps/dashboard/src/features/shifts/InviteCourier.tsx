import { useState, type FormEvent } from 'react';
import {
  normalizePhone,
  translateDbError,
  type FindCourierResult,
  type ShiftWithCourier,
} from '@delivery/shared';
import { supabase } from '../../lib/supabase';
import { Field } from '../../components/Field';

// חיפוש שליח = התאמה מדויקת בלבד (ראו CLAUDE.md). אין endpoint שמחזיר
// רשימת שליחים, ולכן בעל העסק חייב לדעת את הטלפון מראש. הטלפון מנורמל
// כאן באותה פונקציה שבה נרמל אותו השליח בהרשמה — אחרת החיפוש לא ימצא.

type Search =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'none'; phone: string }
  | { kind: 'found'; courier: FindCourierResult };

export function InviteCourier({
  businessId,
  shifts,
  onInvited,
}: {
  businessId: string;
  shifts: ShiftWithCourier[];
  onInvited: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [search, setSearch] = useState<Search>({ kind: 'idle' });
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSearch({ kind: 'searching' });

    const normalized = normalizePhone(phone);
    const { data, error: rpcError } = await supabase.rpc('find_courier_by_phone', {
      p_phone: normalized,
    });

    if (rpcError) {
      setSearch({ kind: 'idle' });
      setError(translateDbError(rpcError));
      return;
    }

    const courier = (data as FindCourierResult[])?.[0];
    setSearch(courier ? { kind: 'found', courier } : { kind: 'none', phone: normalized });
  }

  async function handleInvite(courier: FindCourierResult) {
    setError('');

    // הזמנה כפולה לאותו שליח היא רעש, לא שגיאה — עוצרים לפני הפנייה לשרת.
    const open = shifts.find(
      (s) => s.courier_id === courier.courier_id && (s.status === 'pending' || s.status === 'active')
    );
    if (open) {
      setError(
        open.status === 'pending'
          ? 'כבר נשלחה הזמנה לשליח הזה והיא ממתינה לתשובה.'
          : 'השליח הזה כבר במשמרת אצלכם.'
      );
      return;
    }

    setInviting(true);
    const { error: insertError } = await supabase
      .from('shifts')
      .insert({ courier_id: courier.courier_id, business_id: businessId });
    setInviting(false);

    if (insertError) {
      setError(translateDbError(insertError));
      return;
    }

    setPhone('');
    setSearch({ kind: 'idle' });
    onInvited();
  }

  return (
    <section className="rounded-xl bg-surface p-5 shadow">
      <h2 className="mb-3 text-lg font-bold">הזמנת שליח למשמרת</h2>

      <form onSubmit={handleSearch} className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="טלפון השליח" value={phone} onChange={setPhone} type="tel" required />
        </div>
        <button
          type="submit"
          disabled={search.kind === 'searching'}
          className="rounded-lg border border-border px-4 py-2 hover:border-text-muted disabled:opacity-50"
        >
          {search.kind === 'searching' ? 'מחפש...' : 'חיפוש'}
        </button>
      </form>

      {search.kind === 'none' && (
        <p className="mt-3 text-sm text-text-muted">
          לא נמצא שליח עם המספר {search.phone}. ודאו שהשליח נרשם באפליקציית השליחים עם המספר הזה.
        </p>
      )}

      {search.kind === 'found' && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="font-bold">{search.courier.name}</p>
            <p className="text-sm text-text-muted">{search.courier.phone}</p>
          </div>
          <button
            onClick={() => handleInvite(search.courier)}
            disabled={inviting}
            className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {inviting ? 'שולח...' : 'הזמנה למשמרת'}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}
