import { useState } from 'react';
import {
  translateDbError,
  DELIVERY_STATUS_LABELS,
  PAYMENT_LABELS,
  type Delivery,
} from '@delivery/shared';
import { supabase } from '../../lib/supabase';

// ready_at הוא הרגע שבו המנה יצאה מהמטבח, והוא נכתב כאן ורק כאן.
// בלעדיו אין פונקציית מטרה: המטרה היא Σ(זמן הגעה − ready_at), ומשלוח
// בלי ready_at פשוט לא ניתן למדידה. זו הסיבה שהכפתור הזה קיים כבר
// בשלב 2, הרבה לפני שיש אלגוריתם שישתמש בו.

export function DeliveriesList({
  deliveries,
  loading,
  onChanged,
}: {
  deliveries: Delivery[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const open = deliveries.filter((d) => d.status === 'new' || d.status === 'ready');

  async function markReady(delivery: Delivery) {
    setError('');
    setBusyId(delivery.delivery_id);

    const { data, error: updateError } = await supabase
      .from('deliveries')
      .update({ status: 'ready', ready_at: new Date().toISOString() })
      .eq('delivery_id', delivery.delivery_id)
      .select('delivery_id');

    setBusyId(null);

    if (updateError) {
      setError(translateDbError(updateError));
      return;
    }
    if (!data || data.length === 0) {
      setError('לא הצלחנו לעדכן את המשלוח. רעננו את הדף ונסו שוב.');
      return;
    }

    onChanged();
  }

  if (loading) return <p className="text-text-muted">טוען משלוחים...</p>;

  if (open.length === 0) {
    return <p className="text-text-muted">אין משלוחים פתוחים כרגע.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-danger">{error}</p>}

      <h2 className="text-lg font-bold">משלוחים פתוחים ({open.length})</h2>

      <ul className="space-y-2">
        {open.map((delivery) => (
          <li key={delivery.delivery_id} className="rounded-xl bg-surface p-4 shadow">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold">{delivery.address}</p>
                {delivery.address_note && (
                  <p className="text-sm text-text-muted">{delivery.address_note}</p>
                )}
                <p className="text-sm text-text-muted">
                  {delivery.customer_name ? `${delivery.customer_name} · ` : ''}
                  {delivery.customer_phone}
                </p>
                <p className="text-sm text-text-muted">
                  {(delivery.price_agorot / 100).toFixed(2)} ₪ ·{' '}
                  {PAYMENT_LABELS[delivery.payment_method]} ·{' '}
                  {DELIVERY_STATUS_LABELS[delivery.status]}
                </p>

                {delivery.lat === null && (
                  <p className="mt-1 text-sm text-danger">
                    ללא מיקום על המפה — לא ייכנס לחישוב מסלול עד שייקבע מיקום.
                  </p>
                )}
              </div>

              {delivery.status === 'new' && (
                <button
                  onClick={() => markReady(delivery)}
                  disabled={busyId === delivery.delivery_id}
                  className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {busyId === delivery.delivery_id ? 'מסמן...' : 'מוכן'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
