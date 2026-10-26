# 数据管理

## 数据链路与边界

唯一批量导入入口是自己维护的最终 Excel 主表，工作表名为 `水果产地主库`。旧 HTML、讨论文档、名录中间稿和图片坐标不作为回退数据源。公开仓库不提供任何业务数据或自动下载地址。

| 层 | 内容 | 更新方式 |
| --- | --- | --- |
| `fruit_records` + 月份关联表 | 原始产品、完整产地、月份和来源 | Excel 导入 |
| `fruit_curation` | 镇级展示产地、省县归一、重复关联、品种与口味 | 重建派生层 |
| `fruit_catalog` | 应用统一读取的视图 | 列表、统计、地图使用同一口径 |

schema 版本为 2；升级从 v1 增加清理表和视图，保留原始记录。数据库位于 `backend/data/fruit.db`，可通过 `.env` 的 `DATABASE_URL` 更改；相对路径以项目根目录为基准。

## 主表格式

必须有以下六列，列名须完全一致：

| 列名 | 约定 |
| --- | --- |
| 水果类目 | 非空 |
| 品种/地方产品名 | 非空；普通产品名可以保留，不能猜测品种 |
| 产地完整名称 | 非空，保留原始资料 |
| 上市月份区间 | 如 `9—10月`、`11月—次年2月`；支持全年和多区间 |
| 月份数字（筛选用） | 如 `9,10`；必须与月份区间解析结果一致 |
| 月份依据类型 | 明确估算、有来源、已核验或待补，待补不得同时填写月份 |

可选列：`记录UID`、`省份`、`市/州`、`县/区/旗（初步解析）`、`乡镇/村（原文）`、`产地-品种来源`、`来源URL`、`记录状态`、`备注`、`月份说明`、`月份来源名称`、`月份来源URL`。

UID 默认根据规范化后的产品名和完整产地生成。更名或纠正产地时，先将原 UID 填入 `记录UID`，再改文本，以更新原关联。否则会生成新关联。重复 UID 阻止整批写入；从 Excel 移除行不会自动删除库中记录。

## 导入、检查和备份

以下在 `backend` 目录执行（CMD）：

```bat
..\.venv\Scripts\python.exe -m app.importers.excel_importer "..\data\imports\master.xlsx" --dry-run --report "..\data\reports\preview.json"
..\.venv\Scripts\python.exe -m app.maintenance backup --output "..\data\backups\before-update.db"
..\.venv\Scripts\python.exe -m app.importers.excel_importer "..\data\imports\master.xlsx" --report "..\data\reports\import.json"
..\.venv\Scripts\python.exe -m app.maintenance stats
```

首次尚未建库时可跳过备份。备份目标必须是新文件，每次使用不同名称。预演在内存中比较，不写数据库；正式导入通过事务提交，错误大于零时不写入。报告区分 insert / update / unchanged；未变记录保持原更新时间。月份估算会产生 warning，不等于导入错误。

换库时先停止服务并备份，再修改 `.env` 的 `DATABASE_URL` 指向备份副本，重启后核对统计。不在运行中手工覆盖 SQLite 文件。

## 品种与口味资料

复制 `data/curation/evidence.example.json` 为同目录 `evidence.json`，在本地维护。空白结构不带水果资料；没有该文件时仍能正常导入，只执行基础地域整理和去重。

- `records`：通过 `record_uid` 精确匹配，填写 `expected_product_name` 防止误用。
- `profiles`：通过 `products` 中完整产品名及可选 `origin_prefix` 匹配，重叠规则报错。
- `name_extractions`：仅从原始产品名提取已有的明确品种，不把地区普通名称猜成品种。
- 品种资料填写 `variety_name / variety_scope / variety_source_name / variety_source_url`。
- 口味资料填写 `taste_profile / taste_tags / taste_scope / taste_source_name / taste_source_url`，同时填写 `checked_at`。

`taste_tags` 使用项目支持的定性标签：清甜、酸甜、浓甜、脆爽、软糯、浓香。品种共性和产区参考必须在 scope 中说明，不能泛化到未核实的具体产地。来源不足时留空；补口味不改变月份核验状态。

```bat
..\.venv\Scripts\python.exe -m app.curation --report "..\data\reports\curation-preview.json"
..\.venv\Scripts\python.exe -m app.curation --apply --report "..\data\reports\curation-current.json"
```

第一条在内存预览；第二条先备份，再以事务重建清理层。乡镇整理保留“崔村镇”等真实名称；跨省关联不强行分配到单一省，避免重复汇总。

## 可选定位资料

当前省级气泡使用边界自带中心点，无需县域坐标。需要县域点时参考 `data/county-locations.example.csv`，使用 `app.importers.geo_importer` 先预演再导入；必须有来源、核对日期、`verified=true` 和明确坐标系，省县精确匹配。点位表示行政区中心，不是果园位置。

## 发布约束

`.gitignore` 只放行空白结构示例与审阅过的文档截图。数据库、Excel、`evidence.json`、报告、备份、旧 HTML 和对话记录留在本地。源码发布前运行 `python scripts/check_release.py` 检查 Git 暂存内容；Release 使用经过检查的源码归档。分页和限流能控制接口使用，不能保证公开页面无法被采集。
