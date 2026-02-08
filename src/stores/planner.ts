import { defineStore } from "pinia";
import { buildPlan } from "../lib/scheduler";
import { clearState, loadState, saveState } from "../lib/storage";
import type { AppState } from "../types";
import router from "../router";

function uid() {
    return Math.random().toString(36).slice(2, 10);
}

function toKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
    ).padStart(2, "0")}`;
}

function asNumber(v: any, fallback: number) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function asString(v: any, fallback: string) {
    return typeof v === "string" && v.trim() ? v : fallback;
}

function asBool(v: any, fallback: boolean) {
    return typeof v === "boolean" ? v : fallback;
}

function asArray<T = any>(v: any): T[] {
    return Array.isArray(v) ? v : [];
}

function ensureISODateKey(v: any, fallbackDaysFromNow: number) {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date();
    d.setDate(d.getDate() + fallbackDaysFromNow);
    return toKey(d);
}

/**
 * ✅ 默认 state：weeklyTodos 必须在“顶层”，不要放 settings 里
 */
const defaultState: AppState = {
    tasks: [],
    settings: {
        minutesPerWeek: 360,
        maxItemsPerDay: 3,
        blockedWeekdays: [],
        routineHorizonWeeks: 4,
        weeklyMustMinutes: 240,
    },
    plan: {},
    checkins: {},
    weeklyTodos: [],
} as any;

type BackupV1 = {
    app: "stepwise";
    version: 1;
    exportedAt: string;
    state: any; // 用 any：避免你 types.ts 不同步导致导入失败
};

function deepClone<T>(x: T): T {
    return JSON.parse(JSON.stringify(x));
}

// ✅ 导入兜底：无论文件里缺什么、类型不对，都合并回 defaultState
function normalizeImportedState(raw: any, base: any) {
    const saved = raw && typeof raw === "object" ? raw : {};

    const merged: any = {
        ...deepClone(base),
        ...saved,
        settings: {
            ...deepClone(base.settings),
            ...(saved.settings || {}),
        },
    };

    // 顶层字段兜底
    merged.tasks = Array.isArray(saved.tasks) ? saved.tasks : deepClone(base.tasks);
    merged.plan = saved.plan && typeof saved.plan === "object" ? saved.plan : deepClone(base.plan);
    merged.checkins = saved.checkins && typeof saved.checkins === "object" ? saved.checkins : deepClone(base.checkins);

    // weeklyTodos 兼容：有的人放在 settings，有的人放在顶层
    const wt = Array.isArray(saved.weeklyTodos)
        ? saved.weeklyTodos
        : Array.isArray(saved.settings?.weeklyTodos)
            ? saved.settings.weeklyTodos
            : [];
    merged.weeklyTodos = wt;

    // settings 强校验
    merged.settings.blockedWeekdays = Array.isArray(merged.settings.blockedWeekdays)
        ? merged.settings.blockedWeekdays.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n))
        : [];

    const numOr = (v: any, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

    merged.settings.minutesPerWeek = numOr(merged.settings.minutesPerWeek, base.settings.minutesPerWeek);
    merged.settings.maxItemsPerDay = numOr(merged.settings.maxItemsPerDay, base.settings.maxItemsPerDay);
    merged.settings.routineHorizonWeeks = numOr(merged.settings.routineHorizonWeeks, base.settings.routineHorizonWeeks);
    merged.settings.weeklyMustMinutes = numOr(merged.settings.weeklyMustMinutes, base.settings.weeklyMustMinutes);

    // clamp：weeklyMustMinutes ≤ minutesPerWeek
    if (merged.settings.weeklyMustMinutes > merged.settings.minutesPerWeek) {
        merged.settings.weeklyMustMinutes = merged.settings.minutesPerWeek;
    }

    // ✅ Project ddl 兜底（你之前踩过 dueDate 缺失）
    for (const t of merged.tasks ?? []) {
        if (t?.kind === "project" && !t.dueDate) {
            const d = new Date();
            d.setDate(d.getDate() + 21);
            t.dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
    }

    return merged;
}


/**
 * ✅ 读取并规范化 saved state（兼容旧结构）
 */
function normalizeLoadedState(saved: any): AppState {
    // 1) base 深拷贝
    const base: AppState = JSON.parse(JSON.stringify(defaultState));

    if (!saved || typeof saved !== "object") return base;

    // 2) 合并：顶层浅合并 + settings 深合并
    const merged: any = {
        ...base,
        ...saved,
        settings: {
            ...base.settings,
            ...(saved.settings || {}),
        },
    };

    // 3) settings 兜底 + 类型修正
    merged.settings.minutesPerWeek = asNumber(merged.settings.minutesPerWeek, base.settings.minutesPerWeek);
    merged.settings.maxItemsPerDay = asNumber(merged.settings.maxItemsPerDay, base.settings.maxItemsPerDay);
    merged.settings.routineHorizonWeeks = asNumber(
        merged.settings.routineHorizonWeeks,
        base.settings.routineHorizonWeeks
    );
    merged.settings.weeklyMustMinutes = asNumber(merged.settings.weeklyMustMinutes, base.settings.weeklyMustMinutes);

    merged.settings.blockedWeekdays = asArray(merged.settings.blockedWeekdays)
        .map((x: any) => Number(x))
        .filter((n: number) => Number.isFinite(n))
        .map((n: number) => (n < 0 ? 0 : n > 6 ? 6 : n));

    // ✅ 必完成不超过可投入
    if (merged.settings.weeklyMustMinutes > merged.settings.minutesPerWeek) {
        merged.settings.weeklyMustMinutes = merged.settings.minutesPerWeek;
    }
    if (merged.settings.minutesPerWeek < 0) merged.settings.minutesPerWeek = 0;
    if (merged.settings.maxItemsPerDay < 0) merged.settings.maxItemsPerDay = 0;
    if (merged.settings.routineHorizonWeeks < 1) merged.settings.routineHorizonWeeks = 1;
    if (merged.settings.weeklyMustMinutes < 0) merged.settings.weeklyMustMinutes = 0;

    // 4) 顶层字段兜底
    merged.tasks = asArray(saved.tasks);
    merged.plan = saved.plan && typeof saved.plan === "object" ? saved.plan : {};
    merged.checkins = saved.checkins && typeof saved.checkins === "object" ? saved.checkins : {};

    // ✅ weeklyTodos：兼容旧数据（可能被你之前放进 settings.weeklyTodos）
    const fromTop = asArray(saved.weeklyTodos);
    const fromSettings = asArray(saved?.settings?.weeklyTodos);
    merged.weeklyTodos = fromTop.length ? fromTop : fromSettings;

    // 5) tasks 规范化（关键：project/subtasks/dueDate 等兜底）
    merged.tasks = merged.tasks
        .map((t: any) => {
            if (!t || typeof t !== "object") return null;

            const kind = t.kind;
            if (kind !== "assignment" && kind !== "routine" && kind !== "project") return null;

            // common
            t.id = asString(t.id, uid());
            t.horizon = asString(t.horizon, "mid");
            t.title = asString(t.title, kind === "routine" ? "健身/阅读/练习…" : kind === "assignment" ? "写下你的作业/任务…" : "写下你的 Project（可拆解）…");
            t.priority = asNumber(t.priority, 3);

            if (kind === "assignment") {
                t.dueDate = ensureISODateKey(t.dueDate, 14);
                t.totalMinutes = asNumber(t.totalMinutes, 20 * 60);
                t.sessionsPerWeek = asNumber(t.sessionsPerWeek, 2);
            }

            if (kind === "routine") {
                t.startDate = ensureISODateKey(t.startDate, 0);
                t.minutesPerSession = asNumber(t.minutesPerSession, 90);
                t.sessionsPerWeek = asNumber(t.sessionsPerWeek, 3);
                if (t.endDate != null && t.endDate !== "") {
                    t.endDate = ensureISODateKey(t.endDate, 28);
                } else {
                    delete t.endDate;
                }
            }

            if (kind === "project") {
                t.dueDate = ensureISODateKey(t.dueDate, 21);

                const subs = asArray(t.subtasks).slice(0, 10).map((s: any, idx: number) => {
                    const sid = asString(s?.id, uid());
                    const title = asString(s?.title, `Subtask ${idx + 1}`);
                    const loggedMinutes = asNumber(s?.loggedMinutes, 0);
                    const done = asBool(s?.done, false);
                    return { id: sid, title, loggedMinutes, done };
                });

                t.subtasks = subs;
            }

            return t;
        })
        .filter(Boolean);

    // 6) weeklyTodos 规范化
    merged.weeklyTodos = asArray(merged.weeklyTodos)
        .map((x: any) => {
            if (!x || typeof x !== "object") return null;
            return {
                id: asString(x.id, uid()),
                title: asString(x.title, ""),
                weekKey: asString(x.weekKey, ""),
                done: asBool(x.done, false),
                createdAt: typeof x.createdAt === "string" ? x.createdAt : undefined,
                doneAt: typeof x.doneAt === "string" ? x.doneAt : undefined,
            };
        })
        .filter((x: any) => x && x.title && x.weekKey);

    // 7) plan 规范化（确保每个 key 是数组，数组里过滤掉空）
    if (merged.plan && typeof merged.plan === "object") {
        for (const k of Object.keys(merged.plan)) {
            merged.plan[k] = asArray(merged.plan[k]).filter(Boolean);
        }
    } else {
        merged.plan = {};
    }

    return merged as AppState;
}

export const usePlannerStore = defineStore("planner", {
    state: () => {
        const saved: any = loadState();
        return normalizeLoadedState(saved);
    },

    actions: {
        // ---------- navigation ----------
        goto(path: string) {
            router.push(path);
        },

        // ---------- persistence ----------
        clampSettings() {
            const cap = asNumber(this.settings.minutesPerWeek, 0);
            const must = asNumber(this.settings.weeklyMustMinutes, 0);
            const maxItems = asNumber(this.settings.maxItemsPerDay, 3);
            const horizon = asNumber(this.settings.routineHorizonWeeks, 4);

            this.settings.minutesPerWeek = cap < 0 ? 0 : cap;
            this.settings.weeklyMustMinutes = must < 0 ? 0 : must;
            this.settings.maxItemsPerDay = maxItems < 0 ? 0 : maxItems;
            this.settings.routineHorizonWeeks = horizon < 1 ? 1 : horizon;

            if (this.settings.weeklyMustMinutes > this.settings.minutesPerWeek) {
                this.settings.weeklyMustMinutes = this.settings.minutesPerWeek;
            }

            // blockedWeekdays 永远保持 number[]
            this.settings.blockedWeekdays = asArray(this.settings.blockedWeekdays)
                .map((x: any) => Number(x))
                .filter((n: number) => Number.isFinite(n))
                .map((n: number) => (n < 0 ? 0 : n > 6 ? 6 : n));
        },

        persist() {
            this.clampSettings();
            saveState(this.$state);
        },

        exportBackup() {
            const payload: BackupV1 = {
                app: "stepwise",
                version: 1,
                exportedAt: new Date().toISOString(),
                state: deepClone(this.$state),
            };
            return payload;
        },

        importBackup(payload: any) {
            // 兼容两种：1) {app,version,state} 2) 直接就是 state
            const rawState = payload?.app === "stepwise" && payload?.state ? payload.state : payload;

            const normalized = normalizeImportedState(rawState, defaultState);

            // 覆盖当前状态
            this.$state = normalized;
            this.persist();
        },


        resetAll() {
            clearState();
            this.$state = JSON.parse(JSON.stringify(defaultState));
            this.persist();
        },

        // ---------- helpers ----------
        ensureDayArr(dayKey: string) {
            // ✅ 永远返回数组，避免 “possibly undefined”
            return ((this.plan as any)[dayKey] ??= []);
        },

        findItemDay(itemId: string): string | undefined {
            for (const dayKey of Object.keys(this.plan || {})) {
                const arr = (this.plan as any)[dayKey] ?? [];
                if (Array.isArray(arr) && arr.some((it: any) => it?.itemId === itemId)) return dayKey;
            }
            return undefined;
        },

        // ---------- settings ----------
        toggleBlockedWeekday(day: number) {
            const d = Number(day);
            const cur = asArray(this.settings.blockedWeekdays).map((x: any) => Number(x));
            const set = new Set(cur);

            if (set.has(d)) set.delete(d);
            else set.add(d);

            this.settings.blockedWeekdays = Array.from(set).sort((a, b) => a - b);
            this.persist();
        },

        // ---------- tasks ----------
        addTask(kind: "assignment" | "routine" | "project" = "assignment") {
            const id = uid();
            const today = new Date();

            if (kind === "assignment") {
                const due = new Date();
                due.setDate(due.getDate() + 14);

                (this.tasks as any).unshift({
                    id,
                    kind: "assignment",
                    horizon: "mid",
                    title: "写下你的作业/任务…",
                    priority: 3,
                    dueDate: toKey(due),
                    totalMinutes: 20 * 60,
                    sessionsPerWeek: 2,
                });

                this.persist();
                return;
            }

            if (kind === "routine") {
                (this.tasks as any).unshift({
                    id,
                    kind: "routine",
                    horizon: "mid",
                    title: "健身/阅读/练习…",
                    priority: 3,
                    startDate: toKey(today),
                    minutesPerSession: 90,
                    sessionsPerWeek: 3,
                });

                this.persist();
                return;
            }

            // project
            const due = new Date();
            due.setDate(due.getDate() + 21);

            (this.tasks as any).unshift({
                id,
                kind: "project",
                horizon: "mid",
                title: "写下你的 Project（可拆解）…",
                priority: 3,
                dueDate: toKey(due),
                subtasks: [
                    { id: uid(), title: "选题 / 定义目标", loggedMinutes: 0, done: false },
                    { id: uid(), title: "查找资料 / 收集信息", loggedMinutes: 0, done: false },
                    { id: uid(), title: "搭建大纲 / 结构", loggedMinutes: 0, done: false },
                    { id: uid(), title: "正文 / 输出", loggedMinutes: 0, done: false },
                ],
            });

            this.persist();
        },

        updateTask(id: string, patch: Partial<any>) {
            const t: any = (this.tasks as any).find((x: any) => x.id === id);
            if (!t) return;
            Object.assign(t, patch);
            this.persist();
        },

        removeTask(id: string) {
            // 1) 删除任务
            this.tasks = asArray(this.tasks).filter((t: any) => t?.id !== id) as any;

            // 2) 清掉 plan 中属于该 task 的 item
            for (const dayKey of Object.keys(this.plan || {})) {
                const arr = this.ensureDayArr(dayKey);
                (this.plan as any)[dayKey] = arr.filter((it: any) => it?.taskId !== id);
            }

            // 3) 清掉 checkins 中以 "id::" 开头的记录
            for (const itemId of Object.keys(this.checkins || {})) {
                if (itemId.startsWith(id + "::")) {
                    delete (this.checkins as any)[itemId];
                }
            }

            this.persist();
        },

        setAssignmentHours(id: string, hours: number) {
            const h = Number(hours);
            if (!Number.isFinite(h)) return;

            const m = Math.max(0, Math.floor(h * 60));

            this.tasks = asArray(this.tasks).map((t: any) => {
                if (t?.id !== id || t?.kind !== "assignment") return t;
                return { ...t, totalMinutes: m };
            }) as any;

            this.persist();
        },

        setRoutineMinutesPerSession(id: string, minutes: number) {
            const t: any = (this.tasks as any).find((x: any) => x.id === id && x.kind === "routine");
            if (!t) return;
            t.minutesPerSession = Math.max(1, asNumber(minutes, 0));
            this.persist();
        },

        // ---------- plan ----------
        generatePlan() {
            this.plan = buildPlan(this.tasks as any, this.settings as any) as any;
            this.persist();
        },

        // ---------- checkins ----------
        toggleCheckin(itemId: string, value?: boolean) {
            const next = typeof value === "boolean" ? value : !(this.checkins as any)[itemId];
            (this.checkins as any)[itemId] = next;
            this.persist();
        },

        // 兼容旧调用（如果你其他地方还在用 toggleDone）
        toggleDone(itemId: string) {
            this.toggleCheckin(itemId);
        },

        // ---------- move / snooze ----------
        moveItem(itemId: string, toDayKey: string, fromDayKey?: string) {
            const fromKey = fromDayKey ?? this.findItemDay(itemId);
            if (!fromKey) return false;

            const fromArr = this.ensureDayArr(fromKey);
            const idx = fromArr.findIndex((it: any) => it?.itemId === itemId);
            if (idx < 0) return false;

            const toArr = this.ensureDayArr(toDayKey);

            const max = asNumber(this.settings.maxItemsPerDay, 3);
            if (toArr.length >= max) return false;

            // 防重复
            if (toArr.some((it: any) => it?.itemId === itemId)) return true;

            const [item] = fromArr.splice(idx, 1);
            if (!item) return false;

            toArr.unshift(item);
            this.persist();
            return true;
        },

        snoozeItem(itemId: string, fromDayKey?: string) {
            // 已完成的不顺延
            if ((this.checkins as any)[itemId]) return;

            const blocked = new Set(asArray(this.settings.blockedWeekdays).map((x: any) => Number(x)));

            const isBlocked = (dayKey: string) => {
                const d = new Date(dayKey + "T00:00:00");
                return blocked.has(d.getDay()); // 0..6
            };

            const nextAvailableDay = (dayKey: string) => {
                const d = new Date(dayKey + "T00:00:00");
                for (let i = 0; i < 60; i++) {
                    d.setDate(d.getDate() + 1);
                    const k = toKey(d);
                    if (!isBlocked(k)) return k;
                }
                d.setDate(d.getDate() + 1);
                return toKey(d);
            };

            // 1) 找到 item 所在 day
            let fromKey = fromDayKey;
            let idx = -1;

            if (fromKey) {
                const arr = this.ensureDayArr(fromKey);
                idx = arr.findIndex((it: any) => it?.itemId === itemId);
            }

            if (idx < 0) {
                fromKey = this.findItemDay(itemId);
                if (!fromKey) return;
                const arr = this.ensureDayArr(fromKey);
                idx = arr.findIndex((it: any) => it?.itemId === itemId);
            }

            if (!fromKey || idx < 0) return;

            // 2) 找到可放入的目标日（跳 blocked + 不超过 maxItemsPerDay）
            const maxPerDay = asNumber(this.settings.maxItemsPerDay, 3);
            let target = nextAvailableDay(fromKey);

            for (let i = 0; i < 60; i++) {
                const arr = this.ensureDayArr(target);
                if (arr.length < maxPerDay) break;
                target = nextAvailableDay(target);
            }

            // 3) 移动
            const fromArr = this.ensureDayArr(fromKey);
            const [item] = fromArr.splice(idx, 1);
            if (!item) return;

            const toArr = this.ensureDayArr(target);
            if (!toArr.some((it: any) => it?.itemId === itemId)) {
                toArr.unshift(item);
            }

            this.persist();
        },

        snoozeAllUndone(dayKey: string) {
            const arr = this.ensureDayArr(dayKey);
            const ids = arr.map((it: any) => it?.itemId).filter(Boolean);

            for (const id of ids) {
                if (!(this.checkins as any)[id]) {
                    this.snoozeItem(id, dayKey);
                }
            }
        },

        // ---------- weekly todos ----------
        addWeeklyTodo(title: string, weekKey: string) {
            const t = (title ?? "").trim();
            const wk = (weekKey ?? "").trim();
            if (!t || !wk) return;

            (this.weeklyTodos as any).unshift({
                id: uid(),
                title: t,
                weekKey: wk,
                done: false,
                createdAt: new Date().toISOString(),
            });

            this.persist();
        },

        toggleWeeklyTodo(id: string) {
            this.weeklyTodos = asArray(this.weeklyTodos).map((x: any) => {
                if (x?.id !== id) return x;
                const nextDone = !x.done;
                return {
                    ...x,
                    done: nextDone,
                    doneAt: nextDone ? new Date().toISOString() : undefined,
                };
            }) as any;

            this.persist();
        },

        deleteWeeklyTodo(id: string) {
            this.weeklyTodos = asArray(this.weeklyTodos).filter((x: any) => x?.id !== id) as any;
            this.persist();
        },

        // ---------- project subtasks ----------
        addProjectSubtask(taskId: string) {
            const t: any = (this.tasks as any).find((x: any) => x.id === taskId && x.kind === "project");
            if (!t) return;

            t.subtasks = asArray(t.subtasks);
            if (t.subtasks.length >= 10) return;

            t.subtasks.push({
                id: uid(),
                title: `Subtask ${t.subtasks.length + 1}`,
                loggedMinutes: 0,
                done: false,
            });

            this.persist();
        },

        updateProjectSubtask(taskId: string, subId: string, patch: Partial<{ title: string }>) {
            const t: any = (this.tasks as any).find((x: any) => x.id === taskId && x.kind === "project");
            if (!t) return;

            const s: any = asArray(t.subtasks).find((x: any) => x.id === subId);
            if (!s) return;

            if (typeof patch.title === "string") s.title = patch.title;
            this.persist();
        },

        logProjectSubtaskHours(taskId: string, subId: string, hours: number) {
            const t: any = (this.tasks as any).find((x: any) => x.id === taskId && x.kind === "project");
            if (!t) return;

            const s: any = asArray(t.subtasks).find((x: any) => x.id === subId);
            if (!s) return;

            const h = Number(hours);
            if (!Number.isFinite(h) || h <= 0) return;

            s.loggedMinutes = asNumber(s.loggedMinutes, 0) + Math.round(h * 60);
            this.persist();
        },

        toggleProjectSubtaskDone(taskId: string, subId: string) {
            const t: any = (this.tasks as any).find((x: any) => x.id === taskId && x.kind === "project");
            if (!t) return;

            const s: any = asArray(t.subtasks).find((x: any) => x.id === subId);
            if (!s) return;

            s.done = !s.done;
            this.persist();
        },

        deleteProjectSubtask(taskId: string, subId: string) {
            const t: any = (this.tasks as any).find((x: any) => x.id === taskId && x.kind === "project");
            if (!t) return;

            t.subtasks = asArray(t.subtasks).filter((x: any) => x.id !== subId);
            this.persist();
        },

        isProjectDone(task: any) {
            if (!task || task.kind !== "project") return false;
            const subs = asArray(task.subtasks);
            if (subs.length === 0) return false;
            return subs.every((s: any) => !!s.done);
        },

        projectProgress(task: any) {
            const subs = asArray(task.subtasks);
            const total = subs.length;
            const done = subs.filter((s: any) => !!s.done).length;
            const ratio = total > 0 ? done / total : 0;
            return { total, done, ratio };
        },
    },
});
