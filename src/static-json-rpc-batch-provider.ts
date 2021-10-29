import {Network} from "@ethersproject/networks";
import {defineReadOnly} from "@ethersproject/properties";
import {providers} from "ethers";

export class StaticJsonRpcBatchProvider extends providers.JsonRpcBatchProvider {
    async detectNetwork(): Promise<Network> {
        let network = this.network;
        if (network == null) {
            network = await super.detectNetwork();

            if (!network) {
                throw Error("no network detected");
            }

            // If still not set, set it
            if (this._network == null) {
                // A static network does not support "any"
                defineReadOnly(this, "_network", network);

                this.emit("network", network, null);
            }
        }
        return network;
    }
}
