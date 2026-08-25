import { useState } from 'react';
import {
  bestOrder,
  getDurationMatrix,
  sortStops,
  totalWait,
  translateDbError,
  DELIVERY_STATUS_LABELS,
  ROUTE_STATUS_LABELS,
  type Business,
  type Delivery,
  type MatrixSource,
  type Point,
  type RouteWithStops,
} from '@delivery/shared';
import { supabase } from '../../lib/supabase';

// כרטיס מסלול. ניתן לעריכה **רק בטיוטה** — ברגע שנשלח לשליח הוא קופא.
// זה נובע ישירות מהאילוץ העסקי: אצווה שיצאה היא סגורה, ואין ניתוב
// מחדש תוך כדי נסיעה. מי שמציע לערוך מסלול משוגר סותר את הבסיס.
//
// מצב המשלוחים נקרא מהרשימה החיה של הדשבורד ולא מהעותק המשובץ
// בשאילתת המסלול. הסיבה: מנוי Realtime על `routes` אינו מקבל אירוע
// כששורה ב-`deliveries` משתנה — וכשהשליח מסמן "נמסר" זה בדיוק מה
// שקורה. שני עותקים של אותו נתון היו מתפצלים, והכפתור "סגירת מסלול"
// לא היה מופיע עד רענון ידני.

interface OptimizeResult {
  savedSeconds: number;
  source: MatrixSource;
  reason?: string;
}

