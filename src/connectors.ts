import BN from 'bn.js';
import { Account } from 'near-api-js';
import { ConnectorType } from './types';
import {relayerConfig} from './config';

export interface IConnector {
    nearAccount: Account;
    address: string;
    submit(proof: Uint8Array, gas_limit: BN, payment_for_storage: BN);
}

class EthCustodianConnector implements IConnector {
    nearAccount: Account;
    address: string;

    constructor(nearAccount: Account, connectorContractAddress: string) {
        this.address = connectorContractAddress;
        this.nearAccount = nearAccount;
    }

    async submit(proof: Uint8Array, gas_limit: BN, payment_for_storage: BN) {
        return this.nearAccount.functionCall({
            contractId: this.address,
            methodName: "deposit",
            args: proof,
            gas: gas_limit,
            attachedDeposit: payment_for_storage
        });
    }
}

class Erc20LockerConnector extends EthCustodianConnector {
}

class ENearConnector {
    nearAccount: Account;
    address: string;

    constructor(nearAccount: Account, connectorContractAddress: string) {
        this.address = connectorContractAddress;
        this.nearAccount = nearAccount;
    }

    async submit(proof: Uint8Array, gas_limit: BN, payment_for_storage: BN) {
        return this.nearAccount.functionCall({
            contractId: this.address,
            methodName: "finalise_eth_to_near_transfer",
            args: proof,
            gas: gas_limit,
            attachedDeposit: payment_for_storage
        });
    }
}

export function getConnector(nearAccount: Account, connectorType: ConnectorType): IConnector {
    const connectorContractAddress = getConnectorAccount(connectorType);

    switch (connectorType) {
        case ConnectorType.ethCustodian:
            return new EthCustodianConnector(nearAccount, connectorContractAddress);
        case ConnectorType.erc20Locker:
            return new Erc20LockerConnector(nearAccount, connectorContractAddress);
        case ConnectorType.eNear:
            return new ENearConnector(nearAccount, connectorContractAddress);
        default:
            console.log("SHOULD NEVER GET HERE! Connector not found");
            return null;
    }
}

export function getConnectorAccount(connectorType: ConnectorType): string {
    switch (connectorType) {
        case ConnectorType.ethCustodian:
            return relayerConfig.auroraAccount;
        case ConnectorType.erc20Locker:
            return relayerConfig.rainbowTokenFactoryAccount;
        case ConnectorType.eNear:
            return relayerConfig.eNearAccount;
        default:
            console.log("SHOULD NEVER GET HERE! Connector account not found");
            return null;
    }
}
