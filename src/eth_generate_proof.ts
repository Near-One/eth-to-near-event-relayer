import Tree from 'merkle-patricia-tree';
import { encode } from 'eth-util-lite';
import { promisfy } from 'promisfy';
import { Header, Proof, Receipt, Log } from 'eth-object';
import * as ethers from 'ethers';
import blockFromRpc from '@ethereumjs/block/dist/from-rpc'
import Common from '@ethereumjs/common'
import * as utils from 'ethereumjs-util';
import { serialize as serializeBorsh } from 'near-api-js/lib/utils/serialize';
import Path = require('path')
import { promises as fs } from "fs"
import Web3 from 'web3';
import { BlockTransactionString } from 'web3-eth';
import { ConnectorType } from './types';

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

export async function findProofForEvent(ethersProvider: ethers.providers.JsonRpcProvider, connectorType: ConnectorType, eventLog: ethers.Event) : Promise<Uint8Array> {
    const receipt: any = await eventLog.getTransactionReceipt();
    receipt.cumulativeGasUsed = receipt.cumulativeGasUsed.toNumber();

    console.log(`Generating the proof for TX with hash: ${receipt.transactionHash} at height ${receipt.blockNumber}`);

    /// TODO: Fix this hack
    let web3 = new Web3(ethersProvider.connection.url);
    const block = await web3.eth.getBlock(receipt.blockNumber);
    const tree = await buildTree(ethersProvider, block);

    const proof = await extractProof(
        ethersProvider,
        block,
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

async function buildTree(ethersProvider: ethers.providers.JsonRpcProvider, block: any): Promise<Tree.Trie> {
    const blockReceipts = await Promise.all(
        block.transactions.map(t =>
            ethersProvider.getTransactionReceipt(t))
    );

    // Build a Patricia Merkle Trie
    const tree = new Tree();
    await Promise.all(
        blockReceipts.map((receipt: any) => {
            const path = encode(receipt.transactionIndex)
            receipt.cumulativeGasUsed = receipt.cumulativeGasUsed.toNumber();
            const serializedReceipt = Receipt.fromObject(receipt).serialize()
            return promisfy(tree.put, tree)(path, serializedReceipt)
        })
    );

    const computedRoot = tree.root.toString('hex');
    const expectedRoot = block.receiptsRoot.slice(2);

    if (computedRoot !== expectedRoot) {
        throw { message: "Invalid root", computedRoot, expectedRoot };
    }

    return tree;
}

/// TODO: This function was copied from rainbow-bridge. Move it to rainbow-bridge-client and use it from there.
/// bridgeId matches nearNetworkId. It is one of two strings [testnet / mainnet]
function web3BlockToRlp(blockData: any, bridgeId: string) {
    let chain: string;
    if (bridgeId === "testnet") {
        chain = "ropsten";
    } else {
        chain = "mainnet";
    }
    const common = new Common ({ chain : chain });

    /// baseFeePerGas was introduced after london hard fork.
    /// TODO: Use better way to detect current hard fork.
    if (blockData.baseFeePerGas !== undefined) {
        common.setHardfork("london")
        common.setEIPs([1559])
    }

    const block = blockFromRpc(blockData, [], { common });
    return block.header.serialize();
}

async function extractProof(ethersProvider: ethers.providers.JsonRpcProvider, block: BlockTransactionString, tree, transactionIndex) {
    const encodedTransactionIndex = encode(transactionIndex);
    const [, , stack] = await promisfy(
        tree.findPath,
        tree
    )(encodedTransactionIndex);

    const blockData = await ethersProvider.send(
        'eth_getBlockByNumber',
        [ethers.BigNumber.from(block.number)._hex, false]);

    const header_rlp = Header.fromRpc(blockData).serialize();

    return {
        header_rlp,
        receiptProof: Proof.fromStack(stack),
        txIndex: transactionIndex
    };
}
