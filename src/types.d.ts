export interface Settings {
    /**
     * [資料集]
     *
     * 選擇需要解析並處理的資料集；未選擇的資料槽始終保持原樣透傳，不作修改。
     *
     * @remarks
     *
     * Possible values:
     * - `'currentWeather'` - 目前天氣
     * - `'forecastDaily'` - 每日預報
     * - `'forecastHourly'` - 逐時預報
     * - `'news'` - 新聞
     * - `'weatherAlerts'` - 天氣警特報
     * - `'weatherChange'` - 天氣變化
     * - `'trendComparison'` - 歷史對比
     * - `'locationInfo'` - 位置資訊
     *
     * @defaultValue ["currentWeather","forecastDaily","forecastHourly","news","weatherAlerts","weatherChange","trendComparison","locationInfo"]
     */
    DataSets?: ('currentWeather' | 'forecastDaily' | 'forecastHourly' | 'news' | 'weatherAlerts' | 'weatherChange' | 'trendComparison' | 'locationInfo')[];
    Weather?: {
    /**
         * [天氣] 資料源
         *
         * 使用選定的資料源替換天氣資料。中央氣象署只提供臺灣地區資料，且需要填寫開放資料平台授權碼。
         *
         * @remarks
         *
         * Possible values:
         * - `'WeatherKit'` - WeatherKit（不替換）
         * - `'CWA'` - 中央氣象署（臺灣）
         *
         * @defaultValue "CWA"
         */
        Provider?: 'WeatherKit' | 'CWA';
};
    WeatherAlerts?: {
    /**
         * [天氣警特報] 資料源
         *
         * 使用選定的資料源處理天氣警特報資料。中央氣象署使用開放資料平台的警特報與颱風警報資料集。
         *
         * @remarks
         *
         * Possible values:
         * - `'WeatherKit'` - WeatherKit（不修改）
         * - `'CWA'` - 中央氣象署（臺灣）
         *
         * @defaultValue "CWA"
         */
        Provider?: 'WeatherKit' | 'CWA';
};
    API?: {
    CWA?: {
            /**
         * [API] 中央氣象署授權碼
         *
         * 中央氣象署開放資料平台會員授權碼，於 https://opendata.cwa.gov.tw/ 取得。使用中央氣象署資料源時必須填寫。
         *
         * @defaultValue ""
         */
        Token?: string;
};
};
    /**
     * [儲存] 設定類型
     *
     * 選擇要使用的設定類型。未設定此選項或不透過此選項的舊版本設定順序仍為 $persistentStore (BoxJs) > $argument > database。
     *
     * @remarks
     *
     * Possible values:
     * - `'Argument'` - 優先使用外掛選項與模組參數等，由 $argument 傳入的設定；$argument 不包含的設定項由 PersistentStore (BoxJs) 提供
     * - `'PersistentStore'` - 只使用來自 BoxJs 等，由 $persistentStore 提供的設定
     * - `'database'` - 只使用由作者的 database.mjs 檔案提供的預設設定，其他任何自訂設定不再起作用
     *
     * @defaultValue "Argument"
     */
    Storage?: 'Argument' | 'PersistentStore' | 'database';
    /**
     * [除錯] 日誌等級
     *
     * 選擇腳本日誌的輸出等級，低於所選等級的日誌將全部輸出。
     *
     * @remarks
     *
     * Possible values:
     * - `'OFF'` - 關閉
     * - `'ERROR'` - ❌ 錯誤
     * - `'WARN'` - ⚠️ 警告
     * - `'INFO'` - ℹ️ 資訊
     * - `'DEBUG'` - 🅱️ 除錯
     * - `'ALL'` - 全部
     *
     * @defaultValue "WARN"
     */
    LogLevel?: 'OFF' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'ALL';
}
