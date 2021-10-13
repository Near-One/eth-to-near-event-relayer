import {BaseTrie as Tree} from 'merkle-patricia-tree';
import {encode} from 'eth-util-lite';
import {Header, Log, Proof, Receipt} from 'eth-object';
import * as ethers from 'ethers';
import * as utils from 'ethereumjs-util';
import {serialize as serializeBorsh} from 'near-api-js/lib/utils/serialize';
import {promises as fs} from "fs"
import Web3 from 'web3';
import {BlockTransactionString} from 'web3-eth';
import {ConnectorType} from './types';
import Path = require('path');

interface IProof {
    log_index: number;
    log_entry_data: number[];
    receipt_index: number;
    receipt_data: number[];
    header_data: number[];
    proof: number[][];
}

export class BorshProof implements IProof {
    log_index: number;
    log_entry_data: number[];
    receipt_index: number;
    receipt_data: number[];
    header_data: number[];
    proof: number[][];

    constructor(proof: IProof) {
        Object.assign(this, proof)
    }
}

const proofBorshSchema = new Map([
    [BorshProof, {
        kind: 'struct',
        fields: [
            ['log_index', 'u64'],
            ['log_entry_data', ['u8']],
            ['receipt_index', 'u64'],
            ['receipt_data', ['u8']],
            ['header_data', ['u8']],
            ['proof', [['u8']]]
        ]
    }]
]);

function getFilenamePrefix(connectorType: ConnectorType) {
    let filenamePrefix = 'proofdata_';
    if (connectorType === ConnectorType.ethCustodian) {
        filenamePrefix += 'ethCustodian';
    } else if (connectorType === ConnectorType.erc20Locker) {
        filenamePrefix += 'erc20Locker';
    } else if (connectorType === ConnectorType.eNear) {
        filenamePrefix += 'eNear';
    } else {
        console.log("SHOULD NEVER GET HERE!");
        return 'unknown';
    }

    return filenamePrefix;
}

interface IReceipt {
    transactionIndex: number,
    logs: Log[],
    logsBloom: string,
    cumulativeGasUsed: number,
    status: number,
    type: number,
}

enum RetrieveReceiptsMode {
    Default,
    Batch,
    Parity
}

export class TreeBuilder {
    private ethersProvider: ethers.providers.JsonRpcProvider;
    private readonly getReceipts: (block: BlockTransactionString) => Promise<Array<IReceipt>>;

    constructor(provider: ethers.providers.JsonRpcProvider, mode: RetrieveReceiptsMode) {
        this.ethersProvider = provider;
        switch (mode){
            case RetrieveReceiptsMode.Default:
                this.getReceipts = this.getReceiptsForBlock;
                break;
            case RetrieveReceiptsMode.Batch:
                this.getReceipts = this.getReceiptsForBlockBatch;
                break;
            case RetrieveReceiptsMode.Parity:
                this.getReceipts = this.getReceiptsForBlockParity;
                break;
        }
    }

    async getTreeForBlock(blockNumber: number): Promise<Tree>{
        /// TODO: Fix this hack
        const web3 = new Web3(this.ethersProvider.connection.url);
        const block: any = await web3.eth.getBlock(blockNumber, false);
        const blockReceiptsFilePath = `build/proofs/block_receipts_${block.hash}.json`;
        let receipts: Array<IReceipt>;
        try {
            receipts = JSON.parse(await fs.readFile(blockReceiptsFilePath ,'utf8'));
        } catch(_e) {
            receipts = await this.getReceipts(block);
            await fs.writeFile(blockReceiptsFilePath, JSON.stringify(receipts));
        }

        const tree = new Tree();
        for (const receipt of receipts) {
            await tree.put(encode(receipt.transactionIndex), Receipt.fromObject(receipt).serialize());
        }

        const computedRoot = tree.root.toString('hex');
        const expectedRoot = block.receiptsRoot.slice(2);
        if (computedRoot !== expectedRoot) {
            throw {message: "Invalid root", computedRoot, expectedRoot};
        }
        return tree;
    }

    private async getReceiptsForBlock(block: BlockTransactionString): Promise<Array<IReceipt>>{
        return await Promise.all(
            block.transactions.map(async (tx) =>{
                    const txReceipt = await this.ethersProvider.getTransactionReceipt(tx);
                    const receipt: IReceipt = {
                        transactionIndex: txReceipt.transactionIndex,
                        logs: txReceipt.logs,
                        logsBloom: txReceipt.logsBloom,
                        cumulativeGasUsed: txReceipt.cumulativeGasUsed.toNumber(),
                        status: txReceipt.status,
                        type: txReceipt.type
                    };

                    return receipt;
                }
            ));
    }

