import BN from 'bn.js';
import { Account } from 'near-api-js';

import { ConnectorType } from './types';
import * as connectors from './connectors';

const NEAR_YOCTO_TO_NANO = new BN(10).pow(new BN(15))

export async function depositProofToNear(nearAccount: Account, connectorType: ConnectorType, proof) {
    const connector = connectors.getConnector(nearAccount, connectorType);

    const gas_limit = new BN('300' + '0'.repeat(12)); // Gas limit
    const payment_for_storage = new BN('100000000000000000000').mul(new BN('600')); // Attached payment to pay for the storage

    console.log(`Submitting deposit transaction from: ${nearAccount.accountId} account to ${connector.address}`);
    try {
        await connector.submit(proof, gas_limit, payment_for_storage);
        console.log(`Submitted.`);
    } catch (error) {
        console.log(error);
    }
}

export async function nearIsUsedProof(nearAccount: Account, connectorType: ConnectorType, proof: ArrayBuffer | SharedArrayBuffer) {
    const connectorContractAddress = connectors.getConnectorAccount(connectorType);
    const connector = new connectors.NearIsUsedProof(nearAccount, connectorContractAddress);
    return await connector.isUsedProof(Buffer.from(proof));
}

export function balanceNearYoctoToNano(balanceYocto: number | string | number[] | Uint8Array | Buffer | BN): number {
    return new BN(balanceYocto).div(NEAR_YOCTO_TO_NANO).toNumber();
}
