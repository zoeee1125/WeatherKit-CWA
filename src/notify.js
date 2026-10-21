import { Console, done } from "@nsnanocat/util";
import { Notify } from "./process/Notify.mjs";
/***************** Processing *****************/
!(async () => {
    await Notify();
})()
    .catch(e => Console.error(e))
    .finally(() => {
        done();
    });
