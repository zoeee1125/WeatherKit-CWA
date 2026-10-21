import { Console, fetch } from "@nsnanocat/util";

/**
 * 中央氣象署 QPESUMS 雷達定量降水預報。
 * CWA QPESUMS radar quantitative precipitation forecast.
 *
 * 資料來自中央氣象署開放資料平台的格點降水預報：
 * - `F-B0046-001` 未來 1 小時雷達定量降雨預報
 * - `O-B0045-001` 過去 1 小時雷達定量降雨估計
 *
 * 兩者皆為 0.0125 度解析度的格點資料，每 10 分鐘更新一次。
 * 完整檔案有 2.7 MB，但內容是等寬的科學記號字串（每格 10 字元、逗號分隔），
 * 因此可以用 HTTP Range 只取需要的格點，不必下載整份檔案。
 * Both are 0.0125-degree grids refreshed every ten minutes. The full file is 2.7 MB, but the
 * payload is a fixed-width string (ten characters per value, comma separated), so an HTTP Range
 * request can fetch only the cells of interest.
 *
 * 格點原點在左下角 117.975°E / 19.975°N，先向東遞增、再向北遞增。
 * The grid starts at 117.975°E / 19.975°N in the bottom-left corner, increasing eastward first
 * and then northward.
 */
export default class QPESUMS {
    static Name = "QPESUMS";
    static Version = "1.0.0";
    static Author = "iRingo";

    /** 開放資料平台檔案下載端點 / Open data file endpoint. */
    static Endpoint = "https://opendata.cwa.gov.tw/fileapi/v1/opendataapi";

    /** 未來 1 小時定量降雨預報 / Quantitative precipitation forecast for the next hour. */
    static FutureDataset = "F-B0046-001";

    /** 過去 1 小時定量降雨估計 / Quantitative precipitation estimate for the past hour. */
    static PastDataset = "O-B0045-001";

    /** 格點原點經度（最西一格）/ Grid origin longitude. */
    static OriginLongitude = 117.975;

    /** 格點原點緯度（最南一格）/ Grid origin latitude. */
    static OriginLatitude = 19.975;

    /** 格點解析度（度）/ Grid resolution in degrees. */
    static Resolution = 0.0125;

    /** 經向格點數 / Number of grid columns. */
    static DimensionX = 441;

    /** 緯向格點數 / Number of grid rows. */
    static DimensionY = 561;

    /** 每格字元長度 / Character width of one grid value. */
    static ValueWidth = 10;

    /** 每格含分隔號的長度 / Length of one grid value including its separator. */
    static ValueStride = 11;

    /** 讀取檔頭所需的位元組數 / Bytes needed to locate the value block. */
    static HeaderBytes = 2048;

    /** 回應長度超過此值視為完整檔案 / Responses above this length are treated as the whole file. */
    static FullFileLength = 100000;

    /** 無效值 / Sentinel for missing data. */
    static Invalid = -99;

    /** 判定有雨的下限（毫米）/ Lower bound for rain to count (millimetres). */
    static MinimumRain = 0.1;

    /**
     * 建立下載網址。
     * Build the download URL.
     * @param {string} dataset 資料集代號 / Dataset identifier.
     * @param {string} [token] 授權碼 / Authorization token.
     * @returns {string}
     */
    static URL(dataset, token) {
        const url = new URL(`${QPESUMS.Endpoint}/${dataset}`);
        url.searchParams.set("downloadType", "WEB");
        url.searchParams.set("format", "JSON");
        if (token) url.searchParams.set("Authorization", token);
        return url.toString();
    }

    /**
     * 將經緯度換算成格點座標。
     * Convert coordinates into grid coordinates.
     * @param {number} latitude 緯度 / Latitude.
     * @param {number} longitude 經度 / Longitude.
     * @returns {{x: number, y: number} | undefined} 格點座標，超出範圍時為 undefined / Grid coordinates, or undefined when out of range.
     */
    static Coordinate(latitude, longitude) {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
        const x = Math.round((longitude - QPESUMS.OriginLongitude) / QPESUMS.Resolution);
        const y = Math.round((latitude - QPESUMS.OriginLatitude) / QPESUMS.Resolution);
        if (x < 0 || x >= QPESUMS.DimensionX || y < 0 || y >= QPESUMS.DimensionY) return undefined;
        return { x, y };
    }

    /**
     * 將格點座標換算成線性索引。
     * Convert grid coordinates into a linear index.
     * @param {{x: number, y: number}} coordinate 格點座標 / Grid coordinates.
     * @returns {number}
     */
    static Index(coordinate) {
        return coordinate.y * QPESUMS.DimensionX + coordinate.x;
    }

