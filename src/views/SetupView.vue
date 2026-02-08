<script setup lang="ts">
    import {usePlannerStore} from "../stores/planner";
    import ConfirmDialog from "../components/ConfirmDialog.vue";
    import {computed} from "vue";
    import {downloadText, readJsonFile, dateStamp} from "../lib/backup";

    const store = usePlannerStore();

    const weekdayLabels = [
        {v: 1, t: "Mon"},
        {v: 2, t: "Tue"},
        {v: 3, t: "Wed"},
        {v: 4, t: "Thu"},
        {v: 5, t: "Fri"},
        {v: 6, t: "Sat"},
        {v: 0, t: "Sun"},
    ];


    const mustExceedsCap = computed(() =>
        Number(store.settings.weeklyMustMinutes) > Number(store.settings.minutesPerWeek)
    );

    import {ref} from "vue";

    const showClampHint = ref(false);

    function onSettingsChange() {
        const before = Number(store.settings.weeklyMustMinutes);
        store.clampSettings();
        const after = Number(store.settings.weeklyMustMinutes);

        // 如果发生了 clamp，就显示提示 2 秒
        if (after !== before) {
            showClampHint.value = true;
            setTimeout(() => (showClampHint.value = false), 2000);
        }

        store.persist();
    }


    function generate() {
        store.generatePlan();
        store.goto("/today");
    }

    // kind 切换：为了简单起见，我们用“删除+新建同标题”的方式转换类型（V0 最稳）
    function switchKind(id: string, newKind: "assignment" | "routine") {
        const t = store.tasks.find(x => x.id === id);
        if (!t) return;

        const title = t.title;
        const horizon = t.horizon;
        const priority = t.priority;

        store.removeTask(id);
        store.addTask(newKind);

        // 刚加的在最前面
        const created = store.tasks[0];
        if (!created) return;
        store.updateTask(created.id, {title, horizon, priority});
    }

    function confirmRemoveTask(id: string, title?: string) {
        const ok = window.confirm(`确认删除这个任务吗？\n\n${title ?? ""}\n\n删除后将影响排程与历史记录。`);
        if (!ok) return;
        store.removeTask(id);
    }

    function confirmResetAll() {
        const ok = window.confirm(
            "确认重置全部数据吗？\n\n这会清空任务、排程、完成记录与设置（localStorage）。\n此操作不可撤销。"
        );
        if (!ok) return;
        store.resetAll();
    }

    type ConfirmPayload = {
        title: string;
        message: string;
        danger?: boolean;
        confirmText?: string;
        cancelText?: string;
        onConfirm: () => void | Promise<void>;
    };

    const confirmOpen = ref(false);
    const confirmPayload = ref<ConfirmPayload | null>(null);

    function openConfirm(p: ConfirmPayload) {
        confirmPayload.value = p;
        confirmOpen.value = true;
    }

    async function handleConfirm() {
        const p = confirmPayload.value;
        // 先关闭弹窗（避免 onConfirm 里再 openConfirm 时叠层/状态乱）
        confirmOpen.value = false;
        confirmPayload.value = null;

        if (!p) return;

        try {
            await p.onConfirm();
        } catch (err) {
            console.error(err);
            openConfirm({
                title: "操作失败",
                message: "发生异常，请查看 Console 详细信息。",
                danger: true,
                confirmText: "知道了",
                onConfirm: () => {},
            });
        }
    }


    const fileInput = ref<HTMLInputElement | null>(null);

    function exportBackup() {
        const payload = store.exportBackup();
        const filename = `Stepwise-backup-${dateStamp()}.json`;
        downloadText(filename, JSON.stringify(payload, null, 2));
    }

    async function onPickBackupFile(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = ""; // ✅ 允许重复选择同一个文件
        if (!file) return;

        try {
            const data = await readJsonFile<any>(file);

            openConfirm({
                title: "确认导入备份？",
                message:
                    "导入会覆盖你当前浏览器里的全部数据（任务、排程、完成记录、设置、周待办等）。\n\n建议：先 Export 一份当前备份再导入。\n\n确定继续吗？",
                danger: true,
                confirmText: "继续导入",
                cancelText: "取消",
                onConfirm: async () => {
                    store.importBackup(data);

                    // ✅ 关键：延后到下一帧再打开成功弹窗，避免被“关闭事件”覆盖
                    setTimeout(() => {
                        openConfirm({
                            title: "导入成功 ✅",
                            message: "已恢复到本地浏览器（localStorage）。",
                            confirmText: "好的",
                            onConfirm: () => {},
                        });
                    }, 0);
                },
            });
        } catch (err: any) {
            console.error(err);
            openConfirm({
                title: "导入失败",
                message: "文件不是合法 JSON 或版本不兼容。",
                danger: true,
                confirmText: "知道了",
                onConfirm: () => {},
            });
        }
    }


    function openImport() {
        fileInput.value?.click();
    }
