import BN from 'bn.js';
import { Account, Contract } from 'near-api-js';
import { ConnectorType } from './types';
import relayerConfig from './json/relayer-config.json';

export interface IConnector {
    contract: Contract;
    address: string;
    submit(proof: Uint8Array, gas_limit: BN, payment_for_storage: BN): Promise<void>;
}

class EthCustodianConnector implements IConnector {
    contract: Contract;
    address: string;

    constructor(nearAccount: Account, connectorContractAddress: string) {
        this.address = connectorContractAddress;
        this.contract = new Contract(
            nearAccount,
            connectorContractAddress,
            {
                changeMethods: ['deposit'],
                viewMethods: []
            }
        );
    }

    async submit(proof: Uint8Array, gas_limit: BN, payment_for_storage: BN): Promise<void> {
        await(this.contract as any).deposit(proof, gas_limit, payment_for_storage);
    }  
}

class Erc20LockerConnector extends EthCustodianConnector { 
}

class ENearConnector {
    contract: Contract;
    address: string;

    constructor(nearAccount: Account, connectorContractAddress: string) {
        this.address = connectorContractAddress;
        this.contract = new Contract(
            nearAccount,
            connectorContractAddress,
            {
                changeMethods: ['finalise_eth_to_near_transfer'],
                viewMethods: []
            }
        );
    }

    async submit(proof: Uint8Array, gas_limit: BN, payment_for_storage: BN): Promise<void> {
        await(this.contract as any).finalise_eth_to_near_transfer(proof, gas_limit, payment_for_storage);
    }  
}

export class NearIsUsedProof {
    contract: Contract;
    address: string;

    constructor(nearAccount: Account, connectorContractAddress: string) {
        this.address = connectorContractAddress;
        this.contract = new Contract(
            nearAccount,
            connectorContractAddress,
            {
                changeMethods: [],
                viewMethods: ['is_used_proof'],
            }
        );
    }

    async isUsedProof(proof: any): Promise<boolean> {
        return await(this.contract as any).is_used_proof(proof, { parse: parseBool });
    }  
}

function parseBool(data: Array<any>) {
    // Try to deserialize first as borsh
    if (data.length === 1) {
        if (data[0] === 0)
            return false;
        else if (data[0] === 1)
            return true;
    }

    return JSON.parse(Buffer.from(data).toString());
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
            relayerConfig.eNearAccount;
        default:
            console.log("SHOULD NEVER GET HERE! Connector account not found");
            return null;
    }
}