    /**
     * 解析格點數值。
     * Parse a grid value.
     * @param {string} text 原始字串 / Raw text.
     * @returns {number | undefined} 毫米，無效或未知時為 undefined / Millimetres, or undefined when invalid or unknown.
     */
    static ParseValue(text) {
        const trimmed = String(text ?? "").trim();
        if (!trimmed) return undefined;
        const numeric = Number.parseFloat(trimmed);
        if (!Number.isFinite(numeric)) return undefined;
        // -99 代表該格沒有有效資料 / -99 marks a cell without valid data.
        if (numeric <= QPESUMS.Invalid) return undefined;
        return numeric;
    }

    /**
     * 從數值區塊取出連續格點值。
     * Extract consecutive grid values from the value block.
     * @param {string} text 內容片段 / Content fragment.
     * @param {number} offset 起始索引 / Start index.
     * @param {number} count 取幾格 / How many cells to read.
     * @returns {(number | undefined)[]}
     */
    static Extract(text, offset, count) {
        const values = [];
        for (let index = 0; index < count; index++) {
            const start = offset + index * QPESUMS.ValueStride;
            values.push(QPESUMS.ParseValue(text.slice(start, start + QPESUMS.ValueWidth)));
        }
        return values;
    }

    /**
     * 找出數值區塊的起始位置。
     * Locate where the grid value block begins.
     * @param {string} header 檔頭內容 / Header content.
     * @returns {{char: number, byte: number} | undefined} 字元與位元組偏移 / Character and byte offsets.
     */
    static Locate(header) {
        const marker = '"content": "';
        const index = header.indexOf(marker);
        if (index < 0) return undefined;
        const char = index + marker.length;
        // 檔頭含多位元組中文，位元組偏移與字元偏移不同，需分別換算。
        // The header contains multi-byte characters, so byte and character offsets differ.
        const byte = new TextEncoder().encode(header.slice(0, char)).length;
        return { char, byte };
    }

