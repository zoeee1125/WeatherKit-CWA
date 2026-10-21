import getStorage from "@nsnanocat/util/getStorage.mjs";
import { Console, Lodash as _ } from "@nsnanocat/util";

/**
 * Set Environment Variables
 * @author VirgilClyne
 * @param {String} name - Persistent Store Key
 * @param {Array} platforms - Platform Names
 * @param {Object} database - Default DataBase
 * @return {Object} { Settings, Caches, Configs }
 */
export default function setENV(name, platforms, database) {
    Console.info("☑️ Set Environment Variables");
    // getStorage 會把 $argument 合併進 database 的設定物件，而參照共用會讓使用者設定
    // 寫回資料庫預設值；整份深拷貝一份，避免污染預設值。
    // getStorage merges $argument into the database settings by reference, which writes user
    // values back into the defaults; deep-clone the whole database so it stays pristine.
    const isolatedDatabase = JSON.parse(JSON.stringify(database ?? {}));
    const { Settings, Caches, Configs } = getStorage(name, platforms, isolatedDatabase);
    /***************** Settings *****************/
    Console.info(`typeof Settings: ${typeof Settings}`, `Settings: ${JSON.stringify(Settings, null, 2)}`);
    string2array("DataSets");
    string2array("Weather.Replace");
    string2array("AirQuality.Current.Index.Replace");
    string2array("AirQuality.Current.Pollutants.Units.Replace");
    /***************** Caches *****************/
    //Console.debug(`typeof Caches: ${typeof Caches}`, `Caches: ${JSON.stringify(Caches)}`);
    /***************** Configs *****************/
    //Configs.Storefront = new Map(Configs.Storefront);
    if (Configs.Locale) Configs.Locale = new Map(Configs.Locale);
    if (Configs.i18n) for (const type in Configs.i18n) Configs.i18n[type] = new Map(Configs.i18n[type]);
    Console.info("✅ Set Environment Variables");
    return { Settings, Caches, Configs };

    function string2array(path) {
        const setting = _.get(Settings, path);
        if (!Array.isArray(setting)) _.set(Settings, path, setting ? [setting] : []);
    }
}
