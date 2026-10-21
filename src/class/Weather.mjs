import { Console } from "@nsnanocat/util";

export default class Weather {
    static Name = "Weather";
    static Version = "0.4.0";
    static Author = "Virgil Clyne & 001";

    /**
     * 將新的氣象陣列合併到原始氣象陣列
     * @param {array} to - 原始氣象陣列
     * @param {array} from - 新的氣象陣列
     * @returns {array} 原始氣象陣列
     */
    static mergeForecast(to = [], from = []) {
        Console.info("☑️ mergeForecast");
        let i = 0,
            j = 0;
        while (i < to.length) {
            const forecastStart = to[i].forecastStart;
            const newForecastStart = j < from.length ? from[j].forecastStart : Number.POSITIVE_INFINITY;

            if (forecastStart === newForecastStart) {
                // 原地把 from[j] 的欄位合入 to[i]，日夜預報採逐欄位疊加。
                // Merge from[j] into to[i] in place, layering the day-part forecasts field by field.
                if (Object.hasOwn(from[j], "daytimeForecast")) from[j].daytimeForecast = { ...to[i].daytimeForecast, ...from[j].daytimeForecast };
                if (Object.hasOwn(from[j], "overnightForecast")) from[j].overnightForecast = { ...to[i].overnightForecast, ...from[j].overnightForecast };
                if (Object.hasOwn(from[j], "restOfDayForecast")) from[j].restOfDayForecast = { ...to[i].restOfDayForecast, ...from[j].restOfDayForecast };
                Object.assign(to[i], from[j]);
                i++;
                j++;
            } else if (newForecastStart < forecastStart) {
                j++; // 讓 from 追上 to
            } else {
                i++; // to 無符合項，保留 to[i]
            }
        }
        Console.info("✅ mergeForecast");
        return to; // 回傳同一個參照
    }
}
