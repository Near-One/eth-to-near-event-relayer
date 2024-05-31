import fs from 'fs';
import sepolia_config from './json/sepolia-relayer-config.json';
import mainnet_config from './json/mainnet-relayer-config.json';

export interface IConfig {
    nearJsonRpc: string,
    nearNetwork: string,
    relayerNearAccount: string,
    ethOnNearClientAccount: string,
    erc20LockerAddress: string,
    erc271LockerAddress: string,
    rainbowTokenFactoryAccount: string,
    nftTokenFactoryAccount: string,
    ethCustodianAddress: string,
    auroraAccount: string,
    eNearAddress: string,
    eNearAccount: string,
    nep141FactoryAddress: string,
    nep141LockerAccount: string,
    numRequiredClientConfirmations: number,
    pollingIntervalMs: number,
    relayEthConnectorEvents: boolean,
    relayERC20Events: boolean,
    relayERC271Events: boolean,
    relayENearEvents: boolean,
    relayOnlyAuroraEvents: boolean,
    retrieveReceiptsMode: string
}

export let relayerConfig: IConfig;
export let currentNetwork: string;

export function initConfig(networkOrPath: string): void {
    currentNetwork = networkOrPath != null ? networkOrPath : "goerli";
    relayerConfig = getConfigByNetwork(currentNetwork);
}

function getConfigByNetwork(networkOrPath: string): IConfig {
    switch (networkOrPath) {
        case "mainnet": return mainnet_config;
        case "sepolia": return sepolia_config;
        default: {
            // Load config from file
            return JSON.parse(fs.readFileSync(networkOrPath, 'utf-8'))
        }
    }
}
