import {BaseTrie as Tree} from 'merkle-patricia-tree';
import {encode} from 'eth-util-lite';
import {Header, Log, Proof, Receipt} from 'eth-object';
import * as ethers from 'ethers';
import * as utils from 'ethereumjs-util';
import {serialize as serializeBorsh} from 'near-api-js/lib/utils/serialize';
import {promises as fs} from "fs"
import {ConnectorType} from './types';
import Path = require('path');
import {TreeBuilder} from "./eth_proof_tree_builder";
import {Formatter} from "@ethersproject/providers";

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
    } else if (connectorType === ConnectorType.erc271Locker) {
        filenamePrefix += 'erc271Locker';
    } else if (connectorType === ConnectorType.eNear) {
        filenamePrefix += 'eNear';
    } else {
        console.log("SHOULD NEVER GET HERE!");
        return 'unknown';
    }

    return filenamePrefix;
}

const rpcObjFormatter = new Formatter();

export async function findProofForEvent(treeBuilder: TreeBuilder, ethersProvider: ethers.providers.JsonRpcProvider,
                                        connectorType: ConnectorType, eventLog: ethers.Event) : Promise<Uint8Array> {

    const receipt: any = rpcObjFormatter.receipt(await ethersProvider.send('eth_getTransactionReceipt', [eventLog.transactionHash]));
    receipt.cumulativeGasUsed = receipt.cumulativeGasUsed.toNumber();
    console.log(`Generating the proof for TX with hash: ${receipt.transactionHash} at height ${receipt.blockNumber}`);
    const blockData = await ethersProvider.send(
        'eth_getBlockByNumber',
        [ethers.utils.hexValue(receipt.blockNumber), false]);
    const tree = await treeBuilder.getTreeForBlock(blockData);
    const proof = await extractProof(blockData, tree, receipt.transactionIndex);
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

async function extractProof(blockData: any, tree: Tree, transactionIndex: number) {
    const encodedTransactionIndex = encode(transactionIndex);
    const path = await tree.findPath(encodedTransactionIndex);
    const header_rlp = Header.fromRpc(blockData).serialize();
    const receiptProof = new Proof(path.stack.map((trieNode)=>{ return trieNode.raw() }));
    return {
        header_rlp,
        receiptProof: receiptProof,
        txIndex: transactionIndex
    };
}
