<script setup lang="ts">
    import {computed, ref} from "vue";
    import {usePlannerStore} from "../stores/planner";
    import {todayKey, addDaysKey, parseDateKey} from "../lib/dates";
    import type { ProjectTask } from "../types";

    const projects = computed(() =>
        store.tasks.filter((t): t is ProjectTask => t.kind === "project")
    );


    const store = usePlannerStore();

    /** -----------------------------
     *  Day navigation
     * ----------------------------- */
    const realToday = todayKey();
    const viewDay = ref(realToday);
    const activeDay = computed(() => viewDay.value);

    function prevDay() {
        viewDay.value = addDaysKey(viewDay.value, -1);
    }

    function nextDay() {
        viewDay.value = addDaysKey(viewDay.value, 1);
    }

    function backToToday() {
        viewDay.value = realToday;
    }

    /** -----------------------------
     *  Safe items of the day
     * ----------------------------- */
    const items = computed<any[]>(() =>
        (store.plan?.[activeDay.value] ?? [])
            .filter(Boolean)
            .filter((x: any) => !!x.itemId) // 再兜一层：避免没有 itemId 的脏数据
    );

    const doneCount = computed(() => items.value.filter((it: any) => !!store.checkins?.[it.itemId]).length);

    /** -----------------------------
     *  Date helpers (week)
     * ----------------------------- */
    function toKey(d: Date) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    function weekKeyMondayFromDayKey(dayKey: string) {
        const d = parseDateKey(dayKey);
        const day = d.getDay(); // 0..6
        const deltaToMon = (day + 6) % 7; // Mon=0
        const mon = new Date(d);
        mon.setDate(d.getDate() - deltaToMon);
        return toKey(mon);
    }

    function startOfWeekMonday(dayKey: string) {
        const monKey = weekKeyMondayFromDayKey(dayKey);
        return parseDateKey(monKey);
    }

    const weekDays = computed(() => {
        const mon = startOfWeekMonday(activeDay.value);
        const arr: string[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(mon);
            d.setDate(mon.getDate() + i);
            arr.push(toKey(d));
        }
        return arr;
    });

    const blocked = computed(() => new Set<number>(store.settings?.blockedWeekdays ?? []));

    function isBlockedDay(dayKey: string) {
        const d = parseDateKey(dayKey);
        return blocked.value.has(d.getDay());
    }

    /** -----------------------------
     *  daysLeft / slotsLeft (based on activeDay)
     * ----------------------------- */
    const daysLeft = computed(() => {
        return weekDays.value.filter(d => d >= activeDay.value && !isBlockedDay(d)).length;
    });

    const slotsLeft = computed(() => {
        const max = Number(store.settings?.maxItemsPerDay ?? 3);
        const used = (store.plan?.[activeDay.value] ?? []).filter(Boolean).length;
        return Math.max(0, max - used);
    });

    /** -----------------------------
     *  Weekly todos (based on active weekKey)
     * ----------------------------- */
    const weekKey = computed(() => weekKeyMondayFromDayKey(activeDay.value));

    const weekTodosUndone = computed(() =>
        (store.weeklyTodos ?? []).filter(t => t.weekKey === weekKey.value && !t.done)
    );

    /** -----------------------------
     *  Smart suggestions (Must / Suggested / Optional)
     *  - all based on activeDay (NOT realToday)
     * ----------------------------- */
    type Candidate = {
        taskId: string;
        title: string;
        kind: "assignment" | "routine";
        target: number;
        done: number;
        remain: number;
        daysLeft: number;
        itemId?: string;
        fromDayKey?: string;
    };

    function doneCountInWeek(taskId: string) {
        let done = 0;
        for (const dayKey of weekDays.value) {
            const arr: any[] = (store.plan?.[dayKey] ?? []).filter(Boolean);
            for (const it of arr) {
                if (it?.taskId === taskId && store.checkins?.[it.itemId]) done += 1;
            }
        }
        return done;
    }

    function pickEarliestUndoneItemInWeek(taskId: string): { itemId?: string; fromDayKey?: string } {
        for (const dayKey of weekDays.value) {
            const arr: any[] = (store.plan?.[dayKey] ?? []).filter(Boolean);
            const hit = arr.find(it => it?.taskId === taskId && !store.checkins?.[it.itemId]);
            if (hit) return {itemId: hit.itemId as string, fromDayKey: dayKey};
        }
        return {};
    }

    const candidates = computed<Candidate[]>(() => {
        const dl = daysLeft.value;

        const list: Candidate[] = (store.tasks ?? []).map((t: any) => {
            const target = Number(t?.sessionsPerWeek ?? 0);
            const done = doneCountInWeek(t.id);
            const remain = Math.max(0, target - done);
            const pick = pickEarliestUndoneItemInWeek(t.id);

            return {
                taskId: t.id,
                title: t.title,
                kind: t.kind,
                target,
                done,
                remain,
                daysLeft: dl,
                itemId: pick.itemId,
                fromDayKey: pick.fromDayKey,
            };
        });

        // 只保留本周还欠的
        return list.filter(x => x.remain > 0 && x.target > 0);
    });

    const mustList = computed(() => {
        return candidates.value.filter(c => {
            if (c.daysLeft <= 2 && c.remain > 0) return true;
            if (c.remain > (c.daysLeft - 1)) return true;
            return false;
        });
    });

    const suggestedList = computed(() => {
        return candidates.value.filter(c => {
            if (mustList.value.some(m => m.taskId === c.taskId)) return false;
            if (c.daysLeft <= 4 && c.remain > Math.ceil(c.target / 2)) return true;
            if (c.daysLeft > 0 && (c.remain / c.daysLeft) >= 0.75) return true;
            return false;
        });
    });

    const optionalList = computed(() => {
        const mustSet = new Set(mustList.value.map(x => x.taskId));
        const sugSet = new Set(suggestedList.value.map(x => x.taskId));
        return candidates.value.filter(c => !mustSet.has(c.taskId) && !sugSet.has(c.taskId));
    });

    function moveCandidateToActiveDay(c: Candidate) {
        if (!c.itemId) return;
        if (!c.fromDayKey) return;
        if (c.fromDayKey === activeDay.value) return;
        store.moveItem(c.itemId, activeDay.value, c.fromDayKey);
    }

    function snoozeUndoneOfThisDay() {
        store.snoozeAllUndone(activeDay.value);
    }

    /** -----------------------------
     *  Meta formatting: "本周第 x/y 次"
     * ----------------------------- */
    function sessionsPerWeekForTask(taskId: string) {
        const t: any = (store.tasks ?? []).find(x => x.id === taskId);
        return t?.sessionsPerWeek ?? undefined;
    }

    function sessionNumberInWeek(taskId: string, itemId: string) {
        const list: { dayKey: string; itemId: string }[] = [];

        for (const dayKey of weekDays.value) {
            const arr: any[] = (store.plan?.[dayKey] ?? []).filter(Boolean);
            for (const it of arr) {
                if (it?.taskId === taskId) list.push({dayKey, itemId: it.itemId});
            }
        }

        list.sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.itemId.localeCompare(b.itemId));
        const idx = list.findIndex(x => x.itemId === itemId);
        return idx >= 0 ? idx + 1 : undefined;
    }

    function formatMeta(it: any, dayKey: string) {
        const idx = sessionNumberInWeek(it.taskId, it.itemId);
        const spw = sessionsPerWeekForTask(it.taskId);
        const part = idx && spw ? `本周第 ${idx}/${spw} 次` : "";

        if (it.kind === "routine") {
            return `${it.minutes}min${part ? " · " + part : ""}`;
        }
        const due = it.dueDate ? `截止 ${it.dueDate}` : "";
        return `${it.minutes}min${part ? " · " + part : ""}${due ? " · " + due : ""}`;
    }

    function toggleCheck(itemId: string) {
        store.toggleCheckin(itemId);
    }

    function snoozeOne(itemId: string) {
        store.snoozeItem(itemId, activeDay.value);
    }

    const activeProjects = computed(() =>
        (store.tasks ?? []).filter((t: any) => t.kind === "project" && !store.isProjectDone(t))
    );

    // 展开状态（本地即可，不必存 store）
    const expanded = ref<Record<string, boolean>>({});

    function toggleExpand(id: string) {
        expanded.value[id] = !expanded.value[id];
    }

    // 每个子任务的“本次输入小时”
    const inputHours = ref<Record<string, string>>({});

    function addHours(projectId: string, subId: string) {
        const v = Number(inputHours.value[subId]);
        if (!Number.isFinite(v) || v <= 0) return;
        store.logProjectSubtaskHours(projectId, subId, v);
        inputHours.value[subId] = "";
    }

    function hoursText(minutes: number) {
        const h = (Number(minutes ?? 0) / 60);
        return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
    };


