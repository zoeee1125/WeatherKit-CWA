import { defineConfig } from "@iringo/arguments-builder";
import { airQuality, api, dataSets, logLevel, nextHour, output, storage, weather, weatherAlerts } from "./arguments-builder.full.config";

export default defineConfig({
    output: output,
    args: [...dataSets, ...weather, ...weatherAlerts, ...nextHour, ...airQuality, ...api, ...storage, ...logLevel],
});
