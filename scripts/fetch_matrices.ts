// מושך מטריצות זמן נסיעה אמיתיות מ-ORS עבור אצוות מהמערך המדומה,
// ושומר אותן במטמון על הדיסק.
//
// ── למה מטמון ──
// המכסה היא 500 קריאות מטריצה ליום. בלי מטמון, כל הרצה חוזרת של
// המדידה הייתה שורפת אותה מחדש — ואז אי אפשר לחזור על תוצאה בלי
// לחכות ליום הבא. עם מטמון, הקריאות משולמות פעם אחת והמדידה
// ניתנת לשחזור לנצח.
//
// ── למה דרך getDurationMatrix ולא fetch ישיר ──
// זה בדיוק המסלול שהאפליקציה עוברת בייצור, כולל הנפילה הרכה
// להערכה. מדידה שעוקפת אותו מודדת משהו אחר.
//
// שימוש:
//   npm run matrices              # 150 אצוות (ברירת מחדל)
//   npm run matrices -- 60        # פחות, אם נשארה מעט מכסה

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { getDurationMatrix } from '../packages/shared/src/durationMatrix';
import type { Point } from '../packages/shared/src/optimize';

const BATCHES_PATH = 'data/batches.json';
const CACHE_PATH = 'data/matrices.json';
const ENV_PATH = 'apps/dashboard/.env';

const LIMIT = Number(process.argv[2] ?? 150);

// תקרת ORS היא 40 בקשות לדקה. 1,700ms נותן ~35 — מרווח מכוון,
// כי חריגה מחזירה 429 ומבזבזת את הקריאה בלי לקבל מטריצה.
const DELAY_MS = 1700;

interface CachedEntry {
  batchId: number;
  durations: number[][];
  source: string;
  reason?: string;
}

function readEnv(): { url: string; key: string } {
  if (!existsSync(ENV_PATH)) {
    throw new Error(`לא נמצא ${ENV_PATH}`);
  }
  const env = Object.fromEntries(
    readFileSync(ENV_PATH, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error(`חסרים VITE_SUPABASE_URL או VITE_SUPABASE_ANON_KEY ב-${ENV_PATH}`);
  return { url, key };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { url, key } = readEnv();
  const supabase = createClient(url, key);
  const data = JSON.parse(readFileSync(BATCHES_PATH, 'utf-8'));

  const cache: Record<string, CachedEntry> = existsSync(CACHE_PATH)
    ? JSON.parse(readFileSync(CACHE_PATH, 'utf-8')).entries
    : {};

  const todo = data.batches
    .slice(0, LIMIT)
    .filter((b: { id: number }) => !cache[b.id]);

  console.log(`${data.batches.length} אצוות במערך, ${LIMIT} מבוקשות.`);
  console.log(`${Object.keys(cache).length} כבר במטמון, ${todo.length} לשליפה.`);
  if (todo.length === 0) {
    console.log('אין מה למשוך. המטמון מלא.');
    return;
  }
  console.log(`בקצב של ${Math.round(60000 / DELAY_MS)} לדקה — כ-${Math.ceil((todo.length * DELAY_MS) / 60000)} דקות.\n`);

  let provider = 0;
  let estimate = 0;

  for (let i = 0; i < todo.length; i++) {
    const batch = todo[i];
    const points: Point[] = [
      data.restaurant,
      ...batch.stops.map((s: Point) => ({ lat: s.lat, lng: s.lng })),
    ];

    const result = await getDurationMatrix(supabase, points);
    cache[batch.id] = {
      batchId: batch.id,
      durations: result.durations,
      source: result.source,
      reason: result.reason,
    };

    if (result.source === 'provider') provider++;
    else {
      estimate++;
      // נפילה אחת סבירה; רצף נפילות אומר שנגמרה המכסה, ואין טעם
      // להמשיך לדפוק על דלת סגורה ולזהם את המדידה בהערכות.
      console.log(`  אצווה ${batch.id}: נפילה להערכה — ${result.reason}`);
      if (estimate >= 5 && provider === 0) {
        console.error('\nחמש נפילות רצופות בלי הצלחה אחת. עוצר.');
        break;
      }
    }

    if ((i + 1) % 10 === 0) {
      process.stdout.write(`  ${i + 1}/${todo.length}\n`);
      writeFileSync(
        CACHE_PATH,
        JSON.stringify({ savedAt: new Date().toISOString(), entries: cache }, null, 1),
        'utf-8'
      );
    }

    if (i < todo.length - 1) await sleep(DELAY_MS);
  }

  writeFileSync(
    CACHE_PATH,
    JSON.stringify({ savedAt: new Date().toISOString(), entries: cache }, null, 1),
    'utf-8'
  );

  console.log(`\nנשמר ${CACHE_PATH}`);
  console.log(`  מטריצות אמיתיות: ${provider}`);
  console.log(`  נפילות להערכה:   ${estimate}`);
  console.log(`  סה"כ במטמון:      ${Object.keys(cache).length}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
