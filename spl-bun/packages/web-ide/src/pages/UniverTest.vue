<script setup lang="ts">
import UniverSheet from "../components/UniverSheet.vue";
</script>

<template>
  <div class="page">
    <h1>Univer Test Page</h1>
    <UniverSheet />
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page h1 {
  margin-bottom: 16px;
  font-size: 24px;
  color: #333;
}
</style>
