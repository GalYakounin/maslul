import { useState, type FormEvent } from 'react';
import {
  normalizePhone,
  translateDbError,
  PAYMENT_LABELS,
  type AddressSuggestion,
  type Delivery,
  type PaymentMethod,
} from '@delivery/shared';
import { supabase } from '../../lib/supabase';
import { Field } from '../../components/Field';
import { AddressField, type Precision } from './AddressField';

// שלוש שכבות, לפי סדר יורד של בטיחות מפני שגיאות:
//   1. טלפון → מילוי מהזמנה קודמת. אפס הקלדה, אפס סיכון.
//   2. בחירת כתובת מרשימה. הקואורדינטות מגיעות איתה.
//   3. הערת כתובת בטקסט חופשי — קומה, דירה, קוד שער. אין לזה תחליף,
//      שום מנוע חיפוש לא יחזיר את זה.

const EMPTY = {
  customerName: '',
  address: '',
  addressNote: '',
  orderDetails: '',
  price: '',
};

export function NewDelivery({ businessId, onCreated }: { businessId: string; onCreated: () => void }) {
  const [phone, setPhone] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [precision, setPrecision] = useState<Precision>('none');
  const [returning, setReturning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof typeof EMPTY>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // שכבה 1 — הלקוח כבר הזמין בעבר, אז הכל כבר אצלנו ומאומת.
  async function lookupCustomer() {
    const normalized = normalizePhone(phone);
    if (normalized.length < 9) return;

    const { data } = await supabase
      .from('deliveries')
      .select('customer_name, address, address_note, lat, lng')
      .eq('business_id', businessId)
      .eq('customer_phone', normalized)
      .order('created_at', { ascending: false })
      .limit(1);

    const previous = data?.[0] as Partial<Delivery> | undefined;
    if (!previous) return;

    setForm((prev) => ({
      ...prev,
      customerName: previous.customer_name ?? '',
      address: previous.address ?? '',
      addressNote: previous.address_note ?? '',
    }));
    const hasCoords = previous.lat != null && previous.lng != null;
    setCoords(hasCoords ? { lat: previous.lat!, lng: previous.lng! } : null);
    // הזמנה קודמת שכבר נשמרה עם קואורדינטות עברה את אותה בדיקה בזמנה,
    // ואם היא תוקנה ידנית על המפה — היא מדויקת יותר מכל מה שנחפש עכשיו.
    setPrecision(hasCoords ? 'exact' : 'none');
    setReturning(true);
  }

  function pickAddress(suggestion: AddressSuggestion) {
    set('address', suggestion.label);
    setCoords({ lat: suggestion.lat, lng: suggestion.lng });
    setPrecision(suggestion.precise ? 'exact' : 'street');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    // אגורות, integer. לעולם לא float — ראו CLAUDE.md.
    const priceAgorot = Math.round(parseFloat(form.price || '0') * 100);

    const { error: insertError } = await supabase.from('deliveries').insert({
      business_id: businessId,
      customer_phone: normalizePhone(phone),
      customer_name: form.customerName || null,
      address: form.address,
      address_note: form.addressNote || null,
      order_details: form.orderDetails || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      // משמעות הערכים, ושווה לשמור על ההפרדה הזו:
      //   ok      — מדויק לבניין, מהמאגר
      //   pending — מרכז רחוב. יש נקודה, אבל היא ממתינה לאדם
      //   manual  — אדם נעץ אותה על המפה. אמין
      //   failed  — אין נקודה כלל
      geocode_status: precision === 'exact' ? 'ok' : precision === 'street' ? 'pending' : 'failed',
      price_agorot: Number.isFinite(priceAgorot) ? priceAgorot : 0,
      payment_method: payment,
    });

    setSaving(false);

    if (insertError) {
      setError(translateDbError(insertError));
      return;
    }

    setPhone('');
    setForm(EMPTY);
    setCoords(null);
    setPrecision('none');
    setPayment('cash');
    setReturning(false);
    onCreated();
  }

  return (
    <section className="rounded-xl bg-surface p-5 shadow">
      <h2 className="mb-3 text-lg font-bold">משלוח חדש</h2>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div onBlur={lookupCustomer}>
          <Field label="טלפון הלקוח" value={phone} onChange={setPhone} type="tel" required />
        </div>

        {returning && (
          <p className="text-sm text-secondary">
            לקוח חוזר — הפרטים מולאו מההזמנה הקודמת. אפשר לתקן אם השתנה משהו.
          </p>
        )}

        <Field label="שם הלקוח" value={form.customerName} onChange={(v) => set('customerName', v)} />

        <AddressField
          value={form.address}
          onChange={(v) => {
            set('address', v);
            setCoords(null);
            setPrecision('none');
          }}
          onPick={pickAddress}
          precision={precision}
        />

        <Field
          label="קומה, דירה, קוד שער"
          value={form.addressNote}
          onChange={(v) => set('addressNote', v)}
        />

        <Field label="פרטי ההזמנה" value={form.orderDetails} onChange={(v) => set('orderDetails', v)} />

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="מחיר בשקלים" value={form.price} onChange={(v) => set('price', v)} />
          </div>

          <div className="flex-1 space-y-1">
            <label className="block text-sm text-text-muted">אמצעי תשלום</label>
            <select
              value={payment}
              onChange={(e) => setPayment(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-border px-3 py-2"
            >
              {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? 'שומר...' : 'הוספת משלוח'}
        </button>
      </form>
    </section>
  );
}
