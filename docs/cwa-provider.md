# 中央气象署（CWA）数据源

本模块可以把 iOS / iPadOS / macOS 内置「天气」的数据切换到台湾中央气象署（Central Weather Administration, CWA）开放资料平台。

## 前置条件

1. 在 <https://opendata.cwa.gov.tw/> 注册会员，并在会员中心取得授权码（形如 `CWA-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`）。
2. 使用 Surge 安装 `iRingo.WeatherKit` 模块，启用 HTTPS 解密（MITM），并信任 Surge 证书。
3. 请求坐标必须能解析到台湾地区的乡镇市区；距离最近乡镇市区中心超过 50 km 时不会替换。

## 设置

在 BoxJs 打开 `iRingo.WeatherKit`，设置以下项目：

| 设置项 | 值 | 说明 |
| --- | --- | --- |
| `[API] 中央气象署授权码` | 你的 CWA 授权码 | 必填；留空时 CWA 数据源不可用 |
| `[天气] 数据源` | `中央气象署（台湾）` | 默认值；替换现在天气、逐时与每日预报 |
| `[天气预警] 数据源` | `中央气象署（台湾）` | 默认值；需要 CWA 警特报时设置 |

`Weather.Replace` 不需要加入 `TW`。只要 `Weather.Provider` 设为 `CWA`，且坐标可解析为台湾乡镇市区，模块就会替换天气数据；`Weather.Replace` 仍然保留原本「按国家/地区替换」的行为。

模块参数的键名分别为 `API.CWA.Token`、`Weather.Provider`、`WeatherAlerts.Provider`，效果与在 BoxJs 设置相同。

## 资料集对应

| WeatherKit 数据集 | CWA 来源 | 说明 |
| --- | --- | --- |
| `currentWeather` | `O-A0003-001` | 最近观测站，每 10 分钟更新 |
| `forecastHourly` | `F-D0047-093`（3 天） | 逐时预报；3 天之后用 1 周资料以 12 小时为间隔延伸 |
| `forecastDaily` | `F-D0047-093`（1 周） | 7 天，含最高/最低温、紫外线、日出日没、月出月没与月相 |
| `weatherAlerts` | `W-C0033-001`、`W-C0033-003`～`010`、`W-C0034-001` | 先取县市警报现象，再依县市/乡镇覆盖率挑选最精确的一笔 |
| `airQuality` | 不提供 | 台湾空气质量属环境部资料；保留 Apple 原数据 |
| `forecastNextHour` | 不提供 | CWA 没有分钟级降水资料集；保留 Apple 原数据 |

## 已知限制

- CWA 的警报是「警特报」，不是 Apple 的逐事件预警；同一事件会合并为一笔，并保留最严重或最精确的区域。
- 观测站可能距离实际位置数十公里，现在天气代表附近观测站的观测值，不是格点插值。
- 月相由本地朔望月周期推算，可能有约半天误差。
- 风速会从 CWA 的 m/s 换算为 WeatherKit 的 km/h。
- 授权码请勿提交到仓库或公开分享；本仓库的默认值为空字符串。

## 建置

本仓库已把 Apple WeatherKit 的 FlatBuffers 绑定内嵌为本地套件 `packages/weatherkit-schema`，所有依赖都来自公开 npm，因此不需要任何 GitHub Packages 凭证：

```bash
npm install
npm run build          # 产生 dist/request.bundle.js 与 dist/response.bundle.js
npm run build:args     # 产生 dist/iRingo.WeatherKit.sgmodule 等模组
```

模组内的 `script-path` 指向本仓库的 Release 资源，因此请透过推送 `vX.Y.Z` 标签让 GitHub Actions 建立 Release，再安装该 Release 内的 `iRingo.WeatherKit.sgmodule`。
