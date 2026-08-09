import { useState } from 'react';
import { translateDbError, type AddressSuggestion, type Business } from '@delivery/shared';
import { supabase } from '../../lib/supabase';
import { AddressField, type Precision } from '../deliveries/AddressField';

// businesses.lat/lng נולדו nullable כי בהרשמה אין קואורדינטות — הגיאוקודינג
// נדחה לשלב הזה במכוון. אבל בלי המיקום של המסעדה אין נקודת מוצא למסלול,
// והמפה בשלב 3 והאופטימיזציה בשלב 6 שניהם תלויים בה. לכן זו חסימה
// מוצגת ולא רמז: כל עוד אין מיקום, אין ממה לחשב.

export function BusinessLocation({ business, onSaved }: { business: Business; onSaved: () => void }) {
  const [address, setAddress] = useState(business.address);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [precision, setPrecision] = useState<Precision>('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function pick(suggestion: AddressSuggestion) {
    setAddress(suggestion.label);
    setCoords({ lat: suggestion.lat, lng: suggestion.lng });
    setPrecision(suggestion.precise ? 'exact' : 'street');
  }

  async function save() {
    if (!coords) return;
    setError('');
    setSaving(true);

    const { data, error: updateError } = await supabase
      .from('businesses')
      .update({ address, lat: coords.lat, lng: coords.lng })
      .eq('business_id', business.business_id)
      .select('business_id');

    setSaving(false);

    if (updateError) {
      setError(translateDbError(updateError));
      return;
    }
    if (!data || data.length === 0) {
      setError('לא הצלחנו לשמור את המיקום. רעננו את הדף ונסו שוב.');
      return;
    }

    onSaved();
  }

  return (
    <section className="rounded-xl border border-danger bg-surface p-5">
      <h2 className="mb-1 text-lg font-bold">חסר המיקום של העסק</h2>
      <p className="mb-3 text-sm text-text-muted">
        כל מסלול מתחיל מהמסעדה. בחרו את הכתובת מהרשימה כדי לקבע את נקודת המוצא.
      </p>

      <AddressField
        value={address}
        onChange={(v) => {
          setAddress(v);
          setCoords(null);
          setPrecision('none');
        }}
        onPick={pick}
        precision={precision}
      />

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <button
        onClick={save}
        disabled={!coords || saving}
        className="mt-3 w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {saving ? 'שומר...' : 'שמירת מיקום העסק'}
      </button>
    </section>
  );
}
