<script setup lang="ts">
    import { computed, ref } from "vue";
    import { usePlannerStore } from "../stores/planner";
    import { todayKey, parseDateKey, addDaysKey } from "../lib/dates";

    const store = usePlannerStore();
    const today = todayKey();
    const weekOffset = ref(0);

    // 这个 viewDay 是 Plan 页“当前查看的那一周”的锚点日期
    const viewDay = ref(todayKey());

    // activeDay 就是 viewDay 的别名（方便和 TodayView 一致）
    const activeDay = computed(() => viewDay.value);

    function toKey(d: Date) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    function startOfWeekMonday(dayKey: string) {
        const d = parseDateKey(dayKey);
        const day = d.getDay();         // 0..6
        const delta = (day + 6) % 7;    // Mon=0
        const mon = new Date(d);
        mon.setDate(d.getDate() - delta);
        return mon;
    }

    const weekDays = computed(() => {
        const mon = startOfWeekMonday(today);
        mon.setDate(mon.getDate() + weekOffset.value * 7);
        const arr: string[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(mon);
            d.setDate(mon.getDate() + i);
            arr.push(toKey(d));
        }
        return arr;
    });

    const newTodo = ref("");

    function weekKeyMondayFromDayKey(dayKey: string) {
        const d = parseDateKey(dayKey);
        const day = d.getDay();
        const deltaToMon = (day + 6) % 7;
        const mon = new Date(d);
        mon.setDate(d.getDate() - deltaToMon);
        const yyyy = mon.getFullYear();
        const mm = String(mon.getMonth() + 1).padStart(2, "0");
        const dd = String(mon.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    const currentWeekKey = computed(() => weekKeyMondayFromDayKey(activeDay.value));

    const weekTodos = computed(() =>
        store.weeklyTodos
            .filter(t => t.weekKey === currentWeekKey.value)
            .sort((a, b) => Number(a.done) - Number(b.done))
    );

    function addTodo() {
        store.addWeeklyTodo(newTodo.value, currentWeekKey.value);
        newTodo.value = "";
    }
    function prevWeek() {
        viewDay.value = addDaysKey(viewDay.value, -7);
    }
    function nextWeek() {
        viewDay.value = addDaysKey(viewDay.value, 7);
    }
    function thisWeek() {
        viewDay.value = todayKey();
    }
</script>

<template>
    <div class="page">
        <header class="plan-header glass-card">
            <div class="title-section">
                <h1>Weekly Plan</h1>
                <div class="week-selector">
                    <button class="arrow-btn" @click="weekOffset--">◀</button>
                    <span class="current-week-label" @click="weekOffset=0">本周</span>
                    <button class="arrow-btn" @click="weekOffset++">▶</button>
                </div>
            </div>

            <div class="header-actions">
                <button class="primary-regen-btn" @click="store.generatePlan">✨ Re-generate</button>
            </div>
        </header>

        <div v-if="weekDays.length === 0" class="empty-glass-card">
            <p>还没有生成的计划哦 ☁️</p>
            <button class="action-link" @click="store.goto('/setup')">前往 Setup 开启第一步</button>
        </div>

        <div v-else class="plan-grid">
            <div v-for="dayKey in weekDays" :key="dayKey" class="day-card">
                <div class="day-header">
                    <span class="day-name">{{ dayKey }}</span>
                    <span class="count-badge">{{ (store.plan[dayKey] ?? []).length }} 任务</span>
                </div>

                <div v-if="(store.plan[dayKey] ?? []).length > 0" class="task-mini-list">
                    <div v-for="it in store.plan[dayKey]" :key="it.itemId" :class="['mini-item', it.kind]">
                        <div class="it-top">
                            <span class="it-tag">{{ it.kind === 'routine' ? '惯' : '课' }}</span>
                            <span class="it-title">{{ it.title }}</span>
                        </div>
                        <div class="it-details">
                            <span class="it-time">⏱️ {{ it.minutes }}m</span>
                            <span v-if="it.dueDate" class="it-due">📅 {{ it.dueDate.split('-').slice(1).join('/') }}</span>
                        </div>
                    </div>
                </div>

                <div v-else class="day-empty">Relax Day 🏝️</div>
            </div>
        </div>

        <section class="glass-card weekly-todo-section">
            <div class="todo-header">
                <h2>本周待办清单</h2>
                <span class="week-key-tag">Week: {{ currentWeekKey }}</span>
            </div>

            <div class="todo-input-group">
                <input
                        v-model="newTodo"
                        placeholder="想在这一周完成的其它小事..."
                        class="dream-input"
                        @keydown.enter="addTodo"
                />
                <button class="add-todo-btn" @click="addTodo">添加</button>
            </div>

            <div v-if="weekTodos.length === 0" class="todo-empty">
                暂时没有额外的待办任务。
            </div>

            <div v-else class="todo-scroll-area">
                <div v-for="t in weekTodos" :key="t.id" :class="['todo-row', { 'is-done': t.done }]">
                    <label class="todo-check-wrapper">
                        <input type="checkbox" :checked="t.done" @change="store.toggleWeeklyTodo(t.id)" />
                        <div class="custom-check"></div>
                        <span class="todo-text">{{ t.title }}</span>
                    </label>
                    <button class="delete-icon-btn" @click="store.deleteWeeklyTodo(t.id)">✕</button>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
    .page { max-width: 1100px; margin: 0 auto; padding: 20px; animation: fadeIn 0.8s ease-out;}

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* 玻璃质感页眉 */
    .plan-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        margin-bottom: 25px;
        background: rgba(255, 255, 255, 0.4);
        backdrop-filter: blur(15px);
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.5);
    }

    .title-section { display: flex; align-items: center; gap: 20px; }
    h1 { font-size: 22px; font-weight: 800; color: #333; margin: 0; }

    /* 周切换器 */
    .week-selector {
        display: flex;
        align-items: center;
        background: rgba(255,255,255,0.6);
        padding: 4px;
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,0.05);
    }
    .arrow-btn { background: none; border: none; padding: 4px 10px; cursor: pointer; color: #F957A5; font-weight: bold; }
    .current-week-label { font-size: 13px; font-weight: 700; padding: 0 10px; cursor: pointer; color: #666; }

    .header-actions { display: flex; gap: 12px; align-items: center; }
    .nav-btn { background: rgba(255,255,255,0.7); padding: 8px 16px; border-radius: 12px; font-size: 14px; font-weight: 600; color: #555; }
    .primary-regen-btn {
        background: linear-gradient(135deg, #F957A5, #8e44ad);
        color: white; border: none; padding: 10px 20px; border-radius: 12px;
        font-weight: 700; box-shadow: 0 4px 15px rgba(249, 87, 165, 0.3);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .primary-regen-btn:hover { transform: scale(1.05); }

    /* 计划网格布局 */
    .plan-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }

    .day-card {
        background: rgba(255, 255, 255, 0.35);
        backdrop-filter: blur(10px);
        border-radius: 20px;
        padding: 16px;
        border: 1px solid rgba(255, 255, 255, 0.5);
        transition: transform 0.3s ease;
    }
    .day-card:hover { transform: translateY(-5px); background: rgba(255, 255, 255, 0.5); }

    .day-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .day-name { font-weight: 800; color: #444; font-size: 16px; }
    .count-badge { font-size: 11px; background: rgba(0,0,0,0.05); padding: 2px 8px; border-radius: 8px; color: #888; }

    /* 任务小卡片 */
    .task-mini-list { display: flex; flex-direction: column; gap: 8px; }
    .mini-item {
        background: white; padding: 10px; border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.02);
        border-left: 4px solid #eee;
    }
    .mini-item.routine { border-left-color: #3498db; }
    .mini-item.assignment { border-left-color: #F957A5; }

    .it-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .it-tag { font-size: 10px; font-weight: 800; color: #999; }
    .it-title { font-size: 13px; font-weight: 700; color: #444; }
    .it-details { font-size: 11px; color: #999; display: flex; gap: 10px; }

    .day-empty { text-align: center; padding: 20px; opacity: 0.4; font-size: 14px; }

    /* 待办事项区域 */
    .weekly-todo-section { margin-top: 30px; }
    .todo-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .todo-header h2 { font-size: 18px; margin: 0; color: #F957A5; }
    .week-key-tag { font-size: 12px; font-weight: 700; opacity: 0.5; }

    .todo-input-group { display: flex; gap: 10px; margin-bottom: 20px; }
    .dream-input {
        flex: 1; border-radius: 12px; border: 1px solid rgba(0,0,0,0.05); padding: 12px;
        background: rgba(255,255,255,0.8); outline: none; transition: all 0.3s;
    }
    .dream-input:focus { background: white; border-color: #F957A5; }
    .add-todo-btn { background: #333; color: white; border-radius: 12px; padding: 0 20px; font-weight: 600; }

    /* 待办行样式 */
    .todo-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 14px; background: rgba(255,255,255,0.4); border-radius: 12px; margin-bottom: 8px;
        transition: all 0.2s;
    }
    .todo-row.is-done { opacity: 0.5; background: rgba(255,255,255,0.2); }

    .todo-check-wrapper { display: flex; align-items: center; gap: 12px; cursor: pointer; flex: 1; }
    .todo-check-wrapper input { display: none; }
    .custom-check {
        width: 20px; height: 20px; border: 2px solid #ddd; border-radius: 6px;
        transition: all 0.2s; background: white;
    }
    .todo-check-wrapper input:checked + .custom-check { background: #F957A5; border-color: #F957A5; }

    .todo-text { font-size: 14px; font-weight: 600; }
    .is-done .todo-text { text-decoration: line-through; }

    .delete-icon-btn { background: none; border: none; color: #ccc; cursor: pointer; padding: 4px; }
    .delete-icon-btn:hover { color: #ff4757; }

    .glass-card {
        background: rgba(255, 255, 255, 0.4);
        backdrop-filter: blur(15px);
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.5);
        padding: 20px;
    }
</style>
