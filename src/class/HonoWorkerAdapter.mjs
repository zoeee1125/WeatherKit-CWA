/**
 * Hono 路由上下文類型。
 * Hono route context type.
 * @typedef {import("hono").Context} HonoContext
 */

/**
 * Hono 請求類型。
 * Hono request type.
 * @typedef {HonoContext["req"]} HonoRequest
 */

/**
 * Worker 統一頭部字典。
 * Worker normalized header dictionary.
 * @typedef {Record<string, string | string[] | undefined>} WorkerHeaders
 */

/**
 * Worker 內部統一請求物件。
 * Worker normalized internal request payload.
 * @typedef {{
 * 	method: string,
 * 	url: string,
 * 	headers: WorkerHeaders,
 * 	body?: ArrayBuffer,
 * 	bodyBytes?: ArrayBuffer,
 * }} WorkerRequest
 */

/**
 * Worker 內部統一響應物件。
 * Worker normalized internal response payload.
 * @typedef {{
 * 	status?: number,
 * 	statusCode?: number,
 * 	headers?: WorkerHeaders,
 * 	body?: string | ArrayBuffer | Uint8Array | null,
 * 	bodyBytes?: ArrayBuffer | Uint8Array | null,
 * }} WorkerResponse
 */

/**
 * Hono Worker 執行時介面卡。
 * Hono worker runtime adapter.
 */
export default class HonoWorkerAdapter {
    /**
     * 根據 worker 入口域名與回退路徑重寫目標路由 URL。
     * Rewrite upstream target URL based on the worker host and fallback path.
     * @param {URL} url 當前請求 URL / Current request URL.
     * @param {string} restPath 回退路由路徑 / Fallback route path.
     * @returns {URL} 重寫後的 URL / Routed URL.
     */
    static routeRewrite(url, restPath = "") {
        switch (true) {
            case url.hostname.startsWith("weatherkit."):
            case url.hostname.startsWith("dev.weatherkit."): {
                url.hostname = "weatherkit.apple.com";
                switch (true) {
                    case url.pathname.startsWith("/weatherkit.apple.com/"):
                        url.pathname = url.pathname.replace("/weatherkit.apple.com", "");
                        break;
                }
                break;
            }
            default:
            case url.hostname.endsWith(".pages.dev"):
            case url.hostname.endsWith(".workers.dev"): {
                const [host, ...path] = `${restPath}`.split("/");
                if (!host) break;
                url.protocol = "https:";
                url.hostname = host;
                url.port = "443";
                url.pathname = `/${path.join("/")}`;
                break;
            }
        }
        return url;
    }

    /**
     * 清理並標準化轉發請求頭。
     * Normalize headers before forwarding upstream.
     * @param {WorkerHeaders} headers 原始請求頭 / Raw request headers.
     * @returns {WorkerHeaders} 標準化後的請求頭 / Normalized request headers.
     */
    static normalizeRequestHeaders(headers = {}) {
        const requestHeaderBlacklist = new Set(["connection", "content-length", "host", "x-forwarded-proto", "x-real-ip"]);
        return Object.entries(headers).reduce((normalizedHeaders, [key, value]) => {
            if (value === undefined) return normalizedHeaders;
            const normalizedKey = key.toLowerCase();
            if (normalizedKey.startsWith("cf-") || requestHeaderBlacklist.has(normalizedKey)) return normalizedHeaders;
            normalizedHeaders[key] = value;
            return normalizedHeaders;
        }, {});
    }

    /**
     * 從 Hono request 構造內部統一請求物件。
     * Build the normalized internal request payload from Hono request.
     * @param {HonoRequest} req Hono 請求 / Hono request.
     * @returns {Promise<WorkerRequest>} 標準化請求物件 / Normalized request object.
     */
    static async buildRequest(req) {
        const url = HonoWorkerAdapter.routeRewrite(new URL(req.url), req.param("rest"));
        console.log(url.toString());
        const method = req.method;
        let bodyBytes;
        switch (method) {
            case "GET":
            case "HEAD":
            case "OPTIONS":
                break;
            default:
                bodyBytes = await req.arrayBuffer().catch(error => {
                    console.info(error);
                    return undefined;
                });
                if (!bodyBytes?.byteLength) bodyBytes = undefined;
                break;
        }
        return {
            method,
            url: url.toString(),
            headers: HonoWorkerAdapter.normalizeRequestHeaders(req.header()),
            body: bodyBytes,
            bodyBytes,
        };
    }

    /**
     * 清理回包頭，避免與 Cloudflare Workers 回寫行為衝突。
     * Clean response headers to avoid conflicts with Cloudflare Workers.
     * @param {WorkerHeaders} headers 原始響應頭 / Raw response headers.
     * @returns {WorkerHeaders} 清理後的響應頭 / Cleaned response headers.
     */
    static cleanupResponseHeaders(headers = {}) {
        const normalizedHeaders = { ...headers };
        if (normalizedHeaders["Content-Encoding"]) normalizedHeaders["Content-Encoding"] = "identity";
        if (normalizedHeaders["content-encoding"]) normalizedHeaders["content-encoding"] = "identity";
        delete normalizedHeaders["Content-Length"];
        delete normalizedHeaders["content-length"];
        delete normalizedHeaders["Transfer-Encoding"];
        delete normalizedHeaders["transfer-encoding"];
        return normalizedHeaders;
    }

    /**
     * 將內部統一響應物件寫回 Hono response。
     * Write the normalized internal response payload back to Hono.
     * @param {HonoContext} c Hono 上下文 / Hono context.
     * @param {WorkerResponse} $response 內部響應物件 / Internal response object.
     * @returns {Response} Hono 響應 / Hono response.
     */
    static writeResponse(c, $response = {}) {
        const headers = HonoWorkerAdapter.cleanupResponseHeaders($response.headers ?? {});
        for (const [key, value] of Object.entries(headers)) {
            if (Array.isArray(value)) {
                for (const entry of value) c.header(key, entry.toString(), { append: true });
                continue;
            }
            if (value !== undefined) c.header(key, value.toString());
        }
        c.status($response.status ?? $response.statusCode ?? 200);
        return c.body($response.body ?? $response.bodyBytes ?? null);
    }

    /**
     * 從 WorkerRequest 提取參數。
     * Extract arguments from WorkerRequest.
     * @param {WorkerRequest} $request 標準化請求物件 / Normalized request object.
     * @returns {WorkerRequest} 標準化請求物件 / Normalized request object.
     */
    static buildArgument($request = {}) {
        if ($request.headers.$argument) {
            globalThis.$argument = $request.headers.$argument;
            delete $request.headers.$argument;
        } else {
            const url = new URL($request.url);
            globalThis.$argument = url.search.slice(1);
            [...url.searchParams.keys()].filter(k => /^[A-Z]/.test(k)).forEach(k => url.searchParams.delete(k));
            $request.url = url.toString();
        }
        return $request;
    }
}
