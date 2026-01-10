import { createRouter, createWebHistory } from "vue-router";
import SplIde from "../pages/SplIde.vue";
import UniverTest from "../pages/UniverTest.vue";
import UniverAgGridTest from "../pages/UniverAgGridTest.vue";
import NoFormulaEngine from "../pages/NoFormulaEngine.vue";

const router = createRouter({
  history: createWebHistory("/"),
  routes: [
    {
      path: "/",
      name: "spl-ide",
      component: SplIde,
    },
    {
      path: "/univer-test",
      name: "univer-test",
      component: UniverTest,
    },
    {
      path: "/univer-ag-grid-test",
      name: "univer-ag-grid-test",
      component: UniverAgGridTest,
    },
    {
      path: "/no-formula-engine",
      name: "no-formula-engine",
      component: NoFormulaEngine,
    },
  ],
});

export default router;
