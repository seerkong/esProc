# Java esProc 行为分析

本文档总结了 Java esProc 中数据库相关 DSL 的实现行为，作为 TypeScript 迁移的参考依据。

## 源码位置

| 功能 | Java 文件 |
|------|-----------|
| connect() 函数 | `src/main/java/com/scudata/expression/fn/Connect.java` |
| db.query() 成员函数 | `src/main/java/com/scudata/expression/mfn/db/Query.java` |
| 数据库对象 | `src/main/java/com/scudata/dm/DBObject.java` |
| 数据库会话 | `src/main/java/com/scudata/common/DBSession.java` |
| SQL 执行工具 | `src/main/java/com/scudata/util/DatabaseUtil.java` |
| 函数注册 | `src/main/java/com/scudata/expression/FunctionLib.java` |
| 数据源工厂查找 | `src/main/java/com/scudata/util/EnvUtil.java` |
| 全局环境 | `src/main/java/com/scudata/dm/Env.java` |

## 1. connect() 函数行为

### 源码分析 (Connect.java)

```java
public class Connect extends Function {
    public Object calculate(Context ctx) {
        if (param == null) {
            // 无参数时创建简单查询对象
            return FileObject.createSimpleQuery();
        }

        if (param.isLeaf()) {
            // connect("datasourceName") - 按名称查找数据源
            Object obj = param.getLeafExpression().calculate(ctx);
            String name = (String)obj;

            // 从环境中查找数据源工厂
            ISessionFactory dbsf = EnvUtil.getDBSessionFactory(name, ctx);
            if (dbsf == null) {
                throw new RQException(name + " 数据源不存在");
            }

            // 创建数据库对象
            DBObject dbo = new DBObject(dbsf, option, ctx);
            return dbo;
        } else {
            // connect(driver, url) - 直接指定驱动和URL
            String driver = ...;
            String url = ...;
            DBConfig config = new DBConfig();
            config.setDriver(driver);
            config.setUrl(url);
            DBSessionFactory factory = new DBSessionFactory(config);
            DBObject dbo = new DBObject(factory, option, ctx);
            return dbo;
        }
    }
}
```

### 数据源查找流程 (EnvUtil.java)

```java
public static ISessionFactory getDBSessionFactory(String dbName, Context ctx) {
    if (ctx == null) {
        return Env.getDBSessionFactory(dbName);
    } else {
        // 先从上下文查找，再从全局环境查找
        ISessionFactory dbsf = ctx.getDBSessionFactory(dbName);
        return dbsf == null ? Env.getDBSessionFactory(dbName) : dbsf;
    }
}
```

### 数据源注册 (Env.java)

```java
// 全局数据源工厂映射表
private static HashMap<String, ISessionFactory> dbsfs;

public static ISessionFactory getDBSessionFactory(String name) {
    if (dbsfs == null) return null;
    return dbsfs.get(name);
}

public static void setDBSessionFactory(String name, ISessionFactory sf) {
    if (dbsfs == null) {
        dbsfs = new HashMap<String, ISessionFactory>();
    }
    dbsfs.put(name, sf);
}
```

### 关键行为

1. **预注册机制**: 数据源工厂必须预先通过 `Env.setDBSessionFactory()` 注册
2. **按名称查找**: `connect("demo")` 通过名称查找已注册的工厂
3. **返回连接对象**: 返回 `DBObject` 实例，包装了实际的数据库连接
4. **上下文优先**: 先查上下文中的数据源，再查全局环境

## 2. DBObject 结构

### 源码分析 (DBObject.java)

```java
public class DBObject implements IResource {
    private DBSession dbSession;  // 数据库连接会话
    private Context ctx;          // 计算上下文
    private boolean canClose;     // 连接是否可被关闭
    private boolean isLower;      // 字段名是否转小写

    // 通过工厂创建连接
    public DBObject(ISessionFactory dbsf, String opt, Context ctx) throws Exception {
        dbSession = dbsf.getSession();  // 从工厂获取会话
        this.canClose = true;           // 工厂创建的连接可关闭
        this.ctx = ctx;
        if (ctx != null) ctx.addResource(this);  // 注册到上下文资源

        // 处理选项
        if (opt != null) {
            if (opt.indexOf('e') != -1) dbSession.setErrorMode(true);  // 错误模式
            if (opt.indexOf('l') != -1) isLower = true;                // 小写模式
            dbSession.isolate(opt);  // 事务隔离级别
        }
    }

    public void close() {
        if (!canClose) {
            throw new RQException("不可关闭的连接");
        }
        // 关闭前回滚未提交事务
        if (!dbSession.getAutoCommit()) {
            try { rollback(null); } catch (Exception e) {}
        }
        dbSession.close();
    }
}
```

