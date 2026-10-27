# Windows CMD 操作说明

按 Win+R，输入 `cmd` 后回车。命令在命令提示符运行，不需要管理员权限。

## 1. 进入项目

本机已有目录：

```bat
cd /d D:\Project\Game\FruitMap
```

`/d` 同时切换盘符和目录。新克隆的项目名为 `FruitMapCN`，请使用实际保存路径；路径有空格时加双引号。

## 2. 日常启动和停止

```bat
Start-FruitMap.cmd
```

也可以双击该文件。保持窗口打开，在浏览器访问 <http://127.0.0.1:8018>。按 Ctrl+C 停止；若提示终止批处理，输入 Y。

不使用启动脚本时，在项目根目录执行：

```bat
.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8018
```

端口已占用时先停掉自己的旧服务，或将 `8018` 改为 `8019` 并访问对应地址。更新后端代码或 `.env` 后要重启服务；浏览器按 Ctrl+F5 刷新。

## 3. 新电脑首次安装

先安装 Python 3.11+、Node.js 22.12+、pnpm 10+ 和 Git，然后在准备保存项目的目录执行：

```bat
git clone https://github.com/Starlightchaser/FruitMapCN.git
cd FruitMapCN
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements.lock.txt
.venv\Scripts\python.exe -m pip install --no-deps -e ".\backend[test]"
copy .env.example .env
cd frontend
pnpm install --frozen-lockfile
pnpm run build
cd ..
Start-FruitMap.cmd
```

已有 `.env` 时不要覆盖。未导入主表时页面显示空库，这是公开源码包的正常状态；数据库、Excel 和口味资料清单没有随仓库提供。

## 4. 导入自己的主表

将主表保存为项目内 `data\imports\master.xlsx`，按 [数据管理说明](docs/DATA-MANAGEMENT.md) 检查工作表和列名。以下从项目根目录开始：

```bat
cd backend
..\.venv\Scripts\python.exe -m app.importers.excel_importer "..\data\imports\master.xlsx" --dry-run --report "..\data\reports\dry-run.json"
..\.venv\Scripts\python.exe -m app.maintenance backup --output "..\data\backups\before-import.db"
..\.venv\Scripts\python.exe -m app.importers.excel_importer "..\data\imports\master.xlsx" --report "..\data\reports\import.json"
cd ..
```

先确认预演报告 `error=0`。首次导入前若没有数据库，可跳过备份；后续更新应先备份，备份文件名每次换新。删除 Excel 行不会自动删除库中记录。

## 5. 修改页面后构建

```bat
cd frontend
pnpm run build
cd ..
```

成功后刷新浏览器；若同时改了后端则重启服务。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 找不到 `.venv` / `frontend\dist` | 完成首次安装和前端构建 |
| 页面没有水果 | 公开包不带业务数据；导入自己的主表，或检查 `DATABASE_URL` |
| 改数据后数量没变 | 核对正式导入报告，再重启后端并刷新；预演不会写入 |
| `pnpm` 找不到 | 安装 pnpm 10+，重新打开 CMD |
| 地图要求 Key | 本版示例配置使用 `MAP_PROVIDER=datav`，无须天地图或高德 Key |

公开部署与地图核验另见 [开发说明](docs/DEVELOPMENT.md) 和 [地图说明](docs/MAP-NOTES.md)。