    private async getReceiptsForBlockBatch(block: BlockTransactionString): Promise<Array<IReceipt>>{
        const web3: any = new Web3(this.ethersProvider.connection.url);
        const batch = new web3.BatchRequest();
        const promises = block.transactions.map(tx => {
            return new Promise((resolve, reject) => {
                const req = web3.eth.getTransactionReceipt.request(tx, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    },
                );
                batch.add(req);
            });
        });

        batch.execute();
        const receipts = await Promise.all(promises);
        return receipts.map((txReceipt: any) => {
            const receipt: IReceipt = {
                transactionIndex: txReceipt.transactionIndex,
                logs: txReceipt.logs,
                logsBloom: txReceipt.logsBloom,
                cumulativeGasUsed: Number(txReceipt.cumulativeGasUsed),
                status: Number(txReceipt.status),
                type: Number(txReceipt.type)
            };

            return receipt;
        });
    }

    private async getReceiptsForBlockParity(block: BlockTransactionString): Promise<Array<IReceipt>>{
        const receipts = await this.ethersProvider.send(
            'parity_getBlockReceipts',
            [ethers.BigNumber.from(block.number)._hex, false]);

        return receipts.map((txReceipt: any) => {
            const receipt: IReceipt = {
                transactionIndex: txReceipt.transactionIndex,
                logs: txReceipt.logs,
                logsBloom: txReceipt.logsBloom,
                cumulativeGasUsed: Number(txReceipt.cumulativeGasUsed),
                status: Number(txReceipt.status),
                type: Number(txReceipt.type)
            };

            return receipt;
        });
    }
}

export async function findProofForEvent(ethersProvider: ethers.providers.JsonRpcProvider, connectorType: ConnectorType, eventLog: ethers.Event) : Promise<Uint8Array> {
    const receipt: any = await eventLog.getTransactionReceipt();
    receipt.cumulativeGasUsed = receipt.cumulativeGasUsed.toNumber();
    console.log(`Generating the proof for TX with hash: ${receipt.transactionHash} at height ${receipt.blockNumber}`);

    const treeBuilder = new TreeBuilder(ethersProvider, RetrieveReceiptsMode.Default);
    const tree = await treeBuilder.getTreeForBlock(receipt.blockNumber);
    const proof = await extractProof(
        ethersProvider,
        receipt.blockNumber,
        tree,
        receipt.transactionIndex
    );

    const logIndexInArray = receipt.logs.findIndex(
        l => l.logIndex === eventLog.logIndex
    );

    const formattedProof = new BorshProof({
        log_index: logIndexInArray,
        log_entry_data: Array.from(Log.fromObject(eventLog).serialize()),
        receipt_index: proof.txIndex,
        receipt_data: Array.from(Receipt.fromObject(receipt).serialize()),
        header_data: Array.from(proof.header_rlp),
        proof: Array.from(proof.receiptProof).map(utils.rlp.encode).map(b => Array.from(b))
    });

    const args = {
        log_index: logIndexInArray,
        log_entry_data: formattedProof.log_entry_data,
        receipt_index: formattedProof.receipt_index,
        receipt_data: formattedProof.receipt_data,
        header_data: formattedProof.header_data,
        proof: formattedProof.proof,
    }

    const filenamePrefix = getFilenamePrefix(connectorType);
    const path = 'build/proofs';
    const file = Path.join(path, `${filenamePrefix}_${args.receipt_index}_${args.log_index}_${receipt.transactionHash}.json`);
    await fs.writeFile(file, JSON.stringify(args));
    console.log(`Proof has been successfully generated and saved at ${file}`);

    const serializedProof = serializeBorsh(proofBorshSchema, formattedProof);

    const borshFile = Path.join(path, `${filenamePrefix}_${args.receipt_index}_${args.log_index}_${receipt.transactionHash}.borsh`);
    await fs.writeFile(borshFile, serializedProof);
    console.log(`Borsh-serialized proof has been successfully generated and saved at ${borshFile}`);

    return serializedProof;
}

async function extractProof(ethersProvider: ethers.providers.JsonRpcProvider, blockNumber: number, tree: Tree, transactionIndex: number) {
    const encodedTransactionIndex = encode(transactionIndex);
    const path = await tree.findPath(encodedTransactionIndex);
    const blockData = await ethersProvider.send(
        'eth_getBlockByNumber',
        [ethers.BigNumber.from(blockNumber)._hex, false]);

    const header_rlp = Header.fromRpc(blockData).serialize();
    const receiptProof = new Proof(path.stack.map((trieNode)=>{ return trieNode.raw() }));
    return {
        header_rlp,
        receiptProof: receiptProof,
        txIndex: transactionIndex
    };
}
