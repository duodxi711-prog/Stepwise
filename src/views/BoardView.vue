<script setup lang="ts">
    import { computed, ref } from "vue";
    import { usePlannerStore } from "../stores/planner";
    import { todayKey, parseDateKey } from "../lib/dates";

    const store = usePlannerStore();
    const today = todayKey();
    const kindFilter = ref<"all" | "assignment" | "routine">("all");

    function toKey(d: Date) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    function startOfWeekMonday(dayKey: string) {
        const d = parseDateKey(dayKey);
        const day = d.getDay();      // 0..6
        const delta = (day + 6) % 7; // Mon=0
        const mon = new Date(d);
        mon.setDate(d.getDate() - delta);
        return mon;
    }

    const weekDays = computed(() => {
        const mon = startOfWeekMonday(today);
        const arr: string[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(mon);
            d.setDate(mon.getDate() + i);
            arr.push(toKey(d));
        }
        return arr;
    });

    function sumDoneMinutesForTask(taskId: string) {
        let done = 0;
        for (const [dayKey, arr] of Object.entries(store.plan)) {
            const items: any[] = arr ?? [];
            for (const it of items) {
                if (it.taskId === taskId && store.checkins[it.itemId]) {
                    done += Number(it.minutes ?? 0);
                }
            }
        }
        return done;
    }

    function sumPlannedMinutesForTask(taskId: string) {
        let planned = 0;
        for (const arr of Object.values(store.plan)) {
            const items: any[] = arr ?? [];
            for (const it of items) {
                if (it.taskId === taskId) planned += Number(it.minutes ?? 0);
            }
        }
        return planned;
    }

    function countDoneSessionsThisWeek(taskId: string) {
        let done = 0;
        for (const d of weekDays.value) {
            const items: any[] = store.plan[d] ?? [];
            for (const it of items) {
                if (it.taskId === taskId && store.checkins[it.itemId]) done += 1;
            }
        }
        return done;
    }

    function countPlannedSessionsThisWeek(taskId: string) {
        let planned = 0;
        for (const d of weekDays.value) {
            const items: any[] = store.plan[d] ?? [];
            planned += items.filter(it => it.taskId === taskId).length;
        }
        return planned;
    }

    function pct(n: number, d: number) {
        if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
        const x = Math.floor((n / d) * 100);
        return Math.max(0, Math.min(100, x));
    }

    const tasksShown = computed(() => {
        const list = store.tasks.slice();
        if (kindFilter.value === "all") return list;
        return list.filter(t => t.kind === kindFilter.value);
    });

    type Row = {
        id: string;
        title: string;
        kind: "assignment" | "routine";
        percent: number;
        leftText: string;
        rightText: string;
    };

    const rows = computed<Row[]>(() => {
        return tasksShown.value.map((t: any) => {
            if (t.kind === "assignment") {
                const total = Number(t.totalMinutes ?? 0);
                const done = sumDoneMinutesForTask(t.id);
                const planned = sumPlannedMinutesForTask(t.id);
                const percent = pct(done, total);

                return {
                    id: t.id,
                    title: t.title,
                    kind: "assignment",
                    percent,
                    leftText: `${done}/${total} min`,
                    rightText: planned ? `已排 ${planned} min` : "未排程",
                };
            }

            // routine：按本周进度
            const target = Number(t.sessionsPerWeek ?? 0);
            const done = countDoneSessionsThisWeek(t.id);
            const planned = countPlannedSessionsThisWeek(t.id);
            const percent = pct(done, target);

            return {
                id: t.id,
                title: t.title,
                kind: "routine",
                percent,
                leftText: `${done}/${target} 次（本周）`,
                rightText: planned ? `本周已排 ${planned} 次` : "本周未排程",
            };
        });
    });
</script>

