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
    NextHour?: {
    /**
         * [未來一小時降水] 資料源
         *
         * 使用選定的資料源補上未來一小時降水預報。Apple 只對部分地區提供這份資料，中央氣象署則以 QPESUMS 雷達定量降雨預報格點資料提供臺灣資料。
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
    RainAlert?: {
    /**
         * [降雨通知] 通知方式
         *
         * 選擇「未來一小時降雨」通知的來源。天氣 App 的原生通知由未來一小時降水資料驅動，需要城市在關注列表中並開啟「未來一小時降水強度」通知；排程通知由代理程式定時執行腳本，不需要天氣 App 在背景更新。Auto 在天氣 App 剛更新過資料時不補送，避免同一場雨跳出兩則通知。
         *
         * @remarks
         *
         * Possible values:
         * - `'Auto'` - 天氣 App 原生優先，排程補送
         * - `'Weather'` - 只用天氣 App 原生通知
         * - `'Cron'` - 只用排程通知
         *
         * @defaultValue "Auto"
         */
        Mode?: 'Auto' | 'Weather' | 'Cron';
};
    AirQuality?: {
    /**
         * [空氣品質] 資料源
         *
         * 使用選定的資料源替換空氣品質資料。環境部只提供臺灣測站資料，且需要填寫開放資料平台 API key。
         *
         * @remarks
         *
         * Possible values:
         * - `'WeatherKit'` - WeatherKit（不替換）
         * - `'Environment'` - 環境部（臺灣）
         *
         * @defaultValue "Environment"
         */
        Provider?: 'WeatherKit' | 'Environment';
    /**
         * [空氣品質] 國家代碼覆寫
         *
         * 改寫送給 Apple 的國家代碼。空氣品質資料槽由 country 參數決定，而台灣不在 Apple 的支援名單內，因此不會回傳空氣品質；覆寫成支援地區可嘗試借用該地區的空氣品質路徑。
         *
         * @remarks
         *
         * Possible values:
         * - `''` - 不覆寫（保持台灣）
         * - `'CN'` - 中國大陸（CN）
         * - `'JP'` - 日本（JP）
         * - `'US'` - 美國（US）
         * - `'HK'` - 香港（HK）
         *
         * @defaultValue ""
         */
        CountryOverride?: '' | 'CN' | 'JP' | 'US' | 'HK';
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
    Environment?: {
        /**
         * [API] 環境部 API key
         *
         * 環境部環境資料開放平臺會員 API key，於 https://data.moenv.gov.tw/api_term 註冊後取得。使用環境部空氣品質資料源時必須填寫。
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
