### 🆕 New Features
  * 新增中央气象署（CWA）数据源：可在「天气」与「天气预警」设置中选择 CWA，使用开放资料平台的观测、乡镇预报、日出日没与警特报资料集。使用前需填写 `API.CWA.Token` 授权码，设置方式见 [docs/cwa-provider.md](docs/cwa-provider.md)。

### 🛠️ Bug Fixes
  * 修复 WeatherKit Response 处理范围未同时受用户设置和 URL `dataSets` 约束的问题：现在只处理两者的交集，避免地图天气小组件只请求当前天气与空气质量时扩展处理其他数据集。
  * 修复和风天气历史空气质量接口路径多余斜杠的问题，确保请求使用正确的 `/v7/historical/air` 路径。

### 🔣 Dependencies
  * 将 FlatBuffer Root 处理器迁移至已发布的 `@nsnanocat/flatbuffer-root@1.0.0`，移除仓库内重复实现。

### ‼️ Breaking Changes
  * none

### 🔄 Other Changes
  * 从 BoxJs 设置中隐藏仅供插件参数使用的 `Storage` 选项，保留运行时配置行为。
  * 补充数据集交集、用户设置过滤、FlatBuffer 根槽映射和 QWeather 接口路径的回归测试。
  * 补充中央气象署数据源的天气现象、风向、时间解析、月相、时间序列、警报覆盖率与设置项回归测试。
  * 将默认天气数据源与天气预警数据源调整为中央气象署（台湾）；非台湾地区或未填写授权码时仍保留 Apple 原数据。
  * 将 WeatherKit FlatBuffers 绑定从私有 `@nsringo/weatherkit` 改为仓库内的 `packages/weatherkit-schema`，并让模块与工作流指向本仓库，构建不再需要 GitHub Packages 访问权限或任何密钥。
