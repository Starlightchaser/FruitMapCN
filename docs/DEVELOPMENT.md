# 开发与运行

## 环境与结构

React 19 + TypeScript + Vite 7 负责桌面界面，FastAPI 同域提供 API 和构建产物，SQLite 保存原始记录与派生清理层。无需付费数据库或地图 Key。建议 Python 3.11+、Node.js 22.12+、pnpm 10+；依赖分别锁定在 `backend/requirements.lock.txt` 和 `frontend/pnpm-lock.yaml`。

安装步骤见根目录 README 和 CMD-GUIDE。前后端开发分别打开两个终端：

```bat
rem 终端一：项目根目录
.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8018 --reload
rem 终端二：项目根目录
cd frontend
pnpm run dev
```

前端开发地址为 `http://127.0.0.1:5178`，代理 API 到 8018。日常使用先构建前端，再由 FastAPI 提供同域页面。

## 验证

```bat
cd backend
..\.venv\Scripts\python.exe -m pytest -q
cd ..\frontend
pnpm test
pnpm run typecheck
pnpm run build
cd ..
python scripts/check_release.py
```

公开包中的测试使用合成夹具验证导入、月份解析、查询、清理、迁移、访问控制和地图交互。依赖维护者私有主表的两项集成测试，在未提供该文件时会跳过；不会因此下载替代数据。省级气泡测试使用仓库中的原始地图边界。

## API

| 路径 | 内容 |
| --- | --- |
| `GET /api/filters` | 类目、省县、月份状态选项 |
| `GET /api/summary` | 当前筛选统计与类目分布 |
| `GET /api/map-points` | 省级汇总与可选县域点，不返回全量产品清单 |
| `GET /api/map-boundary` | 原始 DataV 边界 |
| `GET /api/records` | 分页列表，默认 24 条，最多 30 条 |
| `GET /api/records/{id}` | 单条详情及来源 |
| `GET /api/config` | 可公开的地图配置 |

共同筛选参数：`month / category / province / county / county_code / month_status / q / taste`。`taste=documented` 仅看有口味资料，`sort=discovery` 优先展示有品种或口味资料的结果。服务端统一过滤、排序、分页和聚合。

## 数据保护与部署

默认只监听本机，业务数据位于静态目录之外，没有全量导出接口。敏感文件路径和后缀受静态路由限制。公开运行时仍需 HTTPS、反向代理、持久化数据目录和备份；当前每 IP 每分钟 180 次的限流是单进程内存计数，多实例应配置共享限流。

需要私有访问时设置 `PRIVATE_MODE=true`；`SESSION_SECRET` 使用至少 32 字符随机串，在 `backend` 目录运行 `python -m app.auth` 交互生成 `PASSWORD_HASH`。不要把密码、哈希或密钥放进前端或 Git。会话使用 HttpOnly、SameSite=Strict，生产环境使用 Secure，8 小时过期。

`ENV=production` 启动前必须完成地图公开使用核验，并填写已核实的署名、审图信息及 `MAP_PUBLICATION_APPROVED`。不能为了绕过检查随意填写。当前仓库只发布源码，不表示地图上线审核已经完成；详见 [地图说明](MAP-NOTES.md)。

## 发布流程

1. 运行前后端检查，补充操作截图和 CHANGELOG。
2. `git add` 后运行 `python scripts/check_release.py`；只允许审阅过的源码、地图、说明和截图。
3. 提交并创建版本标签，用 `git archive` 输出源码 ZIP，再运行 `python scripts/check_release.py --archive 路径.zip` 检查归档。
4. 推送代码与标签，创建同名 GitHub Release，附源码包及版本说明。公开归档不带数据库、原始表或资料清单，空库运行是预期行为。

更新业务数据独立于源码发布；维护者可在本地导入、备份和重建清理层，无需提交数据到 Git。
