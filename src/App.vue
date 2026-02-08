<script setup lang="ts">
  import { RouterLink, RouterView } from "vue-router";
  import logoUrl from "./assets/icons/Stepwise.png";
  import bgUrl from "./assets/bg/bg01.jpg";
  const appStyle = {
    // 用半透明白色渐变盖在背景图上，保证文字可读
    backgroundImage: `linear-gradient(rgba(255,255,255,.60), rgba(255,255,255,.60)), url(${bgUrl})`,
  };

</script>

<template>
  <div class="app" :style="appStyle">
    <header class="nav-container">
      <nav class="nav-content">
        <div class="brand">
          <img :src="logoUrl" class="logo" alt="Stepwise logo" />
        </div>

        <div class="links">
          <RouterLink to="/setup">Setup</RouterLink>
          <RouterLink to="/today">Today</RouterLink>
          <RouterLink to="/plan">Plan</RouterLink>
          <RouterLink to="/board">Board</RouterLink>
        </div>
      </nav>
    </header>

    <main class="main">
      <div class="view-wrapper">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<style scoped>
  /* 全局容器 */
  .app {
    min-height: 100vh;
    background-size: cover;
    background-position: center;
    background-attachment: fixed;
    /* 确保字体渲染更平滑 */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color: #2c3e50;
    transition: all 0.5s ease;
  }

  /* 导航栏外层：增加外边距让它看起来像悬浮的 */
  .nav-container {
    position: sticky;
    top: 0;
    z-index: 100;
    padding: 15px 20px;
  }

  /* 导航栏主体：核心 Y2K 玻璃感 */
  .nav-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 24px;

    /* 玻璃质感：半透明白 + 模糊 */
    background: rgba(255, 255, 255, 0.4);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);

    /* 圆润边框与极细高光 */
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.5);

    /* 柔和阴影 */
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
  }

  .brand {
    display: flex;
    align-items: center;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
  }

  .logo {
    height: 38px; /* 稍微加大一点点 */
    transition: transform 0.3s ease;
  }

  .logo:hover {
    transform: rotate(-5deg) scale(1.1);
  }

  .links {
    display: flex;
    gap: 15px;
  }

  /* 链接样式：胶囊形状 */
  .links a {
    text-decoration: none;
    padding: 8px 20px;
    font-size: 15px;
    font-weight: 500;
    color: #555;
    border-radius: 999px;
    border: 1px solid transparent;
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  /* 悬浮效果：增加浅紫色呼吸感 */
  .links a:hover {
    background: rgba(255, 255, 255, 0.6);
    color: #8e44ad; /* 淡淡的紫色 */
    transform: translateY(-2px);
  }

  /* 激活状态：Y2K 标志性的明亮色调 */
  .links a.router-link-active {
    background: rgba(255, 255, 255, 0.1);
    color: #F957A5;
    font-weight: 700;
    /* 关键：内阴影营造下陷感 */
    box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.05),
    inset -2px -2px 5px rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  /* 内容区域限制宽度，避免太散 */
  .main {
    padding: 10px 20px 40px;
  }

  .view-wrapper {
    max-width: 1200px;
    margin: 0 auto;
  }
</style>
