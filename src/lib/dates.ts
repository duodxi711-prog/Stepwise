export function toDateKey(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

// src/lib/dates.ts
export function parseDateKey(key: string): Date {
    // 支持 "YYYY-MM-DD" 或 "YYYY/MM/DD"
    const m = key.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (!m) return new Date(); // 兜底：格式不对就返回今天

    const y = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);

    // 再兜底一次，防 NaN
    if (!Number.isFinite(y) || !Number.isFinite(mm) || !Number.isFinite(dd)) return new Date();

    return new Date(y, mm - 1, dd);
}

export function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

export function diffDays(a: Date, b: Date): number {
    const ms = b.getTime() - a.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function listDays(startKey: string, endKey: string): string[] {
    const start = parseDateKey(startKey);
    const end = parseDateKey(endKey);
    const out: string[] = [];
    let cur = start;
    while (cur.getTime() <= end.getTime()) {
        out.push(toDateKey(cur));
        cur = addDays(cur, 1);
    }
    return out;
}

export function todayKey(): string {
    return toDateKey(new Date());
}

export function addDaysKey(dayKey: string, delta: number) {
    const d = parseDateKey(dayKey);        // 你项目里已有
    d.setDate(d.getDate() + delta);
    return toDateKey(d);
}