</script>

<template>
    <div class="page">
        <header class="page-header glass-card">
            <div class="date-info">
                <h1>{{ viewDay }}</h1>
                <div class="progress-wrapper">
                    <div class="progress-text">已达成 {{ doneCount }}/{{ items.length }}</div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill"
                             :style="{ width: (items.length > 0 ? (doneCount/items.length * 100) : 0) + '%' }"></div>
                    </div>
                </div>
            </div>

            <div class="date-controls">
                <div class="nav-btns">
                    <button class="icon-btn" @click="prevDay">◄</button>
                    <input type="date" class="dream-date-input" v-model="viewDay"/>
                    <button class="icon-btn" @click="nextDay">►</button>
                </div>
                <div class="action-btns">
                    <button class="glass-btn" @click="backToToday" :disabled="viewDay === realToday">回到今天</button>
                    <button class="primary-btn mini-glow" @click="snoozeUndoneOfThisDay" :disabled="items.length === 0">
                        顺延未完成
                    </button>
                </div>
            </div>
        </header>

        <div class="main-layout">
            <div class="content-left">
                <section class="section-container">
                    <h2 class="section-title">今日行动点</h2>
                    <div v-if="items.length === 0" class="glass-card empty-hint">
                        ✨ 这是一个完美的空白页，可以从右侧挑选建议加入。
                    </div>

                    <div v-else class="task-grid">
                        <div v-for="it in items" :key="it.itemId"
                             :class="['dream-item', { 'is-done': store.checkins?.[it.itemId] }]">
                            <label class="item-main-clickable">
                                <div class="checkbox-wrapper">
                                    <input type="checkbox" :checked="!!store.checkins?.[it.itemId]"
                                           @change="toggleCheck(it.itemId)"/>
                                    <div class="custom-checkbox"></div>
                                </div>

                                <div class="item-content">
                                    <div class="item-title">
                                        <span :class="['mini-tag', it.kind]">{{ it.kind === "routine" ? "习惯" : "作业" }}</span>
                                        <span class="text">{{ it.title }}</span>
                                    </div>
                                    <div class="item-meta">{{ formatMeta(it, activeDay) }}</div>
                                </div>
                            </label>

                            <div class="item-actions">
                                <button class="snooze-btn" type="button" @click.stop.prevent="snoozeOne(it.itemId)">顺延
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="section-container project-section">
                    <div class="row-header">
                        <h2 class="section-title">Projects</h2>
                        <span class="badge">{{ activeProjects.length }}</span>
                    </div>

                    <div v-if="activeProjects.length === 0" class="glass-card empty-hint">
                        ✨ 当前没有未完成的 Project，享受轻松时刻吧！
                    </div>

                    <div v-else class="project-list">
                        <div v-for="p in projects" :key="p.id"  class="project-group">
                            <div class="glass-card project-main-card">
                                <div class="project-info">
                                    <div class="project-title-row">
                                        <span class="project-emoji">📂</span>
                                        <h3 class="title-text">{{ p.title }}</h3>
                                    </div>

                                    <div class="project-progress-container">
                                        <div class="energy-bar">
                                            <div class="energy-fill" :style="{ width: Math.round(store.projectProgress(p).ratio * 100) + '%' }">
                                                <div class="shine-effect"></div>
                                            </div>
                                        </div>
                                        <span class="progress-stats">
                            {{ store.projectProgress(p).done }}/{{ store.projectProgress(p).total }}
                            <span class="pct-text">({{ Math.round(store.projectProgress(p).ratio * 100) }}%)</span>
                        </span>
                                    </div>
                                </div>

                                <button class="expand-btn" :class="{ 'is-active': expanded[p.id] }" type="button" @click="toggleExpand(p.id)">
                                    {{ expanded[p.id] ? "收起 ▲" : "展开 ▼" }}
                                </button>
                            </div>

                            <transition name="fade-slide">
                                <div v-if="expanded[p.id]" class="sub-task-container">
                                    <div v-if="(p.subtasks?.length ?? 0) === 0" class="empty-sub-text">
                                        ☁️ 还没拆解任务：去 Setup 给项目添加子任务吧。
                                    </div>

                                    <div v-else class="sub-task-list">
                                        <div v-for="s in (p.subtasks ?? [])" :key="s.id" :class="['sub-item', { 'is-done': s.done }]">
                                            <div class="sub-content">
                                                <div class="sub-title-line">
                                                    <span :class="['mini-tag', s.done ? 'done' : 'todo']">{{ s.done ? "Done" : "Todo" }}</span>
                                                    <span class="sub-title">{{ s.title }}</span>
                                                </div>
                                                <div class="sub-meta">累计时长：{{ hoursText(s.loggedMinutes) }}</div>
                                            </div>

                                            <div class="sub-actions">
                                                <div class="input-wrapper">
                                                    <input
                                                            class="hours-input"
                                                            type="number"
                                                            min="0"
                                                            step="0.5"
                                                            placeholder="Hr"
                                                            v-model="inputHours[s.id]"
                                                    />
                                                    <span class="unit">h</span>
                                                </div>
                                                <button class="action-btn log-btn" @click="addHours(p.id, s.id)">记录</button>
                                                <button :class="['action-btn', s.done ? 'undo-btn' : 'done-btn']" @click="store.toggleProjectSubtaskDone(p.id, s.id)">
                                                    {{ s.done ? "撤销" : "完成" }}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </transition>
                        </div>
                    </div>
                </section>

                <section class="section-container">
                    <div class="row-header">
                        <h2 class="section-title">本周待办</h2>
                        <span class="badge">{{ weekTodosUndone.length }}</span>
                    </div>
                    <div class="glass-card todo-box">
                        <div v-if="weekTodosUndone.length === 0" class="empty-text">已全部清空，棒极了！🌈</div>
                        <div v-else class="todo-list">
                            <div v-for="t in weekTodosUndone" :key="t.id" class="todo-item">
                                <label class="todo-label">
                                    <input type="checkbox" :checked="t.done" @change="store.toggleWeeklyTodo(t.id)"/>
                                    <span class="todo-text">{{ t.title }}</span>
                                </label>
                                <button class="del-icon" @click="store.deleteWeeklyTodo(t.id)">✕</button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <aside class="content-right">
                <div class="glass-card sticky-card">
                    <div class="sidebar-head">
                        <h3>智能建议</h3>
                        <div class="slot-badge">空余 {{ slotsLeft }}</div>
                    </div>

                    <div v-if="mustList.length" class="suggest-group">
                        <div class="group-label must">MUST</div>
                        <div class="suggest-list">
                            <div v-for="c in mustList" :key="c.taskId" class="suggest-card">
                                <div class="suggest-info">
                                    <div class="s-title">{{ c.title }}</div>
                                    <div class="s-meta">欠 {{ c.remain }} / 剩 {{ c.daysLeft }}天</div>
                                </div>
                                <button class="add-btn"
                                        :disabled="!c.itemId || slotsLeft===0 || c.fromDayKey===activeDay"
                                        @click="moveCandidateToActiveDay(c)">
                                    {{ c.fromDayKey===activeDay ? "已在" : "+" }}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div v-if="suggestedList.length" class="suggest-group">
                        <div class="group-label suggested">SUGGESTED</div>
                        <div class="suggest-list">
                            <div v-for="c in suggestedList" :key="c.taskId" class="suggest-card">
                                <div class="suggest-info">
                                    <div class="s-title">{{ c.title }}</div>
                                </div>
                                <button class="add-btn"
                                        :disabled="!c.itemId || slotsLeft===0 || c.fromDayKey===activeDay"
                                        @click="moveCandidateToActiveDay(c)">+
                                </button>
                            </div>
                        </div>
                    </div>

                    <p v-if="slotsLeft===0" class="limit-hint">今日已满，专注当下 ☁️</p>
                </div>
            </aside>
        </div>
    </div>
