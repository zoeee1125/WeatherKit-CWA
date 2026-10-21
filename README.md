#  iRingo: 🌤 WeatherKit

把 iOS / iPadOS / macOS 內建「天氣」的資料來源切換到臺灣中央氣象署（CWA）。

## 資料源

本專案只支援一個協力廠商資料源：

- **中央氣象署（臺灣，CWA）** — 目前天氣、逐時預報、每日預報與天氣警特報

需要「不替換」時，可在設定中選擇 `WeatherKit`，模組會完全保留 Apple 原始資料。

## 快速開始

1. 在 <https://opendata.cwa.gov.tw/> 取得授權碼
2. 安裝 Release 內的 `iRingo.WeatherKit.sgmodule`
3. 在 BoxJs 的 `iRingo.WeatherKit` 填入 `[API] 中央氣象署授權碼`

完整說明、資料集對應與已知限制見 [docs/cwa-provider.md](docs/cwa-provider.md)。

## 授權

Apache-2.0，見 [LICENSE](LICENSE)。
