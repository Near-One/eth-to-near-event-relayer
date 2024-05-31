import BN from 'bn.js';
import { Account } from 'near-api-js';
import { ConnectorType } from './types';
import { relayerConfig } from './config';

export function getConnector(nearAccount: Account, connectorType: ConnectorType): Connector {
    return new Connector(nearAccount, getConnectorAccount(connectorType), connectorType);
}

export function getConnectorAccount(connectorType: ConnectorType): string {
    switch (connectorType) {
        case ConnectorType.ethCustodian:
            return relayerConfig.auroraAccount;
        case ConnectorType.erc20Locker:
            return relayerConfig.rainbowTokenFactoryAccount;
        case ConnectorType.eNear:
            return relayerConfig.eNearAccount;
        case ConnectorType.erc271Locker:
            return relayerConfig.nftTokenFactoryAccount;
        case ConnectorType.nep141:
            return relayerConfig.nep141LockerAccount;
        default:
            throw new Error("Connector account not found!");
    }
}

class Connector {
    nearAccount: Account;
    address: string;
    connectorType: ConnectorType;

    constructor(nearAccount: Account, connectorContractAddress: string, connectorType: ConnectorType) {
        this.address = connectorContractAddress;
        this.nearAccount = nearAccount;
        this.connectorType = connectorType;
    }

    async submit(proof: Uint8Array, gasLimit: BN, paymentForStorage: BN) {
        return this.nearAccount.functionCall({
            contractId: this.address,
            methodName: Connector.getConnectorSubmitMethod(this.connectorType),
            args: proof,
            gas: gasLimit,
            attachedDeposit: paymentForStorage
        });
    }

    static getConnectorSubmitMethod(connectorType: ConnectorType): string {
        switch (connectorType) {
            case ConnectorType.ethCustodian:
                return "deposit";
            case ConnectorType.erc20Locker:
                return "deposit";
            case ConnectorType.eNear:
                return "finalise_eth_to_near_transfer";
            case ConnectorType.erc271Locker:
                return "finalise_eth_to_near_transfer";
            default:
                throw new Error("Connector submit method not found!");
        }
    }
}

