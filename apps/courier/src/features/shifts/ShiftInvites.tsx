import { useState } from 'react';
import { translateDbError, type ShiftWithBusiness } from '@delivery/shared';
import { supabase } from '../../lib/supabase';

// המסך היחיד של השליח בשלב 1: מי הזמין אותי, ובאיזה עסק אני עכשיו.
// סיום משמרת אינו כאן במכוון — מדיניות ה-RLS מ-0002 מתירה לשליח לשנות
// סטטוס רק מ-pending ל-active/rejected. מי שסוגר משמרת הוא בעל העסק.

export function ShiftInvites({
  shifts,
  loading,
  onChanged,
}: {
  shifts: ShiftWithBusiness[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const activeShift = shifts.find((s) => s.status === 'active');
  const pending = shifts.filter((s) => s.status === 'pending');

  async function respond(shift: ShiftWithBusiness, accept: boolean) {
    setError('');
    setBusyId(shift.shift_id);

    const { data, error: updateError } = await supabase
      .from('shifts')
      .update(
        accept
          ? { status: 'active', accepted_at: new Date().toISOString() }
          : { status: 'rejected' }
      )
      .eq('shift_id', shift.shift_id)
      .select('shift_id');

    setBusyId(null);

    if (updateError) {
      setError(translateDbError(updateError));
      return;
    }

    // עדכון שנחסם ב-RLS מחזיר אפס שורות בלי שגיאה. הנפוץ כאן: ההזמנה
    // כבר לא ב-pending — בעל העסק ביטל אותה בזמן שהמסך היה פתוח.
    if (!data || data.length === 0) {
      setError('ההזמנה כבר אינה זמינה. ייתכן שבעל העסק ביטל אותה.');
      onChanged();
      return;
    }

    onChanged();
  }

  if (loading) {
    return <p className="text-text-muted">טוען משמרות...</p>;
  }

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      {activeShift && (
        <section className="rounded-xl bg-surface p-5 shadow">
          <p className="text-sm text-text-muted">אתם במשמרת</p>
          <p className="text-xl font-bold">{activeShift.businesses?.name}</p>
          <p className="text-sm text-text-muted">{activeShift.businesses?.address}</p>
        </section>
      )}

      {pending.map((shift) => (
        <section key={shift.shift_id} className="rounded-xl bg-surface p-5 shadow">
          <p className="text-sm text-text-muted">הוזמנתם למשמרת</p>
          <p className="text-xl font-bold">{shift.businesses?.name}</p>
          <p className="text-sm text-text-muted">{shift.businesses?.address}</p>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => respond(shift, true)}
              disabled={busyId === shift.shift_id}
              className="flex-1 rounded-lg bg-primary px-4 py-3 text-white hover:bg-primary-dark disabled:opacity-50"
            >
              אישור
            </button>
            <button
              onClick={() => respond(shift, false)}
              disabled={busyId === shift.shift_id}
              className="flex-1 rounded-lg border border-border px-4 py-3 hover:border-text-muted disabled:opacity-50"
            >
              דחייה
            </button>
          </div>
        </section>
      ))}

      {!activeShift && pending.length === 0 && (
        <p className="text-text-muted">
          אין כרגע הזמנות למשמרת. כשבעל עסק יזמין אתכם, ההזמנה תופיע כאן.
        </p>
      )}
    </div>
  );
}
