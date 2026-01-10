<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import type { FUniver } from "@univerjs/presets";

import "@univerjs/preset-sheets-core/lib/index.css";

const containerRef = ref<HTMLDivElement>();

let univerAPI: FUniver | null = null;

onMounted(() => {
  if (!containerRef.value) return;

  const { univerAPI: api } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS),
    },
    presets: [
      UniverSheetsCorePreset({
        container: containerRef.value,
      }),
    ],
  });

  univerAPI = api;
  univerAPI.createWorkbook({});
});

onUnmounted(() => {
  univerAPI?.disposeUniver();
});
</script>

<template>
  <div class="univer-container" ref="containerRef"></div>
</template>

<style scoped>
.univer-container {
  flex: 1;
  width: 100%;
  min-height: 500px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}
</style>
