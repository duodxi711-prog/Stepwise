// src/types.ts

export type Horizon = "long" | "mid" | "short";
export type Priority = 1 | 2 | 3 | 4 | 5;
export type TaskKind = "assignment" | "routine" | "project";

export type DayKey = string; // "YYYY-MM-DD"
export type WeekKey = string; // Monday "YYYY-MM-DD"

export interface Settings {
    minutesPerWeek: number;
    maxItemsPerDay: number;
    routineHorizonWeeks: number;

    blockedWeekdays: number[]; // 0..6

    weeklyMustMinutes: number; // 你新加的
}

export interface Objective {
    id: string;
    horizon: Horizon;
    title: string;
    dueDate?: DayKey;
}

export interface PlannedItem {
    itemId: string;
    taskId: string;
    title: string;
    minutes: number;
    kind: "assignment" | "routine"; // ✅ 注意：project 不进 scheduler 的 plan
    dueDate?: DayKey;
}

export type Plan = Record<DayKey, PlannedItem[]>;

export interface AssignmentTask {
    id: string;
    kind: "assignment";
    horizon: Horizon;
    title: string;
    priority: Priority;
    dueDate: DayKey;
    totalMinutes: number;
    sessionsPerWeek: number;
}

export interface RoutineTask {
    id: string;
    kind: "routine";
    horizon: Horizon;
    title: string;
    priority: Priority;
    startDate: DayKey;
    endDate?: DayKey;
    minutesPerSession: number;
    sessionsPerWeek: number;
}

export interface ProjectSubtask {
    id: string;
    title: string;
    loggedMinutes: number; // ✅ 分钟
    done: boolean;
}


export interface ProjectTask {
    id: string;
    kind: "project";
    horizon: Horizon;
    title: string;
    priority: Priority;
    dueDate: DayKey;

    subtasks: ProjectSubtask[];
    showSubtasks?: boolean; // UI 用
}

export type Task = AssignmentTask | RoutineTask | ProjectTask;

export interface WeeklyTodo {
    id: string;
    title: string;
    weekKey: string;
    done: boolean;
    createdAt?: string; // ✅ 允许存在
}

export interface AppState {
    settings: Settings;

    tasks: Task[];
    objectives: Objective[];

    plan: Plan;
    checkins: Record<string, boolean>;

    weeklyTodos: WeeklyTodo[];
}
