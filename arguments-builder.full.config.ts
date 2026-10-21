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
        defaultValue: ["currentWeather", "forecastDaily", "forecastHourly", "weatherAlerts"],
        type: "array",
        description: "選擇需要解析並處理的資料集；未選擇的資料槽始終保持原樣透傳，不作修改。",
        options: [
            { key: "currentWeather", label: "目前天氣" },
            { key: "forecastDaily", label: "每日預報" },
            { key: "forecastHourly", label: "逐時預報" },
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

export const api: Arg[] = [
    {
        key: "API.CWA.Token",
        name: "[API] 中央氣象署授權碼",
        defaultValue: "",
        type: "string",
        placeholder: "CWA-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
        description: "中央氣象署開放資料平台會員授權碼，於 https://opendata.cwa.gov.tw/ 取得。使用中央氣象署資料源時必須填寫。",
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
    args: [...dataSetsFull, ...weatherFull, ...weatherAlerts, ...api, ...storage, ...logLevel],
});
