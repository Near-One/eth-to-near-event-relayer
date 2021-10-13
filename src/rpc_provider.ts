import * as ethers from 'ethers';
import { Network } from "@ethersproject/networks";

export class StaticJsonRpcProvider extends ethers.providers.JsonRpcProvider {
    async getNetwork(): Promise<Network> {
        if (this._network) {
            return Promise.resolve(this._network);
        }
        return super.getNetwork();
    }
}
