import { Console, Storage, notification } from "@nsnanocat/util";
import CWA from "../class/CWA.mjs";
import ForecastNextHour from "../class/ForecastNextHour.mjs";
import database from "../function/database.mjs";
import setENV from "../function/setENV.mjs";

/**
 * 未來一小時降雨通知。
 * Next-hour rainfall notification.
 *
 * 這個腳本由代理程式的排程功能定時觸發（Surge `type=cron`、Loon `cron`、Stash `cron:`），
 * 查詢中央氣象署 QPESUMS 的未來一小時定量降雨預報，若「現在沒下雨、未來一小時會下雨」
 * 就發送本機通知。
 * This script runs on a schedule (Surge `type=cron`, Loon `cron`, Stash `cron:`) and checks CWA
 * QPESUMS for the next-hour rainfall forecast. When it is not raining now but rain is expected
 * within the hour, a local notification is posted.
 *
 * 座標來自天氣 App 最近一次的請求；沒有紀錄時不會發送任何通知。
 * The coordinates come from the Weather app's most recent request; without a record no
 * notification is sent.
 */
export async function Notify() {
    Console.info("☑️ Notify");
    try {
        const { Settings, Caches } = setENV("iRingo", "WeatherKit", database);
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
