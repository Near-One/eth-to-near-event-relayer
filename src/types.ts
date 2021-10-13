import {Log} from 'eth-object';

export enum ConnectorType {
    ethCustodian,
    erc20Locker,
    eNear,
}

export enum RetrieveReceiptsMode {
    Default,
    Batch,
    Parity
}

export interface IReceipt {
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