    /**
     * 解析資料時間。
     * Parse the issue time.
     * @param {string} header 檔頭內容 / Header content.
     * @returns {string | undefined}
     */
    static ParseTime(header) {
        const match = header.match(/"DateTime":\s*"([^"]+)"/);
        return match?.[1];
    }

    /**
     * 取得檔案實際位址。
     * Resolve the actual file location.
     *
     * `fileapi` 會先回 302 再導向 Amazon S3；直接對轉址後的位址發 Range 請求最可靠。
     * `fileapi` answers with a 302 that points at Amazon S3; sending the Range request to the
     * redirect target is the most reliable option.
     *
     * @param {string} url 原始網址 / Original URL.
     * @returns {Promise<string>}
     */
    static async Resolve(url) {
        try {
            const response = await fetch(url, { "auto-redirect": false, redirection: false, timeout: 20 });
            const status = Number(response?.status ?? 0);
            if (status >= 300 && status < 400) {
                const location = response?.headers?.location ?? response?.headers?.Location;
                if (location) return location;
            }
            if (status === 200) return url;
            Console.warn("QPESUMS.Resolve", `HTTP ${status}`);
        } catch (error) {
            Console.warn("QPESUMS.Resolve", error?.message ?? String(error));
        }
        return url;
    }

    /**
     * 以 Range 請求抓取指定位元組區間。
     * Fetch a byte range with an HTTP Range request.
     * @param {string} url 網址 / URL.
     * @param {number} start 起始位元組 / Start byte.
     * @param {number} end 結尾位元組 / End byte.
     * @returns {Promise<string>}
     */
    static async #FetchRange(url, start, end) {
        const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, timeout: 20 });
        if (!response?.ok) {
            Console.warn("QPESUMS.FetchRange", `HTTP ${response?.status ?? "?"}`);
            return "";
        }
        return String(response.body ?? "");
    }

    /**
     * 取得指定位置的格點雨量。
     * Fetch the grid value at the given location.
     *
     * 取周圍 3×3 的最大值，避免位置剛好落在雨區邊緣而漏報。
     * The maximum of the surrounding 3×3 cells is used so a location on the edge of a rain area
     * is not missed.
     *
     * @param {number} latitude 緯度 / Latitude.
     * @param {number} longitude 經度 / Longitude.
     * @param {string} dataset 資料集代號 / Dataset identifier.
     * @param {string} [token] 授權碼 / Authorization token.
     * @returns {Promise<{value: number | undefined, time: string | undefined, available: boolean}>}
     */
    static async Area(latitude, longitude, dataset, token) {
        const coordinate = QPESUMS.Coordinate(latitude, longitude);
        if (!coordinate) {
            Console.warn("QPESUMS.Area", `座標超出格點範圍 / Coordinates outside the grid: ${latitude}, ${longitude}`);
            return { value: undefined, time: undefined, available: false };
        }
        try {
            const url = await QPESUMS.Resolve(QPESUMS.URL(dataset, token));
            const header = await QPESUMS.#FetchRange(url, 0, QPESUMS.HeaderBytes - 1);
            const located = QPESUMS.Locate(header);
            if (!located) {
                Console.warn("QPESUMS.Area", "無法定位格點數值區塊 / Cannot locate the grid value block");
                return { value: undefined, time: undefined, available: false };
            }
            const time = QPESUMS.ParseTime(header);
            // 伺服器若忽略 Range 而回傳完整檔案，就直接從完整內容取值。
            // If the server ignores Range and returns the whole file, read from the full content.
            if (header.length > QPESUMS.FullFileLength) {
                const value = QPESUMS.#Neighbourhood(header, located.char, coordinate);
                Console.info("✅ QPESUMS.Area", dataset, `value: ${value ?? "n/a"}`, `time: ${time ?? "n/a"}`);
                return { value, time, available: true };
            }
            // 三列連續格點一次抓完，避免多次往返。
            // Fetch the three rows in a single request to avoid extra round trips.
            const firstRow = Math.max(0, coordinate.y - 1);
            const lastRow = Math.min(QPESUMS.DimensionY - 1, coordinate.y + 1);
            const firstColumn = Math.max(0, coordinate.x - 1);
            const lastColumn = Math.min(QPESUMS.DimensionX - 1, coordinate.x + 1);
            const start = located.byte + QPESUMS.Index({ x: firstColumn, y: firstRow }) * QPESUMS.ValueStride;
            const end = located.byte + QPESUMS.Index({ x: lastColumn, y: lastRow }) * QPESUMS.ValueStride + QPESUMS.ValueWidth - 1;
            const block = await QPESUMS.#FetchRange(url, start, end);
            const value = QPESUMS.#Maximum(block, firstRow, lastRow, firstColumn, lastColumn);
            Console.info("✅ QPESUMS.Area", dataset, `value: ${value ?? "n/a"}`, `time: ${time ?? "n/a"}`);
            return { value, time, available: true };
        } catch (error) {
            Console.error("QPESUMS.Area", error?.message ?? String(error));
            return { value: undefined, time: undefined, available: false };
        }
    }

    /**
     * 從區塊內容取出周圍 3×3 的最大雨量。
     * Read the maximum of the surrounding 3×3 cells from a content block.
     * @param {string} block 區塊內容 / Content block.
     * @param {number} base 區塊在檔案中的位元組起點 / Byte offset of the block within the file.
     * @param {number} firstRow 起始列 / First row.
     * @param {number} lastRow 結尾列 / Last row.
     * @param {number} firstColumn 起始欄 / First column.
     * @param {number} lastColumn 結尾欄 / Last column.
     * @param {{x: number, y: number}} coordinate 目標格點 / Target cell.
     * @returns {number | undefined}
     */
    static #Maximum(block, firstRow, lastRow, firstColumn, lastColumn) {
        // 區塊從 (firstColumn, firstRow) 開始，逐格換算成區塊內的相對位移。
        // The block starts at (firstColumn, firstRow); each cell maps to a relative offset.
        const origin = QPESUMS.Index({ x: firstColumn, y: firstRow });
        let value;
        for (let y = firstRow; y <= lastRow; y++) {
            for (let x = firstColumn; x <= lastColumn; x++) {
                const offset = (QPESUMS.Index({ x, y }) - origin) * QPESUMS.ValueStride;
                const cell = QPESUMS.ParseValue(block.slice(offset, offset + QPESUMS.ValueWidth));
                if (cell !== undefined && (value === undefined || cell > value)) value = cell;
            }
        }
        return value;
    }

    /**
     * 從完整內容取出周圍 3×3 的最大雨量。
     * Read the maximum of the surrounding 3×3 cells from full content.
     * @param {string} content 完整內容 / Full content.
     * @param {number} offset 數值區塊起始字元索引 / Start character index of the value block.
     * @param {{x: number, y: number}} coordinate 目標格點 / Target cell.
     * @returns {number | undefined}
     */
    static #Neighbourhood(content, offset, coordinate) {
        let value;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const x = coordinate.x + dx;
                const y = coordinate.y + dy;
                if (x < 0 || x >= QPESUMS.DimensionX || y < 0 || y >= QPESUMS.DimensionY) continue;
                const start = offset + QPESUMS.Index({ x, y }) * QPESUMS.ValueStride;
                const cell = QPESUMS.ParseValue(content.slice(start, start + QPESUMS.ValueWidth));
                if (cell !== undefined && (value === undefined || cell > value)) value = cell;
            }
        }
        return value;
    }
}
