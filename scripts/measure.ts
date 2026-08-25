// מודד את קו הבסיס מול הסדר האופטימלי על מערך האצוות המדומה.
//
// הסקריפט הזה מייבא בדיוק את אותו מודול שישמש את שלב 6
// (packages/shared/src/optimize.ts). זו לא נוחות — זו הנקודה. מדידה
// שמריצה מימוש נפרד מזה שיגיע לייצור מודדת דבר אחר.
//
// **מטריצת הזמנים כאן היא מרחק אווירי, לא נסיעה אמיתית.** ראו את
// הסתייגות ההערכה בדוח שנוצר. ההחלפה ל-OpenRouteService בשלב 6 נוגעת
// בשורה אחת כאן ובאפס שורות במודול.
//
// שימוש:  npm run measure

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  bestOrder,
  fifoOrder,
  haversineMatrix,
  nearestNeighbourOrder,
  randomOrder,
  totalWait,
  type DurationMatrix,
  type Point,
} from '../packages/shared/src/optimize';

// npm run measure                    → מרחק אווירי (ברירת מחדל)
// npm run measure:real                → מטריצות ORS אמיתיות מהמטמון
// npm run measure -- <in> <out> [mat] → מערך אחר, למשל רגישות לגודל
const IN_PATH = process.argv[2] ?? 'data/batches.json';
const OUT_PATH = process.argv[3] ?? 'docs/baseline.md';
const MATRIX_PATH = process.argv[4]; // אופציונלי — מטמון מטריצות אמיתיות

interface Stop extends Point {
  label: string;
  readyOffsetSeconds: number;
}
interface Batch {
  id: number;
  kind: 'sector' | 'mixed';
  stops: Stop[];
}
interface Dataset {
  generatedAt: string;
  seed: number;
  restaurant: Point & { label: string };
  params: Record<string, unknown>;
  batches: Batch[];
}

const STRATEGIES = ['optimal', 'fifo', 'nearest', 'random'] as const;
type Strategy = (typeof STRATEGIES)[number];

interface Row {
  kind: Batch['kind'];
  stops: number;
  /** המתנה ממוצעת ללקוח, בדקות */
  wait: Record<Strategy, number>;
  /** האם הסדר זהה לאופטימלי */
  sameOrder: Record<Strategy, boolean>;
}

// מגריל ניתן לשחזור. Math.random היה הופך כל הרצה לתוצאה אחרת.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function quantile(xs: number[], q: number) {
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function main() {
  const data: Dataset = JSON.parse(readFileSync(IN_PATH, 'utf-8'));
  const rng = makeRng(data.seed);
  const rows: Row[] = [];

  // מטמון מטריצות אמיתיות, אם סופק. אצוות שאינן בו נדלגות במקום
  // להתערבב עם הערכות — תערובת של שני מקורות זמן באותו דוח מייצרת
  // מספר שאי אפשר לפרש.
  let cache: Record<string, { durations: DurationMatrix; source: string }> | null = null;
  if (MATRIX_PATH) {
    if (!existsSync(MATRIX_PATH)) {
      console.error(`לא נמצא ${MATRIX_PATH}. הריצו קודם: npm run matrices`);
      process.exit(1);
    }
    cache = JSON.parse(readFileSync(MATRIX_PATH, 'utf-8')).entries;
  }

  let skipped = 0;
  for (const batch of data.batches) {
    const points: Point[] = [data.restaurant, ...batch.stops];

    let m: DurationMatrix;
    if (cache) {
      const hit = cache[batch.id];
      if (!hit || hit.source !== 'provider') {
        skipped++;
        continue;
      }
      m = hit.durations;
    } else {
      m = haversineMatrix(points);
    }
    // אינדקס 0 הוא המסעדה ואין לה readyOffset; מיישרים כדי שהאינדקסים
    // של המטריצה ושל ההיסטים יהיו אותם אינדקסים.
    const offsets = [0, ...batch.stops.map((s) => s.readyOffsetSeconds)];
    const n = batch.stops.length;

    const orders: Record<Strategy, number[]> = {
      optimal: bestOrder(m),
      fifo: fifoOrder(offsets),
      nearest: nearestNeighbourOrder(m),
      random: randomOrder(n, rng),
    };

    const wait = {} as Record<Strategy, number>;
    const sameOrder = {} as Record<Strategy, boolean>;
    for (const s of STRATEGIES) {
      // לדקות, וללקוח בודד — "הלקוח הממוצע חיכה X דקות" הוא מספר
      // שאפשר להחזיק בראש, בשונה מסכום שניות על פני אצווה.
      wait[s] = totalWait(orders[s], m, offsets) / n / 60;
      sameOrder[s] = orders[s].join(',') === orders.optimal.join(',');
    }

    rows.push({ kind: batch.kind, stops: n, wait, sameOrder });
  }

  if (cache) {
    console.log(`${rows.length} אצוות עם מטריצה אמיתית, ${skipped} דולגו.
`);
  }

  const report = buildReport(data, rows);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, report, 'utf-8');

  console.log(report);
  console.log(`\nנכתב ${OUT_PATH}`);
}

