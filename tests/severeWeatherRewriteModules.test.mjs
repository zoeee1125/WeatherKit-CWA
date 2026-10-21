import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modulesDirectory = new URL("../modules/", import.meta.url);
const configurableModules = ["iRingo.WeatherKit.Rewrite.sgmodule", "iRingo.WeatherKit.Rewrite.srmodule", "iRingo.WeatherKit.Rewrite.yaml"];
const fixedModules = ["iRingo.WeatherKit.Rewrite.lpx", "iRingo.WeatherKit.Rewrite.stoverride"];
const coordinatePattern = String.raw`-?[0-9]+(?:\.[0-9]+)?,-?[0-9]+(?:\.[0-9]+)?`;
const weatherAlertsCoordinatePattern = String.raw`^https?:\/\/weatherkit\.apple\.com\/api\/v1\/weatherAlerts\?([^#]*&ids=${coordinatePattern}(?:&[^#]*)?)$`;
const weatherAlertsCoordinateHandlerPattern = String.raw`^https?:\/\/weatherkit\.apple\.com\/api\/v1\/weatherAlerts\?[^#]*&ids=${coordinatePattern}(?:&|$)`;
const weatherAlertsRewriteComment = "# 🌤 WeatherKit.api.v1.weatherAlerts.response";
const unsafeOpenEndedQuantifier = "{6" + ",}";
const completedAlertFeatureDescription = "3.將天氣警特報改為中央氣象署（臺灣）";
const rewriteTemplates = ["loon.rewrite.handlebars", "surge.rewrite.handlebars", "shadowrocket.rewrite.handlebars", "stash.rewrite.handlebars"];
const hhhContributor = "hhh2210[https://github.com/hhh2210]";

test("all Rewrite modules hook coordinate WeatherAlert ids without QWeather page redirects", async () => {
    for (const filename of [...configurableModules, ...fixedModules]) {
        const content = await readFile(new URL(filename, modulesDirectory), "utf8");
        assert.ok(content.includes(weatherAlertsCoordinatePattern), filename);
        assert.ok(content.includes(completedAlertFeatureDescription), filename);
        assert.ok(content.includes(hhhContributor), filename);
        assert.ok(!content.includes(unsafeOpenEndedQuantifier), filename);
        assert.ok(content.includes(weatherAlertsRewriteComment), filename);
        assert.doesNotMatch(content, /alertDetails\.index\.response/, filename);
        assert.doesNotMatch(content, /party=qweather/, filename);
        assert.doesNotMatch(content, /www\.qweather\.com/, filename);
        // QWeather 頁面識別碼已不再支援。
        // QWeather page identifiers are no longer supported.
        assert.doesNotMatch(content, /-[0-9]\{9\}/, filename);
        assert.match(content, /weatherkit\.apple\.com/);
    }

    for (const filename of configurableModules) {
        const content = await readFile(new URL(filename, modulesDirectory), "utf8");
        assert.match(content, /https:\/\/\{\{\{endpoint\}\}\}\/api\/v1\/weatherAlerts\?\$1/);
    }

    for (const filename of fixedModules) {
        const content = await readFile(new URL(filename, modulesDirectory), "utf8");
        assert.match(content, /https:\/\/weatherkit\.pages\.dev\/api\/v1\/weatherAlerts\?\$1/);
    }
});