### 关键行为

1. **会话封装**: `DBObject` 封装 `DBSession`，`DBSession` 封装 JDBC `Connection`
2. **资源管理**: 连接注册到 Context 的资源列表，便于统一清理
3. **可关闭标志**: `canClose` 控制连接是否可被显式关闭
4. **选项支持**: `@e` 错误模式、`@l` 小写模式等

## 3. db.query() 成员函数行为

### 源码分析 (Query.java)

```java
public class Query extends DBFunction {
    public Object calculate(Context ctx) {
        if (param == null) {
            throw new RQException("query 缺少参数");
        }

        if (param.getType() == IParam.Normal) {
            // db.query("sql") - 无参数查询
            String sql = (String)param.getLeafExpression().calculate(ctx);
            return db.query(sql, null, null, option, ctx);
        }

        if (param.getType() == IParam.Comma) {
            IParam sub0 = param.getSub(0);
            Object obj = sub0.getLeafExpression().calculate(ctx);

            if (obj instanceof Sequence) {
                // db.query(序列, sql, params...) - 批量查询
                Sequence srcSeries = (Sequence)obj;
                String sql = ...;
                Expression[] sqlParams = ...;
                return db.query(srcSeries, sql, sqlParams, types, option, ctx);
            }
            else if (obj instanceof String) {
                // db.query(sql, param1, param2, ...) - 参数化查询
                String sql = (String)obj;
                int paramSize = param.getSubSize() - 1;
                Object[] sqlParams = new Object[paramSize];
                byte[] types = new byte[paramSize];

                for (int i = 0; i < paramSize; i++) {
                    IParam sub = param.getSub(i + 1);
                    if (sub.isLeaf()) {
                        // 只有参数值
                        sqlParams[i] = sub.getLeafExpression().calculate(ctx);
                    } else {
                        // param:type 格式
                        sqlParams[i] = sub.getSub(0).getLeafExpression().calculate(ctx);
                        types[i] = ((Number)sub.getSub(1).getLeafExpression().calculate(ctx)).byteValue();
                    }
                }

                return db.query(sql, sqlParams, types, option, ctx);
            }
        }
    }
}
```

### DBObject.query() 实现

```java
public Sequence query(String sql, Object[] params, byte[] types, String opt, Context ctx) {
    if (isLower) {
        opt = (opt == null) ? "l" : opt + "l";
    }

    // 委托给 DatabaseUtil 执行
    Sequence result = DatabaseUtil.query(sql, params, types, opt, ctx, getDbSession());

    // @x 选项：查询后关闭连接
    if (opt != null && opt.indexOf('x') != -1 && canClose()) {
        close();
    }

    return result;
}
```

### 关键行为

1. **参数绑定**: SQL 使用 `?` 占位符，参数按顺序绑定
2. **类型提示**: 支持 `param:type` 格式指定参数类型
3. **批量查询**: 支持对序列每个元素执行查询
4. **选项**:
   - `@1`: 只返回第一条记录 (`query1`)
   - `@x`: 查询后关闭连接
   - `@l`: 字段名转小写
   - `@i`: 单列结果返回序列

## 4. 参数化查询执行 (DatabaseUtil.java)

### 源码分析

