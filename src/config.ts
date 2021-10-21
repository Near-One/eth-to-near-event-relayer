import fs from 'fs';
import goerli_config from './json/goerli-relayer-config.json';
import mainnet_config from './json/mainnet-relayer-config.json';
import ropsten_config from './json/ropsten-relayer.config.json';

export interface IConfig {
    nearJsonRpc: string,
    nearNetwork: string,
    relayerNearAccount: string,
    ethOnNearClientAccount: string,
    erc20LockerAddress: string,
    rainbowTokenFactoryAccount: string,
    ethCustodianAddress: string,
    auroraAccount: string,
    eNearAddress: string,
    eNearAccount: string,
    numRequiredClientConfirmations: number,
    pollingIntervalMs: number,
    relayEthConnectorEvents: boolean,
    relayERC20Events: boolean,
    relayENearEvents: boolean,
    relayOnlyAuroraEvents: boolean,
}

export let relayerConfig: IConfig;
export let currentNetwork: string;

export function initConfig(networkOrPath: string): void {
    currentNetwork = networkOrPath != null ? networkOrPath : "goerli";
    relayerConfig = getConfigByNetwork(currentNetwork);
}

function getConfigByNetwork(networkOrPath: string): IConfig {
    switch (networkOrPath) {
        case "goerli": return goerli_config;
        case "mainnet": return mainnet_config;
        case "ropsten": return ropsten_config;
        default: {
            // Load config from file
            return JSON.parse(fs.readFileSync(networkOrPath, 'utf-8'))
        }
    }
}