test("WeatherAlerts hooks only accept coordinate ids after an existing query parameter", () => {
    const coordinateRegex = new RegExp(weatherAlertsCoordinatePattern);
    const coordinateHandlerRegex = new RegExp(weatherAlertsCoordinateHandlerPattern);
    assert.match("https://weatherkit.apple.com/api/v1/weatherAlerts?lang=zh-Hant-TW&ids=25.037,121.566", coordinateRegex);
    assert.match("https://weatherkit.apple.com/api/v1/weatherAlerts?timezone=Asia%2FTaipei&ids=25.037,121.566&country=TW", coordinateRegex);
    assert.match("https://weatherkit.apple.com/api/v1/weatherAlerts?lang=zh-Hant-TW&ids=25.037,121.566", coordinateHandlerRegex);
    assert.match("https://weatherkit.apple.com/api/v1/weatherAlerts?timezone=Asia%2FTaipei&ids=25.037,121.566&country=TW", coordinateHandlerRegex);
    for (const regex of [coordinateRegex, coordinateHandlerRegex]) {
        assert.doesNotMatch("https://weatherkit.apple.com/api/v1/weatherAlerts?ids=25.037,121.566", regex);
        assert.doesNotMatch("https://weatherkit.apple.com/api/v1/weatherAlerts?lang=zh-Hant-TW&ids=25.037%2C121.566", regex);
        assert.doesNotMatch("https://weatherkit.apple.com/api/v1/weatherAlerts?lang=zh-Hant-TW&ids=25.037%2c121.566", regex);
        assert.doesNotMatch("https://weatherkit.apple.com/api/v1/weatherAlerts?lang=zh-Hant-TW&ids=.037,121.566", regex);
        assert.doesNotMatch("https://weatherkit.apple.com/api/v1/weatherAlerts?lang=zh-Hant-TW", regex);
        assert.doesNotMatch("https://weatherkit.apple.com/api/v1/weatherAlerts?lang=zh-Hant-TW&ids=35889ee6-fa82-5f9f-8e49-fad78c4f383a", regex);
    }
});

