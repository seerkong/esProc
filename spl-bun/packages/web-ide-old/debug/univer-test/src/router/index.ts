import { createRouter, createWebHistory } from "vue-router";
import UniverTest from "../pages/UniverTest.vue";
import UniverAgGridTest from "../pages/UniverAgGridTest.vue";
import NoFormulaEngine from "../pages/NoFormulaEngine.vue";
import SplIde from "../pages/SplIde.vue";

const router = createRouter({
  history: createWebHistory("/univer-test/"),
  routes: [
    {
      path: "/",
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
    {
      path: "/spl-ide",
      name: "spl-ide",
      component: SplIde,
    },
  ],
});

export default router;
