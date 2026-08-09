import { useState } from 'react';
import { translateDbError, VEHICLE_LABELS, type ShiftWithCourier } from '@delivery/shared';
import { supabase } from '../../lib/supabase';

// שתי הרשימות שבעל העסק צריך כדי לדעת מי בשטח עכשיו: מי אישר, ומי עוד
// לא ענה. משמרות שהסתיימו או נדחו לא מוצגות — הן נשמרות ב-DB בשביל
// היסטוריה, לא בשביל המסך הזה.

export function ShiftsList({
  shifts,
  loading,
  onChanged,
}: {
  shifts: ShiftWithCourier[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const active = shifts.filter((s) => s.status === 'active');
  const pending = shifts.filter((s) => s.status === 'pending');

  async function closeShift(shift: ShiftWithCourier) {
    setError('');
    setBusyId(shift.shift_id);

    const { data, error: updateError } = await supabase
      .from('shifts')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('shift_id', shift.shift_id)
      .select('shift_id');

    setBusyId(null);

    if (updateError) {
      setError(translateDbError(updateError));
      return;
    }

    // RLS חוסמת עדכון בשקט — מחזירה אפס שורות בלי שגיאה. בלי הבדיקה הזו
    // הכפתור ייראה כאילו עבד ושום דבר לא ישתנה.
    if (!data || data.length === 0) {
      setError('לא הצלחנו לעדכן את המשמרת. רעננו את הדף ונסו שוב.');
      return;
    }

    onChanged();
  }

  if (loading) {
    return <p className="text-text-muted">טוען משמרות...</p>;
  }

  if (active.length === 0 && pending.length === 0) {
    return (
      <p className="text-text-muted">
        אין כרגע שליחים במשמרת. הזמינו שליח לפי מספר הטלפון שלו.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      {active.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">במשמרת ({active.length})</h2>
          <ul className="space-y-2">
            {active.map((shift) => (
              <li
                key={shift.shift_id}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface p-4 shadow"
              >
                <CourierSummary shift={shift} />
                <button
                  onClick={() => closeShift(shift)}
                  disabled={busyId === shift.shift_id}
                  className="rounded-lg border border-border px-3 py-2 text-sm hover:border-text-muted disabled:opacity-50"
                >
                  {busyId === shift.shift_id ? 'מסיים...' : 'סיום משמרת'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">ממתינים לאישור ({pending.length})</h2>
          <ul className="space-y-2">
            {pending.map((shift) => (
              <li
                key={shift.shift_id}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface p-4 shadow"
              >
                <CourierSummary shift={shift} />
                <button
                  onClick={() => closeShift(shift)}
                  disabled={busyId === shift.shift_id}
                  className="rounded-lg border border-border px-3 py-2 text-sm hover:border-text-muted disabled:opacity-50"
                >
                  {busyId === shift.shift_id ? 'מבטל...' : 'ביטול הזמנה'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CourierSummary({ shift }: { shift: ShiftWithCourier }) {
  const courier = shift.couriers;

  return (
    <div>
      <p className="font-bold">{courier?.name ?? 'שליח'}</p>
      <p className="text-sm text-text-muted">
        {courier?.phone}
        {courier?.vehicle_type ? ` · ${VEHICLE_LABELS[courier.vehicle_type]}` : ''}
      </p>
    </div>
  );
}