function buildReport(data: Dataset, rows: Row[]): string {
  const groups: { name: string; label: string; rows: Row[] }[] = [
    { name: 'all', label: 'כל האצוות', rows },
    { name: 'sector', label: 'אצוות מקובצות (sector)', rows: rows.filter((r) => r.kind === 'sector') },
    { name: 'mixed', label: 'אצוות מעורבות (mixed)', rows: rows.filter((r) => r.kind === 'mixed') },
  ];

  const out: string[] = [];
  out.push(
    MATRIX_PATH
      ? '# קו בסיס — סדר ידני מול מינימום המתנה (זמני נסיעה אמיתיים)'
      : '# קו בסיס — סדר ידני מול מינימום המתנה'
  );
  out.push('');
  out.push('> **נוצר אוטומטית על ידי `npm run measure`. אל תערכו ידנית.**');
  out.push('>');
  out.push('> **הביקוש מדומה. אין פיילוט מאחורי המספרים האלה.** הכתובות');
  out.push('> אמיתיות ולכן המרחקים אמיתיים, אבל ההזמנות הוגרלו.');
  out.push('');
  out.push(
    `מקור: \`${IN_PATH}\` · ${data.batches.length} אצוות · seed \`${data.seed}\` · ` +
      `מסעדה: ${data.restaurant.label}`
  );
  out.push('');
  out.push('המדד הוא **המתנה ממוצעת ללקוח בדקות** — מרגע שהמנה יצאה מהמטבח');
  out.push('ועד שהיא הגיעה אליו, כולל הזמן שהמתינה על הדלפק לפני שהשליח יצא.');
  out.push('');

  for (const g of groups) {
    if (g.rows.length === 0) continue;
    out.push(`## ${g.label} (${g.rows.length})`);
    out.push('');
    out.push('| אסטרטגיה | המתנה ממוצעת | שיפור האופטימום מולה | זהה לאופטימום |');
    out.push('|---|---|---|---|');

    const optimalWait = mean(g.rows.map((r) => r.wait.optimal));
    for (const s of STRATEGIES) {
      const w = mean(g.rows.map((r) => r.wait[s]));
      const improvement = s === 'optimal' ? null : ((w - optimalWait) / w) * 100;
      const same = (g.rows.filter((r) => r.sameOrder[s]).length / g.rows.length) * 100;
      out.push(
        `| ${labelOf(s)} | ${w.toFixed(2)} דק׳ | ` +
          `${improvement === null ? '—' : improvement.toFixed(1) + '%'} | ` +
          `${same.toFixed(0)}% |`
      );
    }
    out.push('');

    // ממוצע מסתיר את השאלה החשובה: האם השיפור מפוזר או מרוכז
    // בזנב. אצווה שבה הסדר הידני כבר אופטימלי תורמת 0.
    const perBatch = g.rows.map(
      (r) => ((r.wait.nearest - r.wait.optimal) / r.wait.nearest) * 100
    );
    out.push('**התפלגות השיפור מול שכן קרוב, לפי אצווה:**');
    out.push('');
    out.push('| חציון | ממוצע | אחוזון 90 | אחוזון 99 | מקסימום |');
    out.push('|---|---|---|---|---|');
    out.push(
      `| ${quantile(perBatch, 0.5).toFixed(1)}% | ${mean(perBatch).toFixed(1)}% | ` +
        `${quantile(perBatch, 0.9).toFixed(1)}% | ${quantile(perBatch, 0.99).toFixed(1)}% | ` +
        `${Math.max(...perBatch).toFixed(1)}% |`
    );
    out.push('');
  }

  // ═══ הפילוח שהתוצאה למעלה מחייבת ═══
  // אם שכן-קרוב כמעט אופטימלי, השאלה הבאה היא מיידית: האם זה תכונה
  // של האלגוריתם או של גודל האצווה? בשלוש עצירות יש שש תמורות בלבד,
  // וקשה לטעות. המספרים כאן אמורים לגדול עם n.
  const sizes = [...new Set(rows.map((r) => r.stops))].sort((a, b) => a - b);
  if (sizes.length > 1) {
    out.push('## לפי גודל אצווה');
    out.push('');
    out.push('| עצירות | אצוות | תמורות | שכן קרוב = אופטימלי | שיפור מול שכן קרוב | שיפור מול FIFO |');
    out.push('|---|---|---|---|---|---|');
    for (const n of sizes) {
      const g = rows.filter((r) => r.stops === n);
      const opt = mean(g.map((r) => r.wait.optimal));
      const near = mean(g.map((r) => r.wait.nearest));
      const fifo = mean(g.map((r) => r.wait.fifo));
      const same = (g.filter((r) => r.sameOrder.nearest).length / g.length) * 100;
      out.push(
        `| ${n} | ${g.length} | ${factorial(n).toLocaleString('en-US')} | ` +
          `${same.toFixed(0)}% | ${(((near - opt) / near) * 100).toFixed(1)}% | ` +
          `${(((fifo - opt) / fifo) * 100).toFixed(1)}% |`
      );
    }
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push('## איך לקרוא את זה');
  out.push('');
  out.push('**מול מה משווים, ולמה שלושה.** קו בסיס יחיד וגרוע היה מייצר');
  out.push('מספר מרשים וחסר ערך. `אקראי` הוא הרצפה ולא תחרות. `סדר ההכנה`');
  out.push('הוא מה שקורה כברירת מחדל — ראשון שיצא מהמטבח, ראשון שנמסר.');
  out.push('`שכן קרוב` הוא בעל עסק שמסתכל על המפה ובוחר בהיגיון, **וזהו');
  out.push('קו הבסיס היחיד שמעניין**: ניצחון עליו הוא הטענה של שלב 6.');
  out.push('');
  out.push('**עמודת "זהה לאופטימום"** אומרת באיזה אחוז מהאצוות האסטרטגיה');
  out.push('כבר בחרה בדיוק בסדר הנכון. ככל שהיא גבוהה יותר, כך יש לאופטימיזר');
  out.push('פחות מה לתרום — ואת זה עדיף לדעת לפני שבונים אותו.');
  out.push('');
  out.push('**ההתפלגות חשובה מהממוצע.** אם החציון נמוך והאחוזון ה-99 גבוה,');
  out.push('משמעות הדבר שברוב הימים האופטימיזר לא משנה דבר, ולעיתים רחוקות');
  out.push('הוא מציל משלוח גרוע במיוחד. זו טענה שונה לגמרי מ"חוסך זמן כל יום",');
  out.push('ואסור להציג אותה כאילו היא אותה טענה.');
  out.push('');
  out.push('## הסתייגויות');
  out.push('');
  if (MATRIX_PATH) {
    out.push('**זמני הנסיעה כאן אמיתיים** — מטריצות מ-OpenRouteService על רשת');
    out.push('הכבישים בפועל, לא מרחק אווירי. הן אף אינן סימטריות: הנסיעה');
    out.push('מ-א׳ ל-ב׳ אינה בהכרח באורך הנסיעה חזרה, בגלל חד-סטריים.');
    out.push('זו ההסתייגות הגדולה שהוסרה מהמדידה הקודמת.');
  } else {
    out.push('**זמני הנסיעה כאן הם מרחק אווירי כפול 1.3, לא ניתוב אמיתי.**');
    out.push('קירוב אחיד אינו מתקן את הכשל האמיתי של מרחק אווירי: מסילה או');
    out.push('כביש מהיר בין שתי נקודות ספציפיות. הגרסה עם זמנים אמיתיים היא');
    out.push('`docs/baseline_real.md` — ראו אותה לפני שמצטטים מספר מכאן.');
  }
  out.push('');
  out.push('**הביקוש מוגרל.** היעדים נדגמים אחידה מתוך כתובות אמיתיות');
  out.push('ברדיוס המסירה, מה שמייצר צפיפות נכונה — לכל בניין יש שורה,');
  out.push('ולכן שכונה צפופה נדגמת יותר מאליה. אבל אין כאן שעות שיא, אין');
  out.push('לקוחות חוזרים, ואין קשר בין מה שהוזמן לאן.');
  out.push('');
  out.push('**מה זה כן מוכיח:** שסדר מינימום-המתנה שונה ממה שאדם סביר היה');
  out.push('בוחר, על גיאוגרפיה אמיתית, ובכמה. **מה זה לא מוכיח:** שבעל עסק');
  out.push('ישתמש במערכת, שההזנה מהירה מספיק בעומס, או שההנחות על התנהגות');
  out.push('שליחים נכונות. אלה נשארות פתוחות עד שיהיה פיילוט.');
  out.push('');

  return out.join('\n');
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function labelOf(s: Strategy) {
  return { optimal: '**אופטימלי**', fifo: 'סדר ההכנה (FIFO)', nearest: 'שכן קרוב', random: 'אקראי' }[s];
}

main();