<template>
    <div class="page">
        <header class="board-header">
            <div class="title-section">
                <h1>Board</h1>
                <div class="week-range-badge">📅 {{ weekDays[0] }} ~ {{ weekDays[6] }}</div>
            </div>
            <nav class="nav-actions">
                <button class="nav-glass-btn" @click="store.goto('/setup')">Setup</button>
                <button class="nav-glass-btn" @click="store.goto('/today')">Today</button>
                <button class="nav-glass-btn" @click="store.goto('/plan')">Plan</button>
            </nav>
        </header>

        <div class="board-layout">
            <section class="glass-card main-board">
                <header class="card-header">
                    <div class="header-left">
                        <span class="emoji-icon">📊</span>
                        <h2 class="section-title">任务进度看板</h2>
                    </div>
                    <div class="filter-group">
                        <div class="select-wrapper">
                            <select v-model="kindFilter" class="dream-select">
                                <option value="all">All Tasks</option>
                                <option value="assignment">Assignment</option>
                                <option value="routine">Routine</option>
                            </select>
                        </div>
                    </div>
                </header>

                <div v-if="rows.length === 0" class="empty-state">
                    <p>还没有任务数据 ☁️</p>
                </div>

                <div v-else class="progress-list">
                    <div v-for="r in rows" :key="r.id" :class="['progress-item', r.kind]">
                        <div class="item-top">
                            <div class="item-title">
                                <span :class="['it-tag', r.kind]">{{ r.kind === 'routine' ? '惯' : '课' }}</span>
                                <span class="text">{{ r.title }}</span>
                            </div>
                            <div class="item-pct">{{ r.percent }}%</div>
                        </div>
                        <div class="energy-bar">
                            <div class="energy-fill" :style="{ width: r.percent + '%' }">
                                <div class="shine-effect"></div>
                            </div>
                        </div>
                        <div class="item-footer">
                            <span class="left-info">{{ r.leftText }}</span>
                            <span class="right-info">{{ r.rightText }}</span>
                        </div>
                    </div>
                </div>
            </section>

            <section class="glass-card project-board">
                <header class="card-header">
                    <div class="header-left">
                        <span class="emoji-icon">📂</span>
                        <h2 class="section-title">Project Board</h2>
                    </div>
                </header>

                <div class="project-grid">
                    <div v-for="p in store.tasks.filter(t=>t.kind==='project')" :key="p.id" class="project-card">
                        <div class="project-card-top">
                            <h3 class="project-title">{{ p.title }}</h3>
                            <span class="project-pct-text">{{ Math.round(store.projectProgress(p).ratio * 100) }}%</span>
                        </div>

                        <div class="energy-bar mini">
                            <div class="energy-fill" :style="{ width: Math.round(store.projectProgress(p).ratio * 100) + '%' }">
                                <div class="shine-effect"></div>
                            </div>
                        </div>

                        <div class="project-stats">
                            完成度：{{ store.projectProgress(p).done }}/{{ store.projectProgress(p).total }}
                        </div>

                        <div class="sub-task-preview">
                            <div v-for="s in (p.subtasks ?? [])" :key="s.id" class="sub-task-row">
                                <div class="sub-task-content">
                                    <span :class="['mini-tag', s.done ? 'done' : 'todo']">{{ s.done ? "✓" : "·" }}</span>
                                    <span class="sub-task-title" :class="{ 'is-done': s.done }">{{ s.title }}</span>
                                </div>
                                <span class="sub-task-time">{{ (s.loggedMinutes/60).toFixed(1) }}h</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
    /* 页面基础与动画 */
    .page {
        max-width: 1100px;
        margin: 0 auto;
        padding: 20px;
        animation: pageFadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1);
    }

    @keyframes pageFadeIn {
        from { opacity: 0; transform: translateY(20px); filter: blur(5px); }
        to { opacity: 1; transform: translateY(0); filter: blur(0); }
    }

    /* 顶部导航 */
    .board-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 25px;
    }

    .title-section h1 { font-size: 28px; font-weight: 800; margin: 0; color: #333; }
    .week-range-badge {
        font-size: 13px; color: #888; margin-top: 4px; font-weight: 600;
    }

    .nav-actions { display: flex; gap: 10px; }
    .nav-glass-btn {
        background: rgba(255,255,255,0.6);
        border: 1px solid rgba(255,255,255,0.8);
        padding: 8px 16px;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 600;
        color: #666;
        transition: all 0.3s;
    }
    .nav-glass-btn:hover {
        background: white;
        color: #F957A5;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }

    /* 看板大卡片 */
    .glass-card {
        background: rgba(255, 255, 255, 0.4);
        backdrop-filter: blur(15px) saturate(160%);
        -webkit-backdrop-filter: blur(15px) saturate(160%);
        border-radius: 24px;
        padding: 28px;
        border: 1px solid rgba(255, 255, 255, 0.5);
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.04);
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 25px;
    }

    .header-left { display: flex; align-items: center; gap: 10px; }
    .section-title { font-size: 20px; font-weight: 800; color: #444; margin: 0; }

    /* 筛选器美化 */
    .filter-group { display: flex; align-items: center; gap: 10px; }
    .filter-label { font-size: 13px; font-weight: 700; color: #888; }
    .dream-select {
        background: white;
        border: 1px solid rgba(0,0,0,0.05);
        padding: 6px 12px;
        border-radius: 10px;
        font-size: 13px;
        outline: none;
        cursor: pointer;
    }

    /* 进度列表 */
    .progress-list { display: grid; gap: 16px; }

    .progress-item {
        background: rgba(255, 255, 255, 0.5);
        padding: 20px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.7);
        transition: all 0.3s;
    }
    .progress-item:hover {
        background: rgba(255, 255, 255, 0.8);
        transform: scale(1.01);
    }

    .item-top { display: flex; justify-content: space-between; align-items: center; }
    .item-title { display: flex; align-items: center; gap: 12px; }
    .it-tag { font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 6px; }
    .it-tag.routine { background: #e3f2fd; color: #2196f3; }
    .it-tag.assignment { background: #f3e5f5; color: #9c27b0; }
    .item-title .text { font-weight: 700; color: #333; font-size: 16px; }
    .item-pct { font-weight: 800; color: #F957A5; font-size: 18px; }

    /* 能量进度条：核心美化 */
    .energy-bar {
        height: 12px;
        background: rgba(0, 0, 0, 0.04);
        border-radius: 999px;
        overflow: hidden;
        margin-top: 15px;
        position: relative;
        border: 1px solid rgba(255,255,255,0.5);
    }

    .energy-fill {
        height: 100%;
        background: linear-gradient(90deg, #F957A5, #ff85a2);
        border-radius: 999px;
        position: relative;
        transition: width 1s cubic-bezier(0.34, 1.56, 0.64, 1);
        box-shadow: 0 0 15px rgba(249, 87, 165, 0.3);
    }

    /* 进度条扫光效果 */
    .shine-effect {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(
                90deg,
                rgba(255,255,255,0) 0%,
                rgba(255,255,255,0.3) 50%,
                rgba(255,255,255,0) 100%
        );
        animation: shine 2s infinite;
    }

    @keyframes shine {
        from { transform: translateX(-100%); }
        to { transform: translateX(100%); }
    }

    .item-footer {
        display: flex;
        justify-content: space-between;
        margin-top: 12px;
        font-size: 12px;
        font-weight: 600;
    }
    .left-info { color: #555; }
    .right-info { color: #999; }

    /* 空状态 */
    .empty-state { text-align: center; padding: 40px; color: #888; }
    .action-link {
        background: none; border: none; color: #F957A5;
        font-weight: 700; cursor: pointer; text-decoration: underline;
    }

    .project-grid { display: grid; gap: 16px; }
    .project-card {
        background: rgba(255, 255, 255, 0.5);
        border-radius: 18px;
        padding: 16px;
        transition: all 0.3s;
    }
    .project-card:hover { transform: scale(1.02); background: rgba(255, 255, 255, 0.7); }
    .project-card-top { display: flex; justify-content: space-between; align-items: center; }
    .project-title { font-size: 15px; font-weight: 800; color: #333; margin: 0; }
    .project-pct-text { color: #F957A5; font-weight: 800; font-size: 14px; }
    .project-stats { font-size: 11px; color: #999; margin-bottom: 12px; }

    /* 子任务预览 */
    .sub-task-preview {
        border-top: 1px dashed rgba(0,0,0,0.05);
        padding-top: 10px;
        display: grid; gap: 6px;
    }
    .sub-task-row { display: flex; justify-content: space-between; font-size: 12px; }
    .sub-task-content { display: flex; gap: 8px; align-items: center; }
    .sub-task-title.is-done { text-decoration: line-through; opacity: 0.5; }
    .mini-tag { font-size: 10px; font-weight: 900; }
    .mini-tag.done { color: #F957A5; }
    .mini-tag.todo { color: #ccc; }
    .sub-task-time { color: #bbb; font-size: 11px; }

    /* 筛选器 */
    .dream-select {
        background: white; padding: 6px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; color: #666;
    }

    @media (max-width: 900px) {
        .board-layout { grid-template-columns: 1fr; }
    }

    /* 布局网格 */
    .board-layout {
        display: grid;
        grid-template-columns: 1fr 400px;
        gap: 24px;
    }
</style>