test("Egern keeps the coordinate API hook without QWeather page redirects", async () => {
    const content = await readFile(new URL("iRingo.WeatherKit.Rewrite.yaml", modulesDirectory), "utf8");
    assert.match(content, /match: \^https\?:\\\/\\\/weatherkit\\\.apple\\\.com\\\/api\\\/v1\\\/weatherAlerts\\\?\([\s\S]*?location: https:\/\/\{\{\{endpoint\}\}\}\/api\/v1\/weatherAlerts\?\$1\nmitm:/);
});

test("script module templates hook Apple weatherAlerts coordinates without QWeather page redirects", async () => {
    const templates = ["surge.handlebars", "loon.handlebars", "quantumultx.handlebars", "stash.handlebars"];
    for (const filename of templates) {
        const content = await readFile(new URL(`../template/${filename}`, import.meta.url), "utf8");
        assert.ok(content.includes(weatherAlertsCoordinateHandlerPattern), filename);
        assert.match(content, /api\\\/v1\\\/weatherAlerts\\\?/);
        assert.ok(!content.includes(unsafeOpenEndedQuantifier), filename);
        assert.doesNotMatch(content, /alertDetails\.index\.response/, filename);
        assert.doesNotMatch(content, /party=qweather/, filename);
        assert.doesNotMatch(content, /www\.qweather\.com/, filename);
        assert.doesNotMatch(content, /-[0-9]\{9\}/, filename);
        assert.match(content, /weatherkit\.apple\.com/);
    }
});

test("Stash weather-alert requests declare the required request type", async () => {
    const requestEntry = /    - match: [^\n]*weatherAlerts[^\n]*\n      name: WeatherKit\.api\.v1\.weatherAlerts\.request\n      type: request\n/g;

    for (const filename of ["stash.handlebars", "stash.dev.handlebars"]) {
        const content = await readFile(new URL(`../template/${filename}`, import.meta.url), "utf8");
        assert.equal(content.match(requestEntry)?.length, 1, filename);
    }
});

test("Rewrite templates stay aligned with fixed Rewrite modules", async () => {
	const fixedTemplates = ["loon.rewrite.handlebars", "stash.rewrite.handlebars"];
	for (const filename of rewriteTemplates) {
        const content = await readFile(new URL(`../template/${filename}`, import.meta.url), "utf8");
        assert.ok(content.includes("(Rewrite)"), filename);
        assert.ok(content.includes(weatherAlertsCoordinatePattern), filename);
        assert.doesNotMatch(content, /-[0-9]\{9\}/, filename);
		assert.doesNotMatch(content, /www\.qweather\.com/);
		assert.doesNotMatch(content, /party=qweather/);
		assert.match(content, /weatherkit\.apple\.com/);
		assert.doesNotMatch(content, /weatherkit\.nanocat\.cloud/);
	}


	const surge = await readFile(new URL("../template/surge.rewrite.handlebars", import.meta.url), "utf8");
	assert.ok(surge.includes("#!arguments = {{{arguments}}}"));
	assert.ok(surge.includes("#!arguments-desc = {{{argumentsDesc}}}"));
	assert.ok(surge.includes("https://\\{{{endpoint}}}/api/v1/weatherAlerts?$1"));

	const shadowrocket = await readFile(new URL("../template/shadowrocket.rewrite.handlebars", import.meta.url), "utf8");
	assert.ok(shadowrocket.includes("#!arguments = endpoint:weatherkit.pages.dev"));
	assert.ok(shadowrocket.includes("#!arguments-desc = endpoint: [重寫] 服務端點\\n"));
	assert.ok(shadowrocket.includes("https://\\{{{endpoint}}}/api/v1/weatherAlerts?$1"));

	for (const filename of fixedTemplates) {
		const content = await readFile(new URL(`../template/${filename}`, import.meta.url), "utf8");
		assert.ok(content.includes("https://weatherkit.pages.dev/api/v1/weatherAlerts?$1"), filename);
		assert.doesNotMatch(content, /\{\{\{endpoint\}\}\}/, filename);
	}

    const loon = await readFile(new URL("../template/loon.rewrite.handlebars", import.meta.url), "utf8");
    assert.match(loon, /^\[Rewrite\]$/m);
    assert.doesNotMatch(loon, /^\[URL Rewrite\]$/m);
});

test("Loon Rewrite modules use the legacy Rewrite section", async () => {
    const loon = await readFile(new URL("../template/loon.rewrite.handlebars", import.meta.url), "utf8");
    const rewrite = await readFile(new URL("iRingo.WeatherKit.Rewrite.lpx", modulesDirectory), "utf8");
    for (const content of [loon, rewrite]) {
        assert.match(content, /^\[Rewrite\]$/m);
        assert.doesNotMatch(content, /^\[URL Rewrite\]$/m);
        assert.doesNotMatch(content, /party=qweather/);
        assert.doesNotMatch(content, /www\.qweather\.com/);
    }
});

test("Rewrite builder outputs use Rewrite names", async () => {
	const content = await readFile(new URL("../arguments-builder.rewrite.config.ts", import.meta.url), "utf8");
	assert.match(content, /iRingo\.WeatherKit\.Rewrite\.(?:sgmodule|lpx|srmodule|stoverride|yaml)/);
	assert.match(content, /key: "endpoint"[\s\S]*defaultValue: "weatherkit\.pages\.dev"/);
	assert.match(content, /weather\.nanocat\.cloud", label: "Worker 版；需要代理"/);
	assert.doesNotMatch(content, /Workers/);
    assert.doesNotMatch(content, /\.workers\.handlebars/);
});

test("Argument builder consumers use purpose-specific configs", async () => {
    const [packageJson, sgmoduleTools] = await Promise.all([readFile(new URL("../package.json", import.meta.url), "utf8"), readFile(new URL("../sgmodule-tools.config.ts", import.meta.url), "utf8")]);

    assert.match(packageJson, /arguments-builder build -c arguments-builder\.release\.config\.ts/);
    assert.match(packageJson, /arguments-builder build -c arguments-builder\.dev\.config\.ts/);
    assert.match(packageJson, /arguments-builder boxjs -c arguments-builder\.full\.config\.ts/);
    assert.match(packageJson, /arguments-builder build --config arguments-builder\.rewrite\.config\.ts/);
    assert.match(packageJson, /arguments-builder dts -c arguments-builder\.full\.config\.ts/);
    assert.match(sgmoduleTools, /from "\.\/arguments-builder\.dev\.config"/);
});

test("Dev builds use dev templates, bundles, and output names", async () => {
    const devTemplates = ["surge.dev.handlebars", "loon.dev.handlebars", "quantumultx.dev.handlebars", "stash.dev.handlebars"];
    const [config, packageJson, rollup, devWorkflow, deployWorkflow, sgmoduleTools, ...templates] = await Promise.all([
        readFile(new URL("../arguments-builder.dev.config.ts", import.meta.url), "utf8"),
        readFile(new URL("../package.json", import.meta.url), "utf8"),
        readFile(new URL("../rollup.dev.config.mjs", import.meta.url), "utf8"),
        readFile(new URL("../.github/workflows/dev.yml", import.meta.url), "utf8"),
        readFile(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8"),
        readFile(new URL("../sgmodule-tools.config.ts", import.meta.url), "utf8"),
        ...devTemplates.map(filename => readFile(new URL(`../template/${filename}`, import.meta.url), "utf8")),
    ]);

    for (const output of ["sgmodule", "plugin", "snippet", "stoverride", "boxjs.json"]) {
        assert.ok(config.includes(`iRingo.WeatherKit.dev.${output}`), output);
    }
    for (const template of devTemplates) {
        assert.ok(config.includes(`./template/${template}`), template);
    }
    assert.doesNotMatch(config, /\boutput\b[^\n]*from "\.\/arguments-builder\.full\.config"/);
    assert.match(packageJson, /"dev": "npm-run-all --parallel build:dev build:dev-args"/);
    assert.match(devWorkflow, /run: npm run dev/);
    assert.match(rollup, /\.\/dist\/request\.dev\.bundle\.js/);
    assert.match(rollup, /\.\/dist\/response\.dev\.bundle\.js/);
    assert.doesNotMatch(rollup, /\.\/dist\/(?:request|response)\.bundle\.js/);
    assert.match(sgmoduleTools, /\.\/dist\/response\.dev\.bundle\.js/);

    for (const output of ["request.dev.bundle.js", "response.dev.bundle.js", "iRingo.WeatherKit.dev.sgmodule", "iRingo.WeatherKit.dev.plugin", "iRingo.WeatherKit.dev.snippet", "iRingo.WeatherKit.dev.stoverride"]) {
        assert.ok(deployWorkflow.includes(`dist/${output}`), output);
    }
    for (const [index, template] of templates.entries()) {
        assert.match(template, / β/, devTemplates[index]);
        assert.match(template, /(?:request|response)\.dev\.bundle\.js/, devTemplates[index]);
        assert.doesNotMatch(template, /\/raw\/(?:request|response)\.bundle\.js/, devTemplates[index]);
        assert.ok(template.includes(weatherAlertsCoordinateHandlerPattern), devTemplates[index]);
        assert.doesNotMatch(template, /-[0-9]\{9\}/, devTemplates[index]);
    }

    const [surge, loon, quantumultX, stash] = templates;
    for (const template of [surge, loon]) {
        assert.match(template, /^\[URL Rewrite\]$/m);
        assert.match(template, /weather-\*\.apple\.com/);
        assert.doesNotMatch(template, /qweather\.com/);
        assert.doesNotMatch(template, /caiyunapp\.com/);
        assert.doesNotMatch(template, /waqi\.info/);
        assert.doesNotMatch(template, /PROTOCOL,QUIC/);
    }
    for (const template of [surge, loon, quantumultX, stash]) {
        assert.doesNotMatch(template, /releases\/download/);
        assert.doesNotMatch(template, /airQualityScale/);
    }
    assert.match(loon, /api\.v1\.weather\.request/);
});

test("Handler generation keeps Loon local and enables Egern", async () => {
    const content = await readFile(new URL("../arguments-builder.full.config.ts", import.meta.url), "utf8");
    assert.match(content, /path: "\.\/dist\/iRingo\.WeatherKit\.lpx"/);
    assert.match(content, /transformEgern: \{/);
    assert.match(content, /path: "\.\/dist\/iRingo\.WeatherKit\.yaml"/);
});

test("CWA-only settings expose the provider, datasets, token, and Traditional Chinese copy", async () => {
    const [full, release, dev, database, types, boxjs] = await Promise.all([
        readFile(new URL("../arguments-builder.full.config.ts", import.meta.url), "utf8"),
        readFile(new URL("../arguments-builder.release.config.ts", import.meta.url), "utf8"),
        readFile(new URL("../arguments-builder.dev.config.ts", import.meta.url), "utf8"),
        readFile(new URL("../src/function/database.mjs", import.meta.url), "utf8"),
        readFile(new URL("../src/types.d.ts", import.meta.url), "utf8"),
        readFile(new URL("../template/boxjs.settings.json", import.meta.url), "utf8"),
    ]);

    // 天氣與天氣警特報只提供 WeatherKit 與中央氣象署。
    // Weather and weather alerts only offer WeatherKit and CWA.
    assert.match(full, /key: "Weather\.Provider"[\s\S]*defaultValue: "CWA"[\s\S]*key: "WeatherKit"[\s\S]*key: "CWA"/);
    assert.match(full, /key: "WeatherAlerts\.Provider"[\s\S]*defaultValue: "CWA"[\s\S]*key: "WeatherKit"[\s\S]*key: "CWA"/);
    assert.doesNotMatch(full, /ColorfulClouds|QWeather|WAQI/);

    assert.match(full, /export const weather = \[weatherProvider\]/);
    assert.match(full, /export const weatherAlerts = \[weatherAlertsProvider\]/);
    assert.match(release, /import \{[^}]*dataSets[^}]*weather[^}]*weatherAlerts[^}]*\} from "\.\/arguments-builder\.full\.config"/);
    assert.match(release, /args: \[\.\.\.dataSets, \.\.\.weather, \.\.\.weatherAlerts, \.\.\.api, \.\.\.storage, \.\.\.logLevel\]/);
    assert.match(dev, /import \{[^}]*dataSetsFull[^}]*weatherFull[^}]*\} from "\.\/arguments-builder\.full\.config"/);
    assert.match(dev, /args: \[\.\.\.dataSetsFull, \.\.\.weatherFull, \.\.\.weatherAlerts, \.\.\.api, \.\.\.storage, \.\.\.logLevel\]/);

    // 發布版資料集只包含中央氣象署實際提供的四項。
    // The release dataset list only contains what CWA actually provides.
    const releaseDataSets = full.slice(full.indexOf("export const dataSets:"), full.indexOf("export const dataSetsFull:"));
    assert.match(releaseDataSets, /name: "\[資料集\]"/);
    assert.match(releaseDataSets, /defaultValue: \["currentWeather", "forecastDaily", "forecastHourly", "weatherAlerts"\]/);
    for (const [key, label] of [
        ["currentWeather", "目前天氣"],
        ["forecastDaily", "每日預報"],
        ["forecastHourly", "逐時預報"],
        ["weatherAlerts", "天氣警特報"],
    ]) {
        assert.match(releaseDataSets, new RegExp(`key: "${key}", label: "${label}"`));
    }
    assert.doesNotMatch(releaseDataSets, /airQuality|forecastNextHour|news|locationInfo|trendComparison|weatherChange/);

    assert.match(database, /Weather: \{ Provider: "CWA" \}/);
    assert.match(database, /WeatherAlerts: \{ Provider: "CWA" \}/);
    assert.match(database, /API: \{ CWA: \{ Token: "" \} \}/);
    assert.match(types, /Provider\?: 'WeatherKit' \| 'CWA'/);
    assert.match(boxjs, /@iRingo\.WeatherKit\.Settings\.WeatherAlerts\.Provider[\s\S]*"val":\s*"CWA"[\s\S]*"key":\s*"WeatherKit"/);

    const boxjsSettings = JSON.parse(boxjs);
    const dataSetsSetting = boxjsSettings.find(({ id }) => id === "@iRingo.WeatherKit.Settings.DataSets");
    const weatherProviderSetting = boxjsSettings.find(({ id }) => id === "@iRingo.WeatherKit.Settings.Weather.Provider");
    assert.equal(dataSetsSetting.desc, "選擇需要解析並處理的資料集；未選擇的資料槽始終保持原樣透傳，不作修改。");
    assert.deepEqual(
        weatherProviderSetting.items.map(({ key }) => key),
        ["WeatherKit", "CWA"],
    );
    assert.equal(boxjsSettings.some(({ id }) => id === "@iRingo.WeatherKit.Settings.Storage"), false);
    assert.equal(
        boxjsSettings.some(({ type, val }) => type === "text" && Array.isArray(val)),
        false,
    );

    // 設定介面不得殘留簡體中文。
    // The settings UI must not keep Simplified Chinese copy.
    assert.doesNotMatch(boxjs, /[数气预调选换围权单浓质码标记]/);
});
