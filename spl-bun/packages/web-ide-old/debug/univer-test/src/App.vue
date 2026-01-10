<script setup lang="ts">
import { RouterView, RouterLink } from "vue-router";
</script>

<template>
  <div class="app">
    <nav class="nav">
      <RouterLink to="/" class="nav-link">Univer Test</RouterLink>
      <RouterLink to="/univer-ag-grid-test" class="nav-link">Univer + AG Grid</RouterLink>
    </nav>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  width: 100%;
}

.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.nav {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  background: #f5f7fb;
  border-bottom: 1px solid #e0e0e0;
}

.nav-link {
  color: #333;
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
}

.nav-link:hover {
  background: #e0e0e0;
}

.nav-link.router-link-active {
  background: #2563eb;
  color: white;
}

.main {
  flex: 1;
  padding: 16px;
  overflow: auto;
}
</style>