export function RouteCard({
  route,
  business,
  deliveries,
  onChanged,
}: {
  route: RouteWithStops;
  business: Business;
  deliveries: Delivery[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [optimized, setOptimized] = useState<OptimizeResult | null>(null);

  const live = new Map(deliveries.map((d) => [d.delivery_id, d]));
  const stops = sortStops(route.route_stops ?? []).map((stop) => ({
    ...stop,
    deliveries: live.get(stop.delivery_id) ?? stop.deliveries,
  }));

  const editable = route.status === 'draft';
  const deliveryIds = stops.map((s) => s.delivery_id);
  const deliveredCount = stops.filter((s) => s.deliveries?.status === 'delivered').length;

  async function run(action: () => Promise<{ error: unknown }>) {
    setError('');
    setBusy(true);
    const { error: actionError } = await action();
    setBusy(false);
    if (actionError) {
      setError(translateDbError(actionError));
      return;
    }
    onChanged();
  }

  // החלפת מקומות בין שתי עצירות. `sequence` הוא מספר רגיל בלי אילוץ
  // ייחודיות, ולכן החלפה פשוטה בטוחה.
  async function swap(indexA: number, indexB: number) {
    const a = stops[indexA];
    const b = stops[indexB];
    if (!a || !b) return;

    await run(async () => {
      const first = await supabase
        .from('route_stops')
        .update({ sequence: b.sequence })
        .eq('route_id', route.route_id)
        .eq('delivery_id', a.delivery_id);
      if (first.error) return { error: first.error };

      return await supabase
        .from('route_stops')
        .update({ sequence: a.sequence })
        .eq('route_id', route.route_id)
        .eq('delivery_id', b.delivery_id);
    });
  }

  // ═══════════════ חישוב הסדר האופטימלי ═══════════════
  // ממזער Σ(זמן הגעה − ready_at) — לא אורך מסלול. ראו optimize.ts.
  //
  // הכפתור הוא **הצעה על גבי סידור ידני שכבר עובד**, ולא תנאי לשיגור.
  // אם הספק החיצוני נופל בשעת עומס, בעל העסק ממשיך כרגיל עם החיצים.
  async function optimize() {
    setError('');
    setOptimized(null);

    if (business.lat === null || business.lng === null) {
      setError('למסעדה אין מיקום. קבעו אותו לפני חישוב מסלול.');
      return;
    }

    // כתובת בלי נקודה אינה יכולה להיכנס לחישוב, ו**אסור** לדלג עליה
    // בשקט — משלוח שנשמט מהסדר יגיע אחרון בפועל.
    const missing = stops.filter((s) => s.deliveries?.lat == null);
    if (missing.length > 0) {
      setError(
        `${missing.length} משלוחים בלי מיקום. נעצו אותם בלשונית המפה לפני החישוב.`
      );
      return;
    }

    setBusy(true);

    const depot: Point = { lat: business.lat, lng: business.lng };
    const points: Point[] = [
      depot,
      ...stops.map((s) => ({ lat: s.deliveries!.lat!, lng: s.deliveries!.lng! })),
    ];

    const { durations, source, reason } = await getDurationMatrix(supabase, points);

    // כמה זמן כל מנה כבר המתינה. מנה בלי ready_at טרם יצאה מהמטבח,
    // ולכן היא ממתינה אפס — לא שלילי.
    const now = Date.now();
    const readyOffsets = [
      0,
      ...stops.map((s) => {
        const readyAt = s.deliveries?.ready_at;
        return readyAt ? Math.max(0, (now - new Date(readyAt).getTime()) / 1000) : 0;
      }),
    ];

    const current = stops.map((_, i) => i + 1);
    const best = bestOrder(durations);
    const saved =
      totalWait(current, durations, readyOffsets) -
      totalWait(best, durations, readyOffsets);

    // כתיבה בשני שלבים. `sequence` אינו ייחודי בסכימה, אבל כתיבה
    // ישירה על טווח חופף הופכת מצב ביניים לבלתי קריא אם משהו נכשל
    // באמצע. סדר זמני גבוה מפנה את הטווח 1..n לגמרי.
    const OFFSET = 1000;
    for (let i = 0; i < best.length; i++) {
      const stop = stops[best[i] - 1];
      const first = await supabase
        .from('route_stops')
        .update({ sequence: OFFSET + i + 1 })
        .eq('route_id', route.route_id)
        .eq('delivery_id', stop.delivery_id);
      if (first.error) {
        setBusy(false);
        setError(translateDbError(first.error));
        return;
      }
    }
    for (let i = 0; i < best.length; i++) {
      const stop = stops[best[i] - 1];
      const second = await supabase
        .from('route_stops')
        .update({ sequence: i + 1 })
        .eq('route_id', route.route_id)
        .eq('delivery_id', stop.delivery_id);
      if (second.error) {
        setBusy(false);
        setError(translateDbError(second.error));
        return;
      }
    }

    setBusy(false);
    setOptimized({ savedSeconds: saved, source, reason });
    onChanged();
  }

  const send = () =>
    run(async () => await supabase.from('routes').update({ status: 'offered' }).eq('route_id', route.route_id));

  // יציאה בפועל: המסלול משוגר, וכל המשלוחים נאספו יחד. picked_up_at
  // אחיד לכולם כי זו אצווה סגורה — השליח לקח את כולם באותו רגע.
  const dispatch = () =>
    run(async () => {
      const now = new Date().toISOString();
      const routeUpdate = await supabase
        .from('routes')
        .update({ status: 'dispatched', dispatched_at: now })
        .eq('route_id', route.route_id);
      if (routeUpdate.error) return { error: routeUpdate.error };

      return await supabase
        .from('deliveries')
        .update({ status: 'picked_up', picked_up_at: now })
        .in('delivery_id', deliveryIds);
    });

  // ביטול מחזיר את המשלוחים למאגר הפנוי, אחרת הם נעולים לנצח.
  const cancel = () =>
    run(async () => {
      const routeUpdate = await supabase
        .from('routes')
        .update({ status: 'cancelled' })
        .eq('route_id', route.route_id);
      if (routeUpdate.error) return { error: routeUpdate.error };

      return await supabase
        .from('deliveries')
        .update({ status: 'ready' })
        .in('delivery_id', deliveryIds);
    });

  return (
    <article className="rounded-xl bg-surface p-4 shadow">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-bold">{route.couriers?.name ?? 'ללא שליח'}</p>
          <p className="text-sm text-text-muted">
            {ROUTE_STATUS_LABELS[route.status]} · {stops.length} עצירות
            {route.status === 'dispatched' ? ` · נמסרו ${deliveredCount}` : ''}
          </p>
        </div>
      </header>

      <ol className="space-y-2">
        {stops.map((stop, index) => (
          <li key={stop.delivery_id} className="flex items-start gap-3 rounded-lg border border-border p-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm text-white">
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate">{stop.deliveries?.address}</p>
              {stop.deliveries?.address_note && (
                <p className="text-sm text-text-muted">{stop.deliveries.address_note}</p>
              )}
              <p className="text-sm text-text-muted">
                {stop.deliveries ? DELIVERY_STATUS_LABELS[stop.deliveries.status] : ''}
              </p>
            </div>

            {editable && (
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => swap(index, index - 1)}
                  disabled={busy || index === 0}
                  className="rounded border border-border px-2 py-1 text-sm disabled:opacity-30"
                  aria-label="הזזה למעלה"
                >
                  ↑
                </button>
                <button
                  onClick={() => swap(index, index + 1)}
                  disabled={busy || index === stops.length - 1}
                  className="rounded border border-border px-2 py-1 text-sm disabled:opacity-30"
                  aria-label="הזזה למטה"
                >
                  ↓
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {optimized && (
        <div className="mt-2 rounded-lg border border-border p-2 text-sm">
          <p>
            {optimized.savedSeconds >= 30
              ? `הסדר עודכן. חיסכון משוער: ${Math.round(optimized.savedSeconds / 60)} דקות המתנה בסך הכל.`
              : 'הסדר שהיה כבר היה הטוב ביותר — לא היה מה לשפר.'}
          </p>
          {/* הערכה שמוצגת כנתון אמיתי היא אותו כשל של קואורדינטה
              שגויה בשקט. אם לא הגיע נתון נסיעה — אומרים את זה. */}
          {optimized.source === 'estimate' && (
            <p className="mt-1 text-text-muted">
              {optimized.reason} החישוב התבסס על מרחק אווירי מוערך ולא על זמני נסיעה
              אמיתיים.
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {editable && stops.length > 1 && (
          <button
            onClick={optimize}
            disabled={busy}
            className="rounded-lg border border-primary px-4 py-2 text-sm text-primary hover:bg-primary hover:text-white disabled:opacity-50"
          >
            {busy ? 'מחשב...' : 'חשב סדר אופטימלי'}
          </button>
        )}

        {route.status === 'draft' && (
          <button
            onClick={send}
            disabled={busy || stops.length === 0}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
          >
            שליחה לשליח
          </button>
        )}

        {route.status === 'offered' && (
          <button
            onClick={dispatch}
            disabled={busy}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
          >
            השליח יצא
          </button>
        )}

        {/* השליח אינו רשאי לעדכן routes (אין לו policy), ולכן סגירת
            המסלול היא פעולה של בעל העסק — אחרי שכל העצירות נמסרו. */}
        {route.status === 'dispatched' && deliveredCount === stops.length && stops.length > 0 && (
          <button
            onClick={() =>
              run(async () =>
                await supabase
                  .from('routes')
                  .update({ status: 'completed', completed_at: new Date().toISOString() })
                  .eq('route_id', route.route_id)
              )
            }
            disabled={busy}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
          >
            סגירת מסלול
          </button>
        )}

        {(route.status === 'draft' || route.status === 'offered') && (
          <button
            onClick={cancel}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:border-text-muted disabled:opacity-50"
          >
            ביטול
          </button>
        )}
      </div>
    </article>
  );
}
