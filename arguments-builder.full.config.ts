import { defineConfig } from "@iringo/arguments-builder";

type Arg = {
    key: string;
    type: "string" | "number" | "boolean" | "array";
    boxJsType?: "number" | "boolean" | "text" | "slider" | "textarea" | "radios" | "checkboxes" | "colorpicker" | "selects" | "modalSelects" | undefined;
    name?: string | undefined;
    description?: string | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: Copy from upstream `@iringo/arguments-builder`
    defaultValue?: any;
    options?:
        | {
              key: string;
              label?: string | undefined;
          }[]
        | undefined;
    placeholder?: string | undefined;
    exclude?: ("surge" | "loon" | "boxjs" | "dts")[] | undefined;
};

export const output = {
    surge: {
        path: "./dist/iRingo.WeatherKit.sgmodule",
        transformEgern: {
            enable: true,
            path: "./dist/iRingo.WeatherKit.yaml",
        },
    },
    loon: {
        path: "./dist/iRingo.WeatherKit.lpx",
    },
    customItems: [
        {
            path: "./dist/iRingo.WeatherKit.snippet",
            template: "./template/quantumultx.handlebars",
        },
        {
            path: "./dist/iRingo.WeatherKit.stoverride",
            template: "./template/stash.handlebars",
        },
    ],
    dts: {
        isExported: true,
        path: "./src/types.d.ts",
    },
    boxjsSettings: {
        path: "./template/boxjs.settings.json",
        scope: "@iRingo.WeatherKit.Settings",
    },
};

export const dataSets: Arg[] = [
    {
        key: "DataSets",
        name: "[資料集]",
        defaultValue: ["airQuality", "currentWeather", "forecastDaily", "forecastHourly", "forecastNextHour", "weatherAlerts"],
        type: "array",
        description: "選擇需要解析並處理的資料集；未選擇的資料槽始終保持原樣透傳，不作修改。",
        options: [
            { key: "airQuality", label: "空氣品質" },
            { key: "currentWeather", label: "目前天氣" },
            { key: "forecastDaily", label: "每日預報" },
            { key: "forecastHourly", label: "逐時預報" },
            { key: "forecastNextHour", label: "未來一小時降水" },
            { key: "weatherAlerts", label: "天氣警特報" },
        ],
    },
];

export const dataSetsFull: Arg[] = [
    {
        key: "DataSets",
        name: "[資料集]",
        defaultValue: ["currentWeather", "forecastDaily", "forecastHourly", "news", "weatherAlerts", "weatherChange", "trendComparison", "locationInfo"],
        type: "array",
        description: "選擇需要解析並處理的資料集；未選擇的資料槽始終保持原樣透傳，不作修改。",
        options: [
            { key: "currentWeather", label: "目前天氣" },
            { key: "forecastDaily", label: "每日預報" },
            { key: "forecastHourly", label: "逐時預報" },
            { key: "news", label: "新聞" },
            { key: "weatherAlerts", label: "天氣警特報" },
            { key: "weatherChange", label: "天氣變化" },
            { key: "trendComparison", label: "歷史對比" },
            { key: "locationInfo", label: "位置資訊" },
        ],
    },
];

const weatherProvider: Arg = {
    key: "Weather.Provider",
    name: "[天氣] 資料源",
    defaultValue: "CWA",
    type: "string",
    options: [
        { key: "WeatherKit", label: "WeatherKit（不替換）" },
        { key: "CWA", label: "中央氣象署（臺灣）" },
    ],
    description: "使用選定的資料源替換天氣資料。中央氣象署只提供臺灣地區資料，且需要填寫開放資料平台授權碼。",
};

export const weather = [weatherProvider];
export const weatherFull = [weatherProvider];

const weatherAlertsProvider: Arg = {
    key: "WeatherAlerts.Provider",
    name: "[天氣警特報] 資料源",
    defaultValue: "CWA",
    type: "string",
    options: [
        { key: "WeatherKit", label: "WeatherKit（不修改）" },
        { key: "CWA", label: "中央氣象署（臺灣）" },
    ],
    description: "使用選定的資料源處理天氣警特報資料。中央氣象署使用開放資料平台的警特報與颱風警報資料集。",
};

export const weatherAlerts = [weatherAlertsProvider];

const nextHourProvider: Arg = {
    key: "NextHour.Provider",
    name: "[未來一小時降水] 資料源",
    defaultValue: "CWA",
    type: "string",
    options: [
        { key: "WeatherKit", label: "WeatherKit（不修改）" },
        { key: "CWA", label: "中央氣象署（臺灣）" },
    ],
    description: "使用選定的資料源補上未來一小時降水預報。Apple 只對部分地區提供這份資料，中央氣象署則以 QPESUMS 雷達定量降雨預報格點資料提供臺灣資料。",
};

