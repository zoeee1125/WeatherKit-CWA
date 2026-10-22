import { defineConfig } from "@iringo/arguments-builder";
import { airQuality, api, dataSetsFull, logLevel, nextHour, rainAlert, storage, weatherFull, weatherAlerts } from "./arguments-builder.full.config";

export default defineConfig({
    output: {
        surge: {
            path: "./dist/iRingo.WeatherKit.dev.sgmodule",
            template: "./template/surge.dev.handlebars",
        },
        loon: {
            path: "./dist/iRingo.WeatherKit.dev.plugin",
            template: "./template/loon.dev.handlebars",
        },
        customItems: [
            {
                path: "./dist/iRingo.WeatherKit.dev.snippet",
                template: "./template/quantumultx.dev.handlebars",
            },
            {
                path: "./dist/iRingo.WeatherKit.dev.stoverride",
                template: "./template/stash.dev.handlebars",
            },
        ],
        boxjsSettings: {
            path: "./dist/iRingo.WeatherKit.dev.boxjs.json",
            scope: "@iRingo.WeatherKit.Settings",
        },
    },
    args: [...dataSetsFull, ...weatherFull, ...weatherAlerts, ...nextHour, ...rainAlert, ...airQuality, ...api, ...storage, ...logLevel],
});
