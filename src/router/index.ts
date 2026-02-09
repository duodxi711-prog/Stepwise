import { createRouter, createWebHashHistory } from "vue-router";
import SetupView from "../views/SetupView.vue";
import TodayView from "../views/TodayView.vue";
import PlanView from "../views/PlanView.vue";
import BoardView from "../views/BoardView.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/setup" },
    { path: "/setup", component: SetupView },
    { path: "/today", component: TodayView },
    { path: "/plan", component: PlanView },
    { path: "/board", name: "board", component: BoardView },
  ],
});

export default router;
