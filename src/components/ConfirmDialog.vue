<script setup lang="ts">
    import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

    type Props = {
        modelValue: boolean;
        title?: string;
        message?: string;
        confirmText?: string;
        cancelText?: string;
        danger?: boolean;
        closeOnBackdrop?: boolean;
    };

    const props = withDefaults(defineProps<Props>(), {
        title: "Confirm",
        message: "",
        confirmText: "确认",
        cancelText: "取消",
        danger: false,
        closeOnBackdrop: true,
    });

    const emit = defineEmits<{
        (e: "update:modelValue", v: boolean): void;
        (e: "confirm"): void;
        (e: "cancel"): void;
    }>();

    const open = computed(() => props.modelValue);
    const dialogRef = ref<HTMLDivElement | null>(null);

    function close() {
        emit("update:modelValue", false);
    }

    function onCancel() {
        emit("cancel");
        close();
    }

    function onConfirm() {
        emit("confirm");
        close();
    }

    function onBackdropClick() {
        if (!props.closeOnBackdrop) return;
        onCancel();
    }

    function onKeydown(e: KeyboardEvent) {
        if (!open.value) return;
        if (e.key === "Escape") onCancel();
    }

    watch(open, (v) => {
        // 打开时把焦点给 dialog，键盘操作更顺畅
        if (v) {
            setTimeout(() => dialogRef.value?.focus(), 0);
        }
    });

    onMounted(() => window.addEventListener("keydown", onKeydown));
    onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
    <Teleport to="body">
        <Transition name="cd-fade">
            <div v-if="open" class="cd-overlay" @mousedown.self="onBackdropClick">
                <div
                        ref="dialogRef"
                        class="cd-dialog"
                        role="dialog"
                        aria-modal="true"
                        :aria-label="title"
                        tabindex="-1"
                >
                    <div class="cd-header">
                        <div class="cd-title">{{ title }}</div>
                        <button class="cd-x" type="button" @click="onCancel" aria-label="Close">✕</button>
                    </div>

                    <div class="cd-body">
                        <div class="cd-message" v-if="message">{{ message }}</div>
                        <slot />
                    </div>

                    <div class="cd-footer">
                        <button class="cd-btn cd-ghost" type="button" @click="onCancel">
                            {{ cancelText }}
                        </button>
                        <button
                                class="cd-btn"
                                :class="danger ? 'cd-danger' : 'cd-primary'"
                                type="button"
                                @click="onConfirm"
                        >
                            {{ confirmText }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
    /* overlay */
    .cd-overlay{
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 16px;
        z-index: 9999;

        background: rgba(20, 20, 30, 0.25);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
    }

    /* dialog */
    .cd-dialog{
        width: min(520px, 100%);
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.35);
        background: rgba(255,255,255,.55);
        box-shadow: 0 18px 55px rgba(0,0,0,.18);
        overflow: hidden;
        outline: none;
    }

    /* header */
    .cd-header{
        display:flex;
        justify-content: space-between;
        align-items:center;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255,255,255,.35);
    }

    .cd-title{
        font-weight: 800;
        letter-spacing: .2px;
    }

    .cd-x{
        border: 1px solid rgba(255,255,255,.45);
        background: rgba(255,255,255,.35);
        border-radius: 10px;
        width: 34px;
        height: 34px;
        cursor: pointer;
        opacity: .9;
    }
    .cd-x:hover{ opacity: 1; }

    /* body */
    .cd-body{
        padding: 14px;
    }
    .cd-message{
        opacity: .85;
        line-height: 1.5;
        white-space: pre-line; /* 支持 \n 换行 */
    }

    /* footer */
    .cd-footer{
        display:flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 12px 14px;
        border-top: 1px solid rgba(255,255,255,.35);
    }

    .cd-btn{
        border: 1px solid rgba(255,255,255,.45);
        border-radius: 12px;
        padding: 8px 12px;
        cursor: pointer;
        background: rgba(255,255,255,.45);
        font-weight: 600;
        opacity: .95;
    }
    .cd-btn:hover{ opacity: 1; }

    .cd-ghost{
        background: rgba(255,255,255,.25);
    }

    .cd-primary{
        background: rgba(255,255,255,.65);
    }

    .cd-danger{
        border-color: rgba(255, 92, 147, .55);
        background: rgba(255, 92, 147, .16);
    }

    /* transition */
    .cd-fade-enter-active, .cd-fade-leave-active{
        transition: opacity .15s ease;
    }
    .cd-fade-enter-from, .cd-fade-leave-to{
        opacity: 0;
    }
</style>