</script>

<template>
    <div class="page">
        <header class="page-header">
            <div class="title-group">
                <span class="emoji-icon">⚙️</span>
                <h1>Setup</h1>
            </div>
        </header>

        <section class="glass-card">
            <div class="card-header">
                <h2 class="section-title">全局设置</h2>
            </div>

            <div class="grid-fields">
                <label class="field">
                    <span class="label">每周可投入（分钟）</span>
                    <input type="number" v-model.number="store.settings.minutesPerWeek" @change="onSettingsChange"/>
                </label>

                <label class="field">
                    <span class="label">每天最多安排几个 session</span>
                    <input type="number" v-model.number="store.settings.maxItemsPerDay" @change="store.persist()"/>
                </label>

                <label class="field">
                    <span class="label">Routine 规划未来（周）</span>
                    <input type="number" v-model.number="store.settings.routineHorizonWeeks" @change="store.persist()"/>
                </label>

                <label class="field">
                    <span class="label">每周必完成（分钟）</span>
                    <input type="number" v-model.number="store.settings.weeklyMustMinutes" @change="onSettingsChange"/>
                </label>
            </div>

            <div class="blocked-days">
                <span class="label">避开星期：</span>
                <div class="chips-group">
                    <label v-for="w in weekdayLabels" :key="w.v" class="dream-chip">
                        <input
                                type="checkbox"
                                :checked="(store.settings.blockedWeekdays ?? []).includes(w.v)"
                                @change="store.toggleBlockedWeekday(w.v)"
                        />
                        <span class="chip-text">{{ w.t }}</span>
                    </label>
                </div>
                <div class="muted-hint">💡 勾选后排程将自动避开该日期。</div>
                <div v-if="showClampHint" class="hint-warn">⚠️ 已自动调整：每周必完成 ≤ 每周可投入</div>
            </div>
        </section>

        <section class="glass-card tasks-section">
            <div class="card-header between">
                <h2 class="section-title">任务列表</h2>
                <div class="row">
                    <button class="action-btn" @click="store.addTask('assignment')">+ Assignment</button>
                    <button class="action-btn" @click="store.addTask('routine')">+ Routine</button>
                    <button class="action-btn" @click="store.addTask('project')">+ Project</button>
                </div>
            </div>

            <div v-if="store.tasks.length === 0" class="empty-state">
                <p>还没有任务？快点击上方按钮开启你的梦幻计划吧！✨</p>
            </div>

            <div v-else class="task-list">
                <div v-for="t in store.tasks" :key="t.id" :class="['task-item', t.kind]">
                    <div class="task-meta">
                        <label class="field mini">
                            <span class="label">类型</span>
                            <select :value="t.kind"
                                    @change="switchKind(t.id, (($event.target as HTMLSelectElement).value as any))">
                                <option value="assignment">Assignment</option>
                                <option value="routine">Routine</option>
                                <option value="project">Project</option>
                            </select>
                        </label>
                        <label class="field mini">
                            <span class="label">周期</span>
                            <select v-model="t.horizon" @change="store.persist()">
                                <option value="long">Long</option>
                                <option value="mid">Mid</option>
                                <option value="short">Short</option>
                            </select>
                        </label>
                        <label class="field mini">
                            <span class="label">优先级(1-5)</span>
                            <input type="number" min="1" max="5" v-model.number="t.priority" @change="store.persist()"/>
                        </label>
                    </div>

                    <div class="task-main">
                        <label class="field title-field">
                            <span class="label">标题内容</span>
                            <input v-model="t.title" @input="store.persist()" placeholder="例如：Marketing 调研 / 每日瑜伽..."/>
                        </label>

                        <div class="dynamic-inputs">
                            <template v-if="t.kind === 'assignment'">
                                <label class="field small">
                                    <span class="label">截止日期</span>
                                    <input type="date" v-model="t.dueDate" @change="store.persist()"/>
                                </label>
                                <label class="field small">
                                    <span class="label">总小时</span>
                                    <input type="number" :value="Math.round(t.totalMinutes / 60)"
                                           @change="store.setAssignmentHours(t.id, Number(($event.target as HTMLInputElement).value))"/>
                                </label>
                                <label class="field small">
                                    <span class="label">每周天数</span>
                                    <input type="number" v-model.number="t.sessionsPerWeek" @change="store.persist()"/>
                                </label>
                            </template>

                            <template v-else-if="t.kind === 'routine'">
                                <label class="field small">
                                    <span class="label">开始日期</span>
                                    <input type="date" v-model="t.startDate" @change="store.persist()"/>
                                </label>
                                <label class="field small">
                                    <span class="label">单次分钟</span>
                                    <input type="number" :value="t.minutesPerSession"
                                           @input="store.setRoutineMinutesPerSession(t.id, Number(($event.target as HTMLInputElement).value))"/>
                                </label>
                                <label class="field small">
                                    <span class="label">每周频率</span>
                                    <input type="number" v-model.number="t.sessionsPerWeek" @change="store.persist()"/>
                                </label>
                            </template>

                            <template v-else-if="t.kind === 'project'">
                                <div class="subtask-header clickable" @click="t.showSubtasks = !t.showSubtasks">
                                    <h3 class="subtask-title">
                                        子任务清单
                                        <span class="count-tag">{{ (t.subtasks?.length ?? 0) }}/10</span>
                                        <span class="arrow-icon" :class="{ 'is-rotated': t.showSubtasks }">▼</span>
                                    </h3>
                                    <button class="add-subtask-btn" type="button"
                                            :disabled="(t.subtasks?.length ?? 0) >= 10"
                                            @click.stop="store.addProjectSubtask(t.id)">
                                        + 添加子任务
                                    </button>
                                </div>

                                <transition name="fold">
                                    <div v-if="t.showSubtasks" class="subtask-glass-list">
                                        <div v-if="(t.subtasks?.length ?? 0) === 0" class="subtask-empty">
                                            快点击上方按钮拆解你的 Project 吧 ☁️
                                        </div>

                                        <div v-for="s in (t.subtasks ?? [])" :key="s.id" class="subtask-item">
                                            <div class="subtask-index">·</div>
                                            <input class="subtask-input" v-model="s.title" @input="store.persist()"
                                                   placeholder="输入子任务步骤..."/>
                                            <button class="subtask-del-btn" type="button"
                                                    @click="store.deleteProjectSubtask(t.id, s.id)">删除
                                            </button>
                                        </div>
                                    </div>
                                </transition>
                            </template>
                        </div>
                    </div>

                    <div class="task-footer">
                        <span class="hint-text"
                              v-if="t.kind === 'assignment'">🕒 每周均匀分配 {{ t.sessionsPerWeek }} 天。</span>
                        <span class="hint-text" v-else-if="t.kind === 'routine'">🔄 循环任务：每周 {{ t.sessionsPerWeek }} 次固定频率。</span>
                        <button class="delete-btn"
                                @click="openConfirm({
                                title: '确认删除任务？',
                                message: `任务：${t.title}\n\n删除后将影响排程与历史记录（建议用归档替代删除）。`,
                                danger: true,
                                confirmText: '删除',
                                cancelText: '取消',
                                onConfirm: () => store.removeTask(t.id),})">Delete
                        </button>
                    </div>
                </div>
            </div>
        </section>

        <footer class="page-actions-container">
            <div class="glass-action-bar">
                <button
                        class="primary-gen-btn pulse-effect"
                        :disabled="store.tasks.length === 0"
                        @click="generate"
                >
                    <span class="btn-icon">✨</span> Generate Dream Plan
                </button>

                <div class="divider"></div>

                <div class="backup-group">
                    <button class="glass-btn-sm" type="button" @click="exportBackup">
                        <span class="btn-icon">📤</span> Export
                    </button>
                    <button class="glass-btn-sm" type="button" @click="openImport">
                        <span class="btn-icon">📥</span> Import
                    </button>
                </div>

                <button class="danger-link-btn" @click="openConfirm({
            title: '确认重置全部数据？',
            message: '这会清空任务、排程、完成记录与设置。\n此操作不可撤销。',
            danger: true,
            confirmText: '重置',
            cancelText: '取消',
            onConfirm: () => store.resetAll(),
        })">
                    Reset Everything
                </button>
            </div>

            <input
                    ref="fileInput"
                    type="file"
                    accept="application/json"
                    style="display:none"
                    @change="onPickBackupFile"
            />
        </footer>

    </div>
    <ConfirmDialog
            v-model="confirmOpen"
            :title="confirmPayload?.title"
            :message="confirmPayload?.message"
            :danger="confirmPayload?.danger"
            :confirm-text="confirmPayload?.confirmText"
            :cancel-text="confirmPayload?.cancelText"
            @confirm="handleConfirm"
    />
