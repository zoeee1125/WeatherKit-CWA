import { $app, Console, done, Lodash as _ } from "@nsnanocat/util";
import { Request } from "./process/Request.dev.mjs";
/***************** Processing *****************/
let $response;
!(async () => {
    ({ $request, $response } = await Request($request));
})()
    .catch(e => Console.error(e))
    .finally(() => {
        switch (typeof $response) {
            case "object": // 有構造回覆資料，返回構造的回覆資料
                //Console.debug("finally", `echo $response: ${JSON.stringify($response, null, 2)}`);
                if ($response.headers?.["Content-Encoding"]) $response.headers["Content-Encoding"] = "identity";
                if ($response.headers?.["content-encoding"]) $response.headers["content-encoding"] = "identity";
                switch ($app) {
                    default:
                        done({ response: $response });
                        break;
                    case "Quantumult X":
                        if (!$response.status) $response.status = "HTTP/1.1 200 OK";
                        delete $response.headers?.["Content-Length"];
                        delete $response.headers?.["content-length"];
                        delete $response.headers?.["Transfer-Encoding"];
                        done($response);
                        break;
                }
                break;
            case "undefined": // 無構造回覆資料，傳送修改的請求資料
                //Console.debug("finally", `$request: ${JSON.stringify($request, null, 2)}`);
                done($request);
                break;
            default:
                Console.error(`不合法的 $response 類型: ${typeof $response}`);
                break;
        }
    });
