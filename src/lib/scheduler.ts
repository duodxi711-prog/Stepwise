import type {Task, Plan, PlannedItem, Settings, AssignmentTask, RoutineTask} from "../types";
import {listDays, parseDateKey, todayKey, diffDays} from "./dates";

function isBlocked(dayKey: string, blockedWeekdays: number[]) {
    const d = parseDateKey(dayKey);
    return blockedWeekdays.includes(d.getDay()); // 0 Sun ... 6 Sat
}

function weekKeyMonday(dayKey: string) {
    const d = parseDateKey(dayKey);
    const day = d.getDay(); // 0..6
    const deltaToMon = (day + 6) % 7; // Mon=0, Tue=1... Sun=6
    const mon = new Date(d);
    mon.setDate(d.getDate() - deltaToMon);

    const yyyy = mon.getFullYear();
    const mm = String(mon.getMonth() + 1).padStart(2, "0");
    const dd = String(mon.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function groupByWeek(days: string[]) {
    const map = new Map<string, string[]>();
    for (const dayKey of days) {
        const wk = weekKeyMonday(dayKey);
        if (!map.has(wk)) map.set(wk, []);
        map.get(wk)!.push(dayKey);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function pickDaysForSessions(availableDays: string[], sessions: number, remainingSlots: Record<string, number>) {
    // 选“slot 还多的天”，并尽量不重复
    const chosen: string[] = [];
    const used = new Set<string>();

    for (let i = 0; i < sessions; i++) {
        const candidates = availableDays
            .filter(d => (remainingSlots[d] ?? 0) > 0)
            .sort((a, b) => (remainingSlots[b] ?? 0) - (remainingSlots[a] ?? 0) || (a < b ? -1 : 1));

        let day = candidates.find(d => !used.has(d)) ?? candidates[0];
        if (!day) break;

        chosen.push(day);
        used.add(day);
    }

    return chosen;
}

export function buildPlan(tasks: Task[], settings: Settings): Plan {
    if (tasks.length === 0) return {};

    const startKey = todayKey();

    // 规划终点：assignment 用最大 dueDate；否则 routine 用 horizonWeeks
    const assignmentDueDates = tasks
        .filter(t => t.kind === "assignment")
        .map(t => (t as AssignmentTask).dueDate);

    let endKey: string;
    if (assignmentDueDates.length > 0) {
        endKey = assignmentDueDates.sort().slice(-1)[0] ?? startKey;
    } else {
        const end = new Date();
        end.setDate(end.getDate() + settings.routineHorizonWeeks * 7);
        const yyyy = end.getFullYear();
        const mm = String(end.getMonth() + 1).padStart(2, "0");
        const dd = String(end.getDate()).padStart(2, "0");
        endKey = `${yyyy}-${mm}-${dd}`;
    }

    const allDays = listDays(startKey, endKey);

    // 初始化 plan
    const plan: Plan = {};
    for (const d of allDays) plan[d] = [];

    // assignment 剩余分钟
    const remaining: Record<string, number> = {};
    for (const t of tasks) {
        if (t.kind === "assignment") remaining[t.id] = (t as AssignmentTask).totalMinutes;
    }

    const weeks = groupByWeek(allDays);

    for (const [wk, weekDaysAll] of weeks) {
        const weekDays = weekDaysAll.filter(d => !isBlocked(d, settings.blockedWeekdays));
        if (weekDays.length === 0) continue;
        const weekStart = weekDays[0]!;
        const weekEnd = weekDays[weekDays.length - 1]!;


        // ✅ 核心修复：用“每周剩余容量”控制，而不是平均到每天
        let weekRemaining = settings.minutesPerWeek;

        // 每天最多 items 限制（你 UI 的“每天最多几个 session”）
        const remainingSlots: Record<string, number> = {};
        for (const d of weekDays) remainingSlots[d] = settings.maxItemsPerDay;

        // --- 1) Routine：每周固定几次
        const routines = tasks.filter(t => t.kind === "routine") as RoutineTask[];

        for (const r of routines) {
            // start/end 生效范围
            if (r.startDate > weekEnd) continue;
            if (r.endDate && r.endDate < weekStart) continue;

            const chosenDays = pickDaysForSessions(weekDays, r.sessionsPerWeek, remainingSlots);

            let sessionIndex = 1;
            for (const dayKey of chosenDays) {
                if ((remainingSlots[dayKey] ?? 0) <= 0) continue;
                if (weekRemaining < r.minutesPerSession) continue;

                const item: PlannedItem = {
                    itemId: `${r.id}::${wk}::R${sessionIndex}`,
                    taskId: r.id,
                    title: r.title,
                    minutes: r.minutesPerSession,
                    kind: "routine",
                };

                (plan[dayKey] ??= []).push(item);
                remainingSlots[dayKey] = (remainingSlots[dayKey] ?? 0) - 1;

                weekRemaining -= r.minutesPerSession;
                sessionIndex += 1;
            }
        }

        // --- 2) Assignment：每周只排 sessionsPerWeek 天，并按 deadline 推进
        const assignments = tasks
            .filter(t => t.kind === "assignment")
            .map(t => t as AssignmentTask)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.priority - a.priority);

        for (const a of assignments) {
            if ((remaining[a.id] ?? 0) <= 0) continue;
            if (a.dueDate < weekStart) continue; // 已过截止周

            const weeksLeft = Math.max(
                1,
                Math.ceil(diffDays(parseDateKey(weekStart), parseDateKey(a.dueDate)) / 7)
            );

            const weeklyTarget = Math.ceil((remaining[a.id] ?? 0) / weeksLeft);

            const sessions = Math.max(1, a.sessionsPerWeek);
            const perSession = Math.max(30, Math.ceil(weeklyTarget / sessions));

            const chosenDays = pickDaysForSessions(weekDays, sessions, remainingSlots);

            let sessionIndex = 1;
            let plannedThisWeek = 0;

            for (const dayKey of chosenDays) {
                if ((remaining[a.id] ?? 0) <= 0) break;
                if ((remainingSlots[dayKey] ?? 0) <= 0) continue;
                if (weekRemaining <= 0) break;

                // 本次安排分钟：不超过 perSession / 本周目标 / 剩余 / 本周剩余容量
                let minutes = Math.min(perSession, weeklyTarget - plannedThisWeek, (remaining[a.id] ?? 0), weekRemaining);

                // 如果本周剩余不够，但还剩一些时间，也允许安排一个较小 session（>=30min）
                if (minutes < 30) continue;

                const item: PlannedItem = {
                    itemId: `${a.id}::${wk}::A${sessionIndex}`,
                    taskId: a.id,
                    title: a.title,
                    minutes,
                    kind: "assignment",
                    dueDate: a.dueDate,
                };

                (plan[dayKey] ??= []).push(item);
                remainingSlots[dayKey] = (remainingSlots[dayKey] ?? 0) - 1;

                weekRemaining -= minutes;
                remaining[a.id] = (remaining[a.id] ?? 0) - minutes;
                plannedThisWeek += minutes;
                sessionIndex += 1;
            }
        }
    }

    return plan;
}
