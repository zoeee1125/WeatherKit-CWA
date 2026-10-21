# WeatherAlert API 欄位對映說明

本文記錄 Apple 官方 `alertDetails` 頁面、`/api/v1/weatherAlerts` JSON 與本專案中央氣象署（CWA）轉換器之間的欄位對應關係。

## 官方入口與請求參數

官方頁面入口：

```text
https://weatherkit.apple.com/alertDetails/index.html?ids={ids}&lang={language}&party={party}
```

頁面 bundle 會讀取以下查詢參數：

| 參數 | 官方頁面用途 | 本專案用法 |
| --- | --- | --- |
| `ids` | 傳給 `/api/v1/weatherAlerts?lang=...&ids=...` 取得預警 JSON。官方形態通常是逗號分隔的 WeatherAlert UUID。 | 只接管「經緯度」形態（`lat,lon`），因為中央氣象署以鄉鎮範圍發布警特報。`ids` 前必須已有查詢參數。 |
| `lang` | 選擇頁面本地化文案，並篩選 `messages[].language`。 | 直接傳給 CWA 請求與 `WeatherAlerts.Build`，最終寫回 `messages[].language`。 |
| `party` | 頁面上下文標識，會影響腳註／歸因渲染。 | 固定為 `CWA`。 |

官方頁面實際請求資料時只拼接：

```text
/api/v1/weatherAlerts?lang={lang}&ids={ids}
```

`timezone` 與 `party` 不傳給 API，只影響頁面渲染。

## 官方頁面顯式渲染欄位

官方 bundle 的處理流程是：先解析 `/api/v1/weatherAlerts` 回傳的陣列，再過濾出有效事件。有效事件至少需要：

- `description`
- `severity`
- `effectiveTime`
- `source`

## CWA 資料集與欄位來源

| WeatherKit 欄位 | CWA 來源 | 說明 |
| --- | --- | --- |
| `description` | `W-C0033-00X`／`W-C0034-001` 的 `headline`，或 `parameter[alert_title]` | 例：`陸上強風特報(橙色燈號)` |
| `eventName` | `parameter[valueName=alert_title]` | 不含燈號的事件名稱 |
| `severity` | CAP `severity` 轉小寫 | `Severe` → `severe`；燈號不直接對應 severity |
| `certainty` | CAP `certainty` | `Likely` → `likely` |
| `urgency` | CAP `urgency` | `Future` → `future` |
| `phenomenon` | CAP `category` | 通常為 `Met` |
| `source` | CAP `senderName` | 例：`中央氣象署` |
| `areaId` | 縣市戶政代碼 | 由離線對照表 `COUNTIES` 取得 |
| `areaName` | 請求座標所屬縣市 | 例：`臺北市` |
| `issuedTime` | CAP `effective`，退回 `onset` | 發布時間 |
| `effectiveTime` | CAP `onset`，退回 `issuedTime` | 生效時間 |
| `expireTime` | CAP `expires` | 失效時間 |
| `guidelines` | CAP `instruction` 逐行切分 | 顯示於防護建議 |
| `message` | CAP `description`；颱風警報攤平 `section` | 詳細說明 |
| `token` | CAP `eventCode.value` | 例：`strongWind` |

## 警特報區域比對

中央氣象署的 `area[].areaDesc` 可能是縣市（`臺北市`）、縣市加鄉鎮（`新竹縣關西鎮`）或別名（`恆春半島`）。模組以覆蓋精確度評分：

| 分數 | 條件 |
| --- | --- |
| 3 | 縣市＋鄉鎮完全相符 |
| 2 | 縣市相符，或別名對應到該縣市 |
| 1 | 同縣市的其他鄉鎮 |
| 0 | 未涵蓋 |

同一事件若有多筆不同燈號或不同區域的特報，只保留分數最高的一筆；分數相同時再比 `severity`。

## 不提供的欄位

- `detailsUrl` 會指向 Apple 官方 `alertDetails` 頁面，`party` 為 `CWA`。
- 中央氣象署沒有逐事件 UUID，`identifier` 由 `資料集:縣市:eventCode:onset` 組合而成。
