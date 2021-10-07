import BN from 'bn.js';
import { Account, Contract } from 'near-api-js';
import { ConnectorType } from './types';
import * as connectors from './connectors';

const NEAR_YOCTO_TO_NANO = new BN(10).pow(new BN(15))

export async function depositProofToNear(nearAccount: Account, connectorType: ConnectorType, proof: Uint8Array) { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
    const connector = connectors.getConnector(nearAccount, connectorType);
    const gas_limit = new BN('300' + '0'.repeat(12)); // Gas limit
    const payment_for_storage = new BN('100000000000000000000').mul(new BN('600')); // Attached payment to pay for the storage

    console.log(`Submitting deposit transaction from: ${nearAccount.accountId} account to ${connector.address}`);
    const res = await connector.submit(proof, gas_limit, payment_for_storage);
    console.log(`Submitted.`);
    return res;
}

export async function nearIsUsedProof(nearAccount: Account, connectorType: ConnectorType, proof: ArrayBuffer | SharedArrayBuffer): Promise<boolean> {
    const connectorContractAddress = connectors.getConnectorAccount(connectorType);
    const connector = new ProofUsageChecker(nearAccount, connectorContractAddress);
    return await connector.isUsedProof(Buffer.from(proof));
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
        return await(this.contract as any).is_used_proof(proof, { parse: parseBool });
    }
}

function trimLeadingZeroes(value: string): string {
    value = value.replace(/^0+/, '');
    if (value === '') {
        return '0';
    }
    return value;
}

export function parseTokenAmount(amt: string, decimals: number): string | null {
    if (!amt) { return null; }
    amt = amt.replace(/,/g, '').trim();
    const split = amt.split('.');
    const wholePart = split[0];
    const fracPart = split[1] || '';
    if (split.length > 2 || fracPart.length > decimals) {
        throw new Error(`Cannot parse '${amt}' as token amount`);
    }
    return trimLeadingZeroes(wholePart + fracPart.padEnd(decimals, '0'));
}

export function formatTokenAmount(balance: string, decimals: number): string {
    const balanceBN = new BN(balance, 10);
    balance = balanceBN.toString();
    const wholeStr = balance.substring(0, balance.length - decimals) || '0';
    const fractionStr = balance.substring(balance.length - decimals)
        .padStart(decimals, '0').substring(0, decimals);

    return trimTrailingZeroes(`${wholeStr}.${fractionStr}`);
}

function trimTrailingZeroes(value: string): string {
    return value.replace(/\.?0*$/, '');
}