export const nextHour = [nextHourProvider];

const rainAlertMode: Arg = {
    key: "RainAlert.Mode",
    name: "[降雨通知] 通知方式",
    defaultValue: "Auto",
    type: "string",
    options: [
        { key: "Auto", label: "天氣 App 原生優先，排程補送" },
        { key: "Weather", label: "只用天氣 App 原生通知" },
        { key: "Cron", label: "只用排程通知" },
    ],
    description:
        "選擇「未來一小時降雨」通知的來源。天氣 App 的原生通知由未來一小時降水資料驅動，需要城市在關注列表中並開啟「未來一小時降水強度」通知；排程通知由代理程式定時執行腳本，不需要天氣 App 在背景更新。Auto 在天氣 App 剛更新過資料時不補送，避免同一場雨跳出兩則通知。",
};

export const rainAlert = [rainAlertMode];

const airQualityProvider: Arg = {
    key: "AirQuality.Provider",
    name: "[空氣品質] 資料源",
    defaultValue: "Environment",
    type: "string",
    options: [
        { key: "WeatherKit", label: "WeatherKit（不替換）" },
        { key: "Environment", label: "環境部（臺灣）" },
    ],
    description: "使用選定的資料源替換空氣品質資料。環境部只提供臺灣測站資料，且需要填寫開放資料平台 API key。",
};

const airQualityCountryOverride: Arg = {
    key: "AirQuality.CountryOverride",
    name: "[空氣品質] 國家代碼覆寫",
    defaultValue: "",
    type: "string",
    options: [
        { key: "", label: "不覆寫（保持台灣）" },
        { key: "CN", label: "中國大陸（CN）" },
        { key: "JP", label: "日本（JP）" },
        { key: "US", label: "美國（US）" },
        { key: "HK", label: "香港（HK）" },
    ],
    description: "改寫送給 Apple 的國家代碼。空氣品質資料槽由 country 參數決定，而台灣不在 Apple 的支援名單內，因此不會回傳空氣品質；覆寫成支援地區可嘗試借用該地區的空氣品質路徑。",
};

export const airQuality = [airQualityProvider, airQualityCountryOverride];

export const api: Arg[] = [
    {
        key: "API.CWA.Token",
        name: "[API] 中央氣象署授權碼",
        defaultValue: "",
        type: "string",
        placeholder: "CWA-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
        description: "中央氣象署開放資料平台會員授權碼，於 https://opendata.cwa.gov.tw/ 取得。使用中央氣象署資料源時必須填寫。",
    },
    {
        key: "API.Environment.Token",
        name: "[API] 環境部 API key",
        defaultValue: "",
        type: "string",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        description: "環境部環境資料開放平臺會員 API key，於 https://data.moenv.gov.tw/api_term 註冊後取得。使用環境部空氣品質資料源時必須填寫。",
    },
];

export const storage: Arg[] = [
    {
        key: "Storage",
        name: "[儲存] 設定類型",
        defaultValue: "Argument",
        type: "string",
        exclude: ["boxjs"],
        options: [
            { key: "Argument", label: "優先使用外掛選項與模組參數等，由 $argument 傳入的設定；$argument 不包含的設定項由 PersistentStore (BoxJs) 提供" },
            { key: "PersistentStore", label: "只使用來自 BoxJs 等，由 $persistentStore 提供的設定" },
            { key: "database", label: "只使用由作者的 database.mjs 檔案提供的預設設定，其他任何自訂設定不再起作用" },
        ],
        description: "選擇要使用的設定類型。未設定此選項或不透過此選項的舊版本設定順序仍為 $persistentStore (BoxJs) > $argument > database。",
    },
];

export const logLevel: Arg[] = [
    {
        key: "LogLevel",
        name: "[除錯] 日誌等級",
        type: "string",
        defaultValue: "WARN",
        description: "選擇腳本日誌的輸出等級，低於所選等級的日誌將全部輸出。",
        options: [
            { key: "OFF", label: "關閉" },
            { key: "ERROR", label: "❌ 錯誤" },
            { key: "WARN", label: "⚠️ 警告" },
            { key: "INFO", label: "ℹ️ 資訊" },
            { key: "DEBUG", label: "🅱️ 除錯" },
            { key: "ALL", label: "全部" },
        ],
    },
];

export default defineConfig({
    output,
    args: [...dataSetsFull, ...weatherFull, ...weatherAlerts, ...nextHour, ...rainAlert, ...airQuality, ...api, ...storage, ...logLevel],
});
