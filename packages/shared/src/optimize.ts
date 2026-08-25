// ═══════════════ סידור עצירות בתוך אצווה ═══════════════
//
// כל הפונקציות כאן טהורות ואינן יודעות דבר על Supabase, על HTTP או על
// ספק מטריצת הזמנים. זה מכוון: שלב 6 יחליף מטריצת מרחק אווירי במטריצה
// אמיתית מ-OpenRouteService, וההחלפה הזו לא אמורה לגעת בשורה אחת כאן.
//
// ── פונקציית המטרה ──
// זו *לא* בעיית הסוכן הנוסע. TSP ממזער אורך מסלול; ללקוח לא אכפת כמה
// השליח נסע, אכפת לו מתי הוא קיבל. ממזערים:
//
//     Σᵢ ( arrival_timeᵢ − ready_atᵢ )
//
// זו Minimum Latency Problem (Traveling Repairman).
//
// ── ההבחנה שחוסכת בלבול ──
// בתוך אצווה נתונה Σ ready_at הוא קבוע — הוא אינו תלוי בסדר. לכן
// מזעור סכום זמני ההגעה **שקול** למזעור סכום ההמתנה, ו-bestOrder
// אינו זקוק ל-ready_at כלל. הוא נחוץ כדי לדווח המתנה במספרים
// אמיתיים, וכדי להרכיב את האצווה (שלב 7) — לא כדי לסדר בתוכה.

export interface Point {
  lat: number;
  lng: number;
}

/**
 * durations[i][j] = שניות נסיעה מנקודה i לנקודה j.
 * אינדקס 0 הוא תמיד המסעדה; העצירות הן 1..n.
 */
export type DurationMatrix = number[][];

/** מעל זה ברוט-פורס מפסיק להיות סביר. ראו bestOrder. */
export const MAX_BRUTE_FORCE_STOPS = 8;

// ═══════════════ מרחק אווירי ═══════════════
// **תחליף זמני בלבד.** מרחק אווירי מתעלם מכבישים: שני בתים במרחק 400
// מטר אוויריים יכולים להיות שבע דקות נסיעה אם ביניהם מסילה או כביש
// מהיר. הוא כאן כדי לאפשר מדידה לפני שיש ספק מטריצה, ואסור שיגיע
// לייצור — ראו spec.md §3.2.

export function haversineMeters(a: Point, b: Point): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * מטריצת זמנים משוערת ממרחק אווירי.
 *
 * detourFactor מנפח את המרחק כדי לקרב רשת כבישים — קו ישר בין שתי
 * נקודות בעיר כמעט אף פעם אינו נסיע. 1.3 הוא ערך מקובל לעיר.
 * זהו קירוב אחיד, ולכן הוא **לא** מתקן את הכשל האמיתי של מרחק אווירי:
 * מכשול נקודתי בין שתי נקודות ספציפיות.
 */
export function haversineMatrix(
  points: Point[],
  speedKmh = 25,
  detourFactor = 1.3
): DurationMatrix {
  const mps = (speedKmh * 1000) / 3600;
  return points.map((a) =>
    points.map((b) => (a === b ? 0 : (haversineMeters(a, b) * detourFactor) / mps))
  );
}

// ═══════════════ פונקציית המטרה ═══════════════

/**
 * סכום זמני ההגעה לאורך הסדר הנתון, בשניות מרגע היציאה מהמסעדה.
 * order הוא רשימת אינדקסים של עצירות (1..n), בסדר הנסיעה.
 */
export function totalArrivalTime(order: number[], m: DurationMatrix): number {
  let t = 0;
  let sum = 0;
  let prev = 0; // המסעדה
  for (const stop of order) {
    t += m[prev][stop];
    sum += t;
    prev = stop;
  }
  return sum;
}

/**
 * סכום ההמתנה של הלקוחות — פונקציית המטרה האמיתית.
 *
 * readyOffsets[i] = כמה שניות המנה של עצירה i כבר המתינה *ברגע
 * היציאה*. מנה שיצאה מהמטבח עשר דקות לפני שהשליח יצא נושאת איתה
 * 600 שניות המתנה עוד לפני שהתחילה הנסיעה.
 *
 * הערך הזה קבוע לכל סדר, ולכן אינו משפיע על הבחירה — אבל בלעדיו
 * המספר המדווח אינו ההמתנה שהלקוח חווה.
 */
