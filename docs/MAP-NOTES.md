# 地图来源与使用说明

底图使用 [阿里云 DataV GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector) 的[全国原始边界](https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json)，位于 `backend/assets/maps/datav-china.geojson`。同目录 `.source.json` 保存来源、大小、SHA-256 和要素清单。

当前文件有 35 个要素，保留台湾省、香港特别行政区、澳门特别行政区、海南省及原文件未命名的南部几何。SHA-256：

```text
102e099284768fd4ef486dcf0aede37389a1bc6fa2178e8aa9292b58fd4c23ca
```

SVG 根据原始经纬度投影；没有简化、拼接、补绘或移动边界。省级气泡是汇总标注，使用源文件中的中心点，不是果园位置；避让时仅调整气泡并用引线连接原中心。没有水果数据的地区仍保留边界。

默认视角便于探索主要产区，可拖动、缩放、复位。缩略图保留完整范围，另提供完整全国视图。默认裁切视窗不改变原始几何。

本地运行不需要地图账户和 Key。需要重新取得源文件时，在项目根目录执行：

```bat
.venv\Scripts\python.exe scripts\refresh_datav.py
```

更新脚本检查必要地区并记录来源摘要；不要手工编辑国界。边界与水果业务数据分离，不因水果记录数量变化而隐藏地区。

**当前 `publication_approved=false`。** 免费获取不等于拥有任意再利用许可，也不代表满足公开地图发布要求。公开部署前应核对提供方条件、适用用途、审图信息、完整显示和署名，并保留核验记录；确认后才配置生产模式。当前不声称已完成地图公开使用核验。

高德和天地图适配仍保留，属于可选后续方案。县域点必须明确核验 WGS84 / CGCS2000 / GCJ02，不能混用；当前 DataV 省级气泡不依赖县域点。