</template>

<style scoped>
    /* 页面基础 */
    .page {
        max-width: 1100px;
        margin: 0 auto;
        padding: 20px;
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

    .row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
    }

    .between {
        justify-content: space-between;
    }

    /* 标题样式 */
    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 25px;
    }

    .title-group {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    h1 {
        font-size: 28px;
        color: #333;
        font-weight: 800;
        letter-spacing: -1px;
    }

    /* 玻璃卡片容器 */
    .glass-card {
        background: rgba(255, 255, 255, 0.35);
        backdrop-filter: blur(12px) saturate(160%);
        -webkit-backdrop-filter: blur(12px) saturate(160%);
        border-radius: 24px;
        padding: 24px;
        margin-bottom: 24px;
        border: 1px solid rgba(255, 255, 255, 0.4);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
    }

    .section-title {
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 20px;
        color: #444;
    }

    /* 输入框通用美化 */
    input, select {
        background: rgba(255, 255, 255, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.8);
        border-radius: 12px;
        padding: 10px 14px;
        font-size: 14px;
        outline: none;
        transition: all 0.3s ease;
        box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.02);
    }

    input:focus, select:focus {
        background: #fff;
        border-color: #F957A5;
        box-shadow: 0 0 12px rgba(249, 87, 165, 0.2);
    }

    /* 字段布局 */
    .grid-fields {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-bottom: 24px;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .label {
        font-size: 13px;
        font-weight: 600;
        color: #666;
        opacity: 0.9;
    }

    /* 星期勾选框美化 */
    .chips-group {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 12px 0;
    }

    .dream-chip {
        cursor: pointer;
        position: relative;
    }

    .dream-chip input {
        position: absolute;
        opacity: 0;
        cursor: pointer;
    }

    .chip-text {
        display: inline-block;
        padding: 6px 16px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.8);
        font-size: 14px;
        transition: all 0.3s;
    }

    .dream-chip input:checked + .chip-text {
        background: #F957A5;
        color: white;
        box-shadow: 0 4px 12px rgba(249, 87, 165, 0.3);
        transform: translateY(-2px);
    }

    /* 任务条目 */
    .task-item {
        background: rgba(255, 255, 255, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.6);
        border-radius: 20px;
        padding: 20px;
        margin-bottom: 15px;
        transition: all 0.3s ease;
    }

    .task-item:hover {
        background: rgba(255, 255, 255, 0.6);
        transform: scale(1.005);
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.03);
    }

    /* 区分颜色标记 */
    .task-item.assignment {
        border-left: 6px solid #8e44ad;
    }

    .task-item.routine {
        border-left: 6px solid #2ecc71;
    }

    .task-meta {
        display: flex;
        gap: 15px;
        margin-bottom: 15px;
    }

    .task-main {
        display: flex;
        gap: 20px;
        flex-wrap: wrap;
    }

    .title-field {
        flex: 2;
        min-width: 300px;
    }

    .dynamic-inputs {
        flex: 3;
        display: flex;
        gap: 15px;
        flex-wrap: wrap;
    }

    .task-footer {
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px dashed rgba(0, 0, 0, 0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    /* 按钮美化 */
    button {
        cursor: pointer;
        border: none;
        border-radius: 12px;
        padding: 10px 20px;
        font-weight: 600;
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    .action-btn {
        background: white;
        color: #F957A5;
        border: 1px solid rgba(249, 87, 165, 0.3);
        margin-bottom: 10px;
    }

    .action-btn:hover {
        background: #F957A5;
        color: white;
        transform: translateY(-2px);
    }

    .primary-gen-btn {
        background: linear-gradient(135deg, #F957A5 0%, #8e44ad 100%);
        color: white;
        padding: 16px 40px;
        font-size: 18px;
        border-radius: 999px;
        box-shadow: 0 10px 20px rgba(249, 87, 165, 0.3);
        margin-right: 10px;
    }

    .primary-gen-btn:hover:not(:disabled) {
        transform: scale(1.05);
        box-shadow: 0 15px 25px rgba(249, 87, 165, 0.4);
    }

    .delete-btn {
        background: transparent;
        color: #ff4757;
        font-size: 13px;
    }

    .delete-btn:hover {
        background: rgba(255, 71, 87, 0.1);
    }

    .hint-text {
        font-size: 12px;
        color: #888;
        font-style: italic;
    }

    .muted-hint {
        font-size: 12px;
        opacity: 0.6;
        margin-top: 8px;
    }

    /* 响应式微调 */
    @media (max-width: 768px) {
        .task-main {
            flex-direction: column;
        }

        .dynamic-inputs {
            grid-template-columns: 1fr 1fr;
        }
    }

    .page-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    /* Project 专属美化样式 */

    .project-ddl {
        margin-bottom: 12px;
    }

    .project-logic-hint {
        background: rgba(249, 87, 165, 0.08); /* 使用品牌色微弱背景 */
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 12px;
        color: #666;
        border: 1px dashed rgba(249, 87, 165, 0.2);
        margin-bottom: 20px;
        line-height: 1.5;
    }

    .sparkle {
        color: #F957A5;
        margin-right: 4px;
    }

    /* 子任务头部 */
    .subtask-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        margin-top: 10px;
        margin-bottom: 12px;
    }

    .subtask-title {
        font-size: 14px;
        font-weight: 800;
        color: #444;
        margin: 0;
    }

    .count-tag {
        font-size: 11px;
        color: #999;
        font-weight: normal;
        margin-left: 6px;
    }

    /* 添加按钮：去除黑边，增加发光 */
    .add-subtask-btn {
        background: rgba(255, 255, 255, 0.6);
        color: #F957A5;
        border: none !important; /* 彻底移除黑边 */
        padding: 6px 14px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 700;
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    .add-subtask-btn:hover:not(:disabled) {
        background: #F957A5;
        color: white;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(249, 87, 165, 0.3);
    }

    /* 子任务列表容器 */
    .subtask-glass-list {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .subtask-item {
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(255, 255, 255, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.6);
        padding: 6px 12px;
        border-radius: 12px;
        transition: all 0.3s;
    }

    .subtask-item:focus-within {
        background: rgba(255, 255, 255, 0.8);
        border-color: rgba(249, 87, 165, 0.3);
    }

    .subtask-index {
        color: #F957A5;
        font-weight: 900;
    }

    /* 输入框重置 */
    .subtask-input {
        flex: 1;
        border: none !important;
        background: transparent;
        font-size: 14px;
        color: #444;
        padding: 8px 0;
    }

    /* 删除按钮：轻量级设计 */
    .subtask-del-btn {
        font-size: 11px;
        color: #bbb;
        background: none;
        border: none !important;
        padding: 4px 8px;
        transition: color 0.3s;
    }

    .subtask-del-btn:hover {
        color: #ff4757;
    }

    .subtask-empty {
        text-align: center;
        padding: 20px;
        font-size: 12px;
        color: #bbb;
        border: 1px dashed rgba(0, 0, 0, 0.05);
        border-radius: 15px;
    }

    /* --- 1. 为 Project 增加彩色左边框 --- */
    /* 这里建议使用翡翠绿 (#2ecc71) 或 湖蓝 (#00d2ff) 来符合 Y2K 梦幻感 */
    .task-item.project {
        border-left: 6px solid #3498db; /* 翡翠绿，象征项目的成长与推进 */
    }

    /* --- 折叠交互样式 --- */
    .subtask-header.clickable {
        cursor: pointer;
        user-select: none;
        transition: opacity 0.2s;
    }

    .subtask-header.clickable:hover {
        opacity: 0.8;
    }

    .arrow-icon {
        display: inline-block;
        font-size: 10px;
        margin-left: 8px;
        color: #2ecc71;
        transition: transform 0.3s ease;
    }

    .arrow-icon.is-rotated {
        transform: rotate(180deg);
    }

    /* --- 顺滑折叠动画 --- */
    .fold-enter-active, .fold-leave-active {
        transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
        max-height: 500px; /* 足够容纳10个子任务的高度 */
        overflow: hidden;
    }

    .fold-enter-from, .fold-leave-to {
        max-height: 0;
        opacity: 0;
        transform: translateY(-10px);
    }

    /* 之前按钮黑边的深度修正 */
    .add-subtask-btn, .subtask-del-btn {
        border: none !important;
        outline: none !important;
    }

    /* 容器：固定在底部，带渐入动画 */
    .page-actions-container {
        margin-top: 40px;
        padding-bottom: 20px;
        display: flex;
        justify-content: center;
        animation: slideUpFade 0.8s cubic-bezier(0.22, 1, 0.36, 1);
    }

    @keyframes slideUpFade {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* 玻璃行动条：收纳所有按钮 */
    .glass-action-bar {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 24px;
        background: rgba(255, 255, 255, 0.4);
        backdrop-filter: blur(15px) saturate(160%);
        border-radius: 999px; /* 胶囊形状 */
        border: 1px solid rgba(255, 255, 255, 0.5);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
    }

    /* 彻底消除默认黑边 */
    button {
        border: none !important;
        outline: none !important;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    /* 核心生成按钮：Y2K 粉紫渐变 */
    .primary-gen-btn {
        background: linear-gradient(135deg, #F957A5 0%, #8e44ad 100%);
        color: white;
        padding: 12px 28px;
        border-radius: 999px;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: 0.5px;
        box-shadow: 0 4px 15px rgba(249, 87, 165, 0.3);
    }

    .primary-gen-btn:hover:not(:disabled) {
        transform: scale(1.05) translateY(-2px);
        box-shadow: 0 8px 25px rgba(249, 87, 165, 0.5);
    }

    .primary-gen-btn:disabled {
        background: #ddd;
        opacity: 0.6;
        cursor: not-allowed;
        box-shadow: none;
    }

    /* 呼吸灯特效 */
    .pulse-effect:not(:disabled) {
        animation: glowPulse 2s infinite;
    }

    @keyframes glowPulse {
        0% { box-shadow: 0 4px 15px rgba(249, 87, 165, 0.3); }
        50% { box-shadow: 0 4px 25px rgba(249, 87, 165, 0.6); }
        100% { box-shadow: 0 4px 15px rgba(249, 87, 165, 0.3); }
    }

    /* 备份组小按钮 */
    .backup-group { display: flex; gap: 8px; }

    .glass-btn-sm {
        background: rgba(255, 255, 255, 0.6);
        color: #666;
        padding: 8px 16px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
    }

    .glass-btn-sm:hover {
        background: #fff;
        color: #F957A5;
        transform: translateY(-1px);
    }

    /* 危险重置按钮：保持低调，仅在悬浮时显色 */
    .danger-link-btn {
        background: transparent;
        color: #999;
        font-size: 12px;
        font-weight: 600;
        padding: 8px 12px;
        border-radius: 8px;
    }

    .danger-link-btn:hover {
        color: #ff4757;
        background: rgba(255, 71, 87, 0.05);
    }

    /* 分割线 */
    .divider {
        width: 1px;
        height: 24px;
        background: rgba(0, 0, 0, 0.05);
    }

    .btn-icon { margin-right: 4px; }
</style>