export function totalWait(
  order: number[],
  m: DurationMatrix,
  readyOffsets: number[]
): number {
  let t = 0;
  let sum = 0;
  let prev = 0;
  for (const stop of order) {
    t += m[prev][stop];
    sum += readyOffsets[stop] + t;
    prev = stop;
  }
  return sum;
}

// ═══════════════ אסטרטגיות סידור ═══════════════

/** כל התמורות של המערך, כגנרטור — לא בונים 40,320 מערכים בזיכרון בבת אחת. */
export function* permutations<T>(items: readonly T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield [...items];
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const perm of permutations(rest)) {
      yield [items[i], ...perm];
    }
  }
}

/**
 * הסדר האופטימלי, מוכח. ברוט-פורס על כל התמורות.
 *
 * ב-n=8 אלה 40,320 תמורות, כ-20ms. **אל תחליפו ב-OR-Tools** לפני
 * שיש משתמשים: הוא Python, כלומר שירות נפרד לפרוס ולתחזק, ובגודל
 * הזה ברוט-פורס כבר מחזיר תשובה אופטימלית מוכחת.
 * מעל MAX_BRUTE_FORCE_STOPS — Held-Karp, O(n²·2ⁿ).
 */
export function bestOrder(m: DurationMatrix): number[] {
  const n = m.length - 1;
  if (n > MAX_BRUTE_FORCE_STOPS) {
    throw new Error(
      `ברוט-פורס אינו סביר מעל ${MAX_BRUTE_FORCE_STOPS} עצירות (התקבלו ${n}). ` +
        `החליפו ל-Held-Karp.`
    );
  }
  const stops = Array.from({ length: n }, (_, i) => i + 1);
  let best: number[] = stops;
  let bestCost = Infinity;
  for (const perm of permutations(stops)) {
    const cost = totalArrivalTime(perm, m);
    if (cost < bestCost) {
      bestCost = cost;
      best = perm;
    }
  }
  return best;
}

/**
 * קו בסיס 1 — סדר ההכנה. מי שיצא מהמטבח ראשון נמסר ראשון.
 *
 * זה מה שבעל עסק עושה כברירת מחדל, וזה גם הסדר שכרטיס המסלול בדמו
 * מייצר. זהו קו הבסיס הכן ביותר: הוא לא טיפש, הוא פשוט מתעלם
 * מגיאוגרפיה.
 */
export function fifoOrder(readyOffsets: number[]): number[] {
  const stops = Array.from({ length: readyOffsets.length - 1 }, (_, i) => i + 1);
  // המתנה גדולה יותר = מוכן מוקדם יותר = יוצא ראשון
  return stops.sort((a, b) => readyOffsets[b] - readyOffsets[a]);
}

/**
 * קו בסיס 2 — שכן קרוב. תמיד לנקודה הקרובה ביותר שטרם בוקרה.
 *
 * זה מה שבעל עסק שמסתכל על המפה עושה, וזה קו הבסיס המעניין:
 * ניצחון עליו הוא הטענה האמיתית של שלב 6. ניצחון על FIFO בלבד
 * מוכיח רק שגיאוגרפיה קיימת.
 */
export function nearestNeighbourOrder(m: DurationMatrix): number[] {
  const n = m.length - 1;
  const unvisited = new Set(Array.from({ length: n }, (_, i) => i + 1));
  const order: number[] = [];
  let current = 0;
  while (unvisited.size > 0) {
    let next = -1;
    let bestDist = Infinity;
    for (const candidate of unvisited) {
      if (m[current][candidate] < bestDist) {
        bestDist = m[current][candidate];
        next = candidate;
      }
    }
    order.push(next);
    unvisited.delete(next);
    current = next;
  }
  return order;
}

/**
 * קו בסיס 3 — אקראי. הרצפה, לא תחרות אמיתית.
 *
 * מקבל מגריל מבחוץ כדי שהמדידה תהיה ניתנת לשחזור. אין טעם לדווח
 * שיפור מול אקראי כהישג — הוא כאן רק כדי לקבע את הקצה התחתון.
 */
export function randomOrder(n: number, random: () => number): number[] {
  const stops = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = stops.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [stops[i], stops[j]] = [stops[j], stops[i]];
  }
  return stops;
}
