import { Console, notification, Storage } from "@nsnanocat/util";
import CWA from "../class/CWA.mjs";
import ForecastNextHour from "../class/ForecastNextHour.mjs";
import database from "../function/database.mjs";
import setENV from "../function/setENV.mjs";

/**
 * 天氣 App 的資料被視為「剛更新過」的時間窗（毫秒）。
 * How long a Weather app refresh still counts as fresh, in milliseconds.
 *
 * 原生降雨通知由天氣 App 在背景更新資料後自行排定。若 App 剛更新過，通知已經有機會送出，
 * 排程腳本就不必再補一次，避免同一場雨跳出兩則內容不同的通知。
 * The native rainfall notification is scheduled by the Weather app itself after a background
 * refresh. When the app has just refreshed, the notification has had its chance, so the
 * scheduled script stays quiet instead of posting a second, differently worded alert.
 */
const NativeWindow = 15 * 60 * 1000;

/**
 * 未來一小時降雨通知（備援）。
 * Next-hour rainfall notification (fallback).
 *
 * 天氣 App 的原生降雨通知由 `forecastNextHour` 資料驅動，不需要這個腳本；但原生通知要求
 * 城市在關注列表中、開啟「未來一小時降水強度」通知，而且只能在天氣 App 於背景更新資料時
 * 排定。這個腳本由代理程式的排程功能定時觸發（Surge `type=cron`、Loon `cron`、
 * Stash `cron:`），直接查詢中央氣象署 QPESUMS 的未來一小時定量降雨預報，
 * 在原生通知沒有機會送出的情況下補上一則本機通知。
 * The Weather app's native rainfall notification is driven by the `forecastNextHour` data and
 * needs no script. It does however require the city to be in the list with the next-hour
 * precipitation notification enabled, and it can only be scheduled when the app refreshes in the
 * background. This script runs on a schedule (Surge `type=cron`, Loon `cron`, Stash `cron:`),
 * queries CWA QPESUMS directly, and posts a local notification when the native path had no
 * chance to deliver one.
 *
 * 座標來自天氣 App 最近一次的請求；沒有紀錄時不會發送任何通知。
 * The coordinates come from the Weather app's most recent request; without a record no
 * notification is sent.
 */
export async function Notify() {
    Console.info("☑️ Notify");
    try {
        const { Settings, Caches } = setENV("iRingo", "WeatherKit", database);
        // 通知方式：Auto（原生優先、排程補送）、Weather（只靠原生）、Cron（只用排程）。
        // Notification mode: Auto (native first, scheduled fallback), Weather (native only),
        // Cron (scheduled only).
        const mode = String(Settings?.RainAlert?.Mode ?? "Auto");
        Console.info("Notify", `mode: ${mode}`);
        if (mode === "Weather") {
            Console.info("✅ Notify", "只使用天氣 App 原生通知，排程不補送 / Native notifications only");
            return;
        }
        const location = Caches?.location;
        const latitude = Number(location?.latitude);
        const longitude = Number(location?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            Console.warn("Notify", "尚未取得座標，跳過通知 / No coordinates yet, skipping");
            Console.info("✅ Notify");
            return;
        }
        // 座標超過十二小時就當作過期，避免拿舊位置發送通知。
        // Coordinates older than twelve hours are treated as stale.
        const updatedAt = Number(location?.updatedAt) || 0;
        if (updatedAt && Date.now() - updatedAt > 12 * 60 * 60 * 1000) {
            Console.warn("Notify", "座標資料已過期 (超過 12 小時) / Stale coordinates (over 12 hours)");
            Console.info("✅ Notify");
            return;
        }
        // Auto：天氣 App 剛更新過資料時，原生通知已經有機會送出，不再重複補送。
        // Auto: when the Weather app has just refreshed, the native notification has had its
        // chance, so no second notification is posted.
        if (mode === "Auto" && updatedAt && Date.now() - updatedAt < NativeWindow) {
            const minutes = Math.round((Date.now() - updatedAt) / 60000);
            Console.info("✅ Notify", `天氣 App ${minutes} 分鐘前剛更新，交給原生通知 / Refreshed ${minutes} min ago, deferring to native`);
            return;
        }
        const provider = new ForecastNextHour({ latitude, longitude, language: "zh-Hant-TW" }, Settings?.API?.CWA?.Token);
        const { alert, reason, future, past } = await provider.Alert();
        Console.info("Notify", `alert: ${alert}`, `reason: ${reason}`, `future: ${future ?? "n/a"}`, `past: ${past ?? "n/a"}`);
        if (!alert) {
            Console.info("✅ Notify", "無需通知 / Nothing to report");
            return;
        }
        // 同一場雨只提醒一次，等雨停了（或過了冷卻時間）才會再提醒。
        // Notify once per rain event; the cooldown prevents repeated alerts.
        const lastNotified = Number(Storage.getItem("@iRingo.WeatherKit.RainAlert", 0)) || 0;
        if (lastNotified && Date.now() - lastNotified < ForecastNextHour.AlertCooldown * 1000) {
            Console.info("✅ Notify", "冷卻時間內，略過 / Skipped during cooldown");
            return;
        }
        const millimetres = Math.round(future * 10) / 10;
        const previous = Math.round((past ?? 0) * 10) / 10;
        const { title, body } = ForecastNextHour.Message(reason, millimetres, previous);
        const cwa = new CWA({ latitude, longitude, language: "zh-Hant-TW" });
        const placeName = cwa?.location ? `${cwa.location.county}${cwa.location.township}` : (location?.name ?? "");
        notification(title, placeName, body, { sound: true });
        Storage.setItem("@iRingo.WeatherKit.RainAlert", String(Date.now()));
        Console.info("✅ Notify", `已通知 / Notified: ${reason}`, `${millimetres} mm`, `place: ${placeName}`);
    } catch (error) {
        Console.error("Notify", error?.stack ?? error?.message ?? String(error));
    }
}
