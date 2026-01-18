请按照codument执行规范：
.opencode\command\codument-implement.md
完成change track:
codument\tracks\add-expression-core-ops
如果当前是通过ralph-loop重复执行，需要注意如果已经实现过的当前track 已编写的代码，要进行比对，查缺补漏
如果在 codument\tracks\add-expression-core-ops\plan.xml 状态是未开始，需要从头执行。
如果在 codument\tracks\add-expression-core-ops\plan.xml 状态是进行中，需要从头分析，也要code review当前已编写的代码，思考和java版gap。比如梳理 Java 语义与缺口清单
如果在 codument\tracks\add-expression-core-ops\plan.xml 状态是已经执行过，需要code review，思考和java版ga

** 重要 ** 每次ralph-loop重复执行，不可重置plan.xml和已编写的代码，丢弃过往的进度

