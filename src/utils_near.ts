import BN from 'bn.js';
import { Account, Contract } from 'near-api-js';
import { ConnectorType } from './types';
import * as connectors from './connectors';

const NEAR_YOCTO_TO_NANO = new BN(10).pow(new BN(15))

export async function depositProofToNear(nearAccount: Account, connectorType: ConnectorType, proof: any): Promise<void> {
    const connector = connectors.getConnector(nearAccount, connectorType);

    const gas_limit = new BN('300' + '0'.repeat(12)); // Gas limit
    const payment_for_storage = new BN('100000000000000000000').mul(new BN('600')); // Attached payment to pay for the storage

    console.log(`Submitting deposit transaction from: ${nearAccount.accountId} account to ${connector.address}`);
    try {
        await connector.submit(proof, gas_limit,  (connectorType != ConnectorType.eFastBridge) ? payment_for_storage : new BN(0));
        console.log(`Submitted.`);
    } catch (error) {
        console.log(error);
    }
}

export async function nearIsUsedProof(nearAccount: Account, connectorType: ConnectorType, proof: ArrayBuffer | SharedArrayBuffer): Promise<boolean> {
    const connectorContractAddress = connectors.getConnectorAccount(connectorType);
    const connector = new ProofUsageChecker(nearAccount, connectorContractAddress);
    return await connector.isUsedProof(Buffer.from(proof));
}

export async function fastBridgeIsUsedProof(nearAccount: Account, connectorType: ConnectorType, txnId: string): Promise<boolean> {    
    const connectorContractAddress = connectors.getConnectorAccount(connectorType);
    const connector = new ProofUsageCheckerEFastBridge(nearAccount, connectorContractAddress);
    
    return connector.isUsedProof(txnId);
}

export function balanceNearYoctoToNano(balanceYocto: number | string | number[] | Uint8Array | Buffer | BN): number {
    return new BN(balanceYocto).div(NEAR_YOCTO_TO_NANO).toNumber();
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

class ProofUsageChecker {
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
       return await(this.contract as any).is_used_proof(proof, { parse: parseBool, stringify: (data)=>{return data;} });
    }
}

class ProofUsageCheckerFastBridge {
    contract: Contract;
    address: string;

    constructor(nearAccount: Account, connectorContractAddress: string) {
        this.address = connectorContractAddress;
        this.contract = new Contract(
            nearAccount,
            connectorContractAddress,
            {
                changeMethods: [],
                viewMethods: ['get_pending_transfer'],
            }
        );
    }

    async isUsedProof(txnId: string): Promise<boolean> {
        console.log(txnId);
        
       return await(this.contract as any).get_pending_transfer({"id" : txnId});
    }
}