</template>

<style scoped>
    .page {
        max-width: 1100px;
        margin: 0 auto;
        padding: 20px;
        box-sizing: border-box;
        animation: fadeIn 0.8s ease-out;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* 布局控制 */
    .main-layout {
        display: grid;
        grid-template-columns: 1fr 340px; /* 稍微加宽右侧，防止建议栏文字溢出 */
        gap: 30px; /* 增加大板块间距 */
        margin-top: 25px;
    }

    .glass-card {
        background: rgba(255, 255, 255, 0.4);
        backdrop-filter: blur(15px) saturate(160%);
        -webkit-backdrop-filter: blur(15px) saturate(160%);
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.5);
        padding: 24px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.03);
    }

    /* 顶部 Header 修正 */
    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 20px;
    }

    .date-controls {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 15px; /* 增加日期切换与按钮组的间距 */
    }

    .nav-btns {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .action-btns {
        display: flex;
        gap: 12px; /* 修正截图中的按钮拥挤感 */
    }

    /* 按钮基础样式：确保文字不换行 */
    button {
        white-space: nowrap;
        flex-shrink: 0;
        border: none;           /* 消除默认边框 */
        outline: none;          /* 消除点击时的外轮廓 */
        cursor: pointer;
        background: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        -webkit-tap-highlight-color: transparent; /* 消除移动端点击阴影 */
    }

    .primary-btn {
        background: #F957A5;
        color: white;
        padding: 10px 20px;
        border-radius: 12px;
        font-weight: 700;
        font-size: 14px;
    }

    /* --- “回到今天” 按钮 (Glass Button) --- */
    .glass-btn {
        background: rgba(255, 255, 255, 0.7);
        color: #F957A5; /* 默认状态给它一点品牌色，表示它是可点击的 */
        padding: 10px 20px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 600;
        border: 1px solid rgba(249, 87, 165, 0.2);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: pointer;
    }

    /* 悬浮态：变亮、边框变实、轻微浮起 */
    .glass-btn:hover:not(:disabled) {
        background: #ffffff;
        border-color: #F957A5;
        box-shadow: 0 4px 12px rgba(249, 87, 165, 0.15);
        transform: translateY(-2px);
    }

    /* 激活态（点击瞬间）：轻微下压 */
    .glass-btn:active:not(:disabled) {
        transform: translateY(0);
    }

    /* 禁用态：变成灰色、半透明、取消阴影 */
    .glass-btn:disabled {
        background: rgba(200, 200, 200, 0.2);
        color: #999;
        border-color: rgba(0, 0, 0, 0.05);
        cursor: not-allowed;
        opacity: 0.6;
        transform: none !important;
        box-shadow: none !important;
    }


    /* --- “顺延未完成” 按钮 (Primary Button) --- */
    .primary-btn {
        background: linear-gradient(135deg, #F957A5 0%, #ff85a2 100%);
        color: white;
        padding: 10px 20px;
        border-radius: 12px;
        font-weight: 700;
        font-size: 14px;
        border: none;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(249, 87, 165, 0.2);
    }

    /* 悬浮态：发光感增强、色彩微调 */
    .primary-btn:hover:not(:disabled) {
        filter: brightness(1.1);
        box-shadow: 0 6px 20px rgba(249, 87, 165, 0.4);
        transform: translateY(-2px);
    }

    /* 禁用态：饱和度降为0（变灰）、半透明 */
    .primary-btn:disabled {
        background: #ccc;
        filter: grayscale(1);
        opacity: 0.5;
        cursor: not-allowed;
        transform: none !important;
        box-shadow: none !important;
    }

    /* 修正按钮容器间距 */
    .action-btns {
        display: flex;
        gap: 12px;
    }

    /* 今日行动点卡片修正 */
    .task-grid {
        display: grid;
        gap: 16px;
    }

    .dream-item {
        display: flex;
        justify-content: space-between; /* 关键：主内容靠左，操作靠右 */
        align-items: center;
        padding: 18px 24px;
        background: rgba(255, 255, 255, 0.5);
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.7);
        transition: all 0.3s ease;
    }

    .item-main-clickable {
        display: flex;
        align-items: center;
        gap: 16px;
        flex: 1; /* 占据剩余空间 */
        cursor: pointer;
    }

    .item-content {
        flex: 1;
        min-width: 0; /* 允许 Flex 子元素收缩以防止溢出 */
    }

    .item-title {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 4px;
    }

    .item-title .text {
        font-weight: 700;
        font-size: 16px;
        color: #333;
        /* 防止标题文字过长挤坏布局 */
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* 顺延按钮：强制居右对齐 */
    .item-actions {
        margin-left: 20px;
    }

    .snooze-btn {
        background: rgba(255, 255, 255, 0.6);
        color: #888;
        padding: 6px 14px;
        border-radius: 10px;
        font-size: 13px;
        border: 1px solid transparent;
    }

    .snooze-btn:hover {
        color: #F957A5;
        background: white;
        border-color: rgba(249, 87, 165, 0.3);
    }

    /* 右侧栏样式优化 */
    .sidebar-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
    }

    .suggest-card {
        background: rgba(255, 255, 255, 0.6);
        padding: 14px;
        border-radius: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }

    .suggest-info {
        flex: 1;
        min-width: 0;
        margin-right: 10px;
    }

    .add-btn {
        min-width: 44px; /* 修正“已在”文字显示不全 */
        height: 32px;
        padding: 0 8px;
        border-radius: 10px;
        background: #F957A5;
        color: white;
        font-size: 12px;
        font-weight: 800;
    }

    /* 进度条与其它细节 */
    .row-header {
        display: flex;
        justify-content: space-between;
        padding: 5px;
        align-items: center;
    }

    .progress-bar-bg {
        width: 220px;
        height: 8px;
        background: rgba(255, 255, 255, 0.4);
        border-radius: 10px;
    }

    .section-title {
        font-size: 18px;
        font-weight: 800;
        color: #444;
        margin-bottom: 15px;
    }

    .badge {
        background: #F957A5;
        color: white;
        padding: 0 12px;
        border-radius: 12px;
        font-size: 12px;
        height: 24px;
        display: flex;
        align-items: center;
    }

    /* 响应式适配 */
    @media (max-width: 900px) {
        .main-layout {
            grid-template-columns: 1fr;
        }

        .page-header {
            flex-direction: column;
            align-items: flex-start;
        }

        .date-controls {
            align-items: flex-start;
        }
    }

    .progress-text {
        margin-bottom: 5px;
    }

    /* Projects 模块特定样式 */
    .project-list { display: grid; gap: 20px; margin-top: 15px; }

    .project-main-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        margin-bottom: 0; /* 紧贴下方的子任务列表 */
    }

    .project-title-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .project-emoji { font-size: 20px; }
    .title-text { font-size: 18px; font-weight: 800; color: #333; margin: 0; }

    /* 进度条样式同步 BoardView */
    .project-progress-container { display: flex; align-items: center; gap: 15px; }
    .energy-bar {
        flex: 1; height: 10px; background: rgba(255,255,255,0.4);
        border-radius: 999px; overflow: hidden; position: relative;
    }
    .energy-fill {
        height: 100%; background: linear-gradient(90deg, #F957A5, #ff85a2);
        transition: width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .progress-stats { font-size: 12px; font-weight: 700; color: #888; white-space: nowrap; }
    .pct-text { color: #F957A5; }

    /* 展开按钮 */
    .expand-btn {
        background: rgba(255,255,255,0.6);
        color: #666;
        padding: 8px 16px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 700;
        transition: all 0.3s;
    }
    .expand-btn.is-active { background: #F957A5; color: white; }

    /* 子任务区域 */
    .sub-task-container {
        background: rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(5px);
        border-radius: 0 0 20px 20px;
        margin: -10px 10px 0; /* 形成一种卡片嵌套感 */
        padding: 20px 15px 15px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-top: none;
    }

    .sub-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 15px;
        background: rgba(255, 255, 255, 0.5);
        border-radius: 12px;
        margin-bottom: 8px;
        transition: all 0.3s;
    }
    .sub-item.is-done { opacity: 0.6; background: rgba(255,255,255,0.3); }

    .sub-title { font-weight: 700; color: #444; font-size: 14px; }
    .sub-meta { font-size: 11px; color: #999; margin-top: 4px; }

    /* 输入框美化 */
    .input-wrapper { position: relative; display: flex; align-items: center; }
    .hours-input {
        width: 65px;
        padding: 6px 20px 6px 10px;
        border-radius: 8px;
        border: 1px solid rgba(0,0,0,0.05);
        background: white;
        font-size: 13px;
        text-align: center;
    }
    .unit { position: absolute; right: 8px; font-size: 11px; color: #ccc; }

    /* 子任务按钮 */
    .sub-actions { display: flex; gap: 8px; align-items: center; }
    .action-btn {
        padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;
        transition: all 0.2s;
    }
    .log-btn { background: #333; color: white; }
    .done-btn { background: #F957A5; color: white; }
    .undo-btn { background: transparent; color: #888; border: 1px solid #ddd; }

    /* 动画效果 */
    .fade-slide-enter-active, .fade-slide-leave-active { transition: all 0.4s ease; }
    .fade-slide-enter-from, .fade-slide-leave-to { opacity: 0; transform: translateY(-10px); }


</style>