```java
private static Table retrieve(String sql, Object[] params, byte[] types,
                               DBSession dbs, String opt, int recordLimit) {
    Connection con = (Connection)dbs.getSession();
    PreparedStatement pst = con.prepareStatement(sql);

    // 参数绑定
    if (args != null && args.length > 0) {
        int paramIndex = 1;
        for (int i = 0; i < args.length; i++) {
            Object arg = args[i];
            byte type = argTypes[i];

            if (arg instanceof Sequence) {
                // 序列参数展开为多个 ?
                Sequence seq = (Sequence)arg;
                for (int j = 1; j <= seq.length(); j++) {
                    setObject(pst, paramIndex++, seq.get(j), type);
                }
            } else {
                setObject(pst, paramIndex++, arg, type);
            }
        }
    }

    ResultSet rs = pst.executeQuery();
    // ... 处理结果集
}
```

### 关键行为

1. **PreparedStatement**: 使用预编译语句防止 SQL 注入
2. **序列展开**: `Sequence` 类型参数会展开为多个 `?`
3. **类型转换**: 根据类型提示进行适当的类型转换

## 5. 连接生命周期

### 创建流程

```
1. Env.setDBSessionFactory("demo", factory)  // 应用启动时注册
2. db = connect("demo")                       // 用户调用
   ├── EnvUtil.getDBSessionFactory("demo")   // 查找工厂
   ├── factory.getSession()                  // 创建会话
   └── new DBObject(session)                 // 封装为对象
3. db.query("select...")                      // 使用连接
4. db.close()                                 // 显式关闭 (可选)
```

### 关闭策略

- **显式关闭**: 调用 `db.close()`
- **查询后关闭**: 使用 `@x` 选项
- **上下文清理**: Context 销毁时清理所有注册资源

## 6. 函数注册 (FunctionLib.java)

```java
static {
    loadSystemFunctions();
}

private static void loadSystemFunctions() {
    // 全局函数
    addFunction("connect", "com.scudata.expression.fn.Connect");

    // 成员函数 (可多个类实现同名函数)
    addMemberFunction("query", "com.scudata.expression.mfn.db.Query");
    addMemberFunction("query", "com.scudata.expression.mfn.file.Query");
    addMemberFunction("execute", "com.scudata.expression.mfn.db.Execute");
    addMemberFunction("commit", "com.scudata.expression.mfn.db.Commit");
    addMemberFunction("rollback", "com.scudata.expression.mfn.db.Rollback");
    // ...
}
```

### 成员函数分发机制

```java
// DBFunction 基类
public abstract class DBFunction extends MemberFunction {
    protected DBObject db;

    public boolean isLeftTypeMatch(Object obj) {
        return obj instanceof DBObject;  // 检查左侧对象类型
    }

    public void setDotLeftObject(Object obj) {
        db = (DBObject)obj;  // 设置调用对象
    }
}
```

### 关键行为

1. **类型匹配**: 成员函数通过 `isLeftTypeMatch()` 判断是否适用
2. **多实现**: 同名成员函数可有多个实现类，按类型分发
3. **链式调用**: 同名函数形成链表，依次尝试匹配

## 7. TypeScript 迁移映射

| Java 概念 | TypeScript 对应 |
|-----------|-----------------|
| `Env.dbsfs` | `ExecutionContext.connections` Map |
| `ISessionFactory` | `DBConnection` 配置对象 |
| `DBObject` | 连接引用 (name-based lookup) |
| `DBSession` | bun:sqlite `Database` 实例 |
| `DatabaseUtil.query()` | `db.prepare(sql).all(...params)` |
| `FunctionLib` | `memberFunctions` / `globalFunctions` 注册表 |

## 8. 示例对照

### Java esProc
```java
// 注册数据源 (应用启动时)
DBConfig config = new DBConfig();
config.setDriver("org.sqlite.JDBC");
config.setUrl("jdbc:sqlite:demo.db");
Env.setDBSessionFactory("demo", new DBSessionFactory(config));

// 使用
db = connect("demo")
result = db.query("select * from STATES where REGIONID = ?", regionId)
db.close()
```

### TypeScript (目标)
```typescript
// 注册连接 (服务启动时)
const connections = new Map([
  ["demo", { name: "demo", type: "sqlite", path: "demo.db" }]
]);

// 使用
const compiled = compileDSL('demo.query("select * from STATES where REGIONID = ?", regionId)');
const result = await compiled.evaluate({
  connections,
  scope: { regionId: 5 },
  adapters: { sqliteQuery: ... }
});
```
