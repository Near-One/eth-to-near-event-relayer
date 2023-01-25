import {Log} from 'eth-object';

export enum ConnectorType {
    ethCustodian,
    erc20Locker,
    eNear,
    erc271Locker,
    eFastBridge
}

export enum RetrieveReceiptsMode {
    default,
    batch,
    parity
}

export interface IReceipt {
    transactionHash: string,
    blockNumber: number,
    transactionIndex: number,
    logs: Log[],
    logsBloom: string,
    cumulativeGasUsed: number,
    status: number,
    type: number,
}

export interface IBlock {
    number: number;
    hash: string;
    parentHash: string;
    nonce: string;
    sha3Uncles: string;
    logsBloom: string;
    transactionRoot: string;
    stateRoot: string;
    receiptsRoot: string;
    miner: string;
    extraData: string;
    gasLimit: number;
    gasUsed: number;
    timestamp: number | string;
}

export interface IBlockTransactionString extends IBlock {
    transactions: string[];
}
