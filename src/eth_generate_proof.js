const ethers = require('ethers');

const blockFromRpc = require('@ethereumjs/block/dist/from-rpc')
const Tree = require('merkle-patricia-tree');
const { encode } = require('eth-util-lite');
const { Header, Proof, Receipt, Log } = require('eth-object');
const { promisfy } = require('promisfy');
const utils = require('ethereumjs-util');
const { serialize: serializeBorsh } = require('near-api-js/lib/utils/serialize');
const Path = require('path')
const fs = require('fs').promises

const { ConnectorType } = require('./types');

class BorshProof {
    constructor(proof) {
        Object.assign(this, proof)
    }
};

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

function getFilenamePrefix(connectorType) {
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

async function findProofForEvent(ethersProvider, connectorType, eventLog) {
    const receipt = await eventLog.getTransactionReceipt();
    receipt.cumulativeGasUsed = receipt.cumulativeGasUsed.toNumber();

    console.log(`Generating the proof for TX with hash: ${receipt.transactionHash} at height ${receipt.blockNumber}`);

    const block = await ethersProvider.getBlock(receipt.blockNumber);
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
    const file = Path.join(path, `${filenamePrefix}_${args.receipt_index}_${args.log_index}_${receipt.transactionHash}.json`)
    await fs.writeFile(file, JSON.stringify(args))
    console.log(`Proof has been successfully generated and saved at ${file}`);

    const serializedProof = serializeBorsh(proofBorshSchema, formattedProof);

    const borshFile = Path.join(path, `${filenamePrefix}_${args.receipt_index}_${args.log_index}_${receipt.transactionHash}.borsh`)
    await fs.writeFile(borshFile, serializedProof);
    console.log(`Borsh-serialized proof has been successfully generated and saved at ${borshFile}`);

    return serializedProof;
}

async function buildTree(ethersProvider, block) {
    const blockReceipts = await Promise.all(
        block.transactions.map(t =>
            ethersProvider.getTransactionReceipt(t))
    );

    // Build a Patricia Merkle Trie
    const tree = new Tree();
    await Promise.all(
        blockReceipts.map(receipt => {
            const path = encode(receipt.transactionIndex)
            receipt.cumulativeGasUsed = receipt.cumulativeGasUsed.toNumber();
            const serializedReceipt = Receipt.fromObject(receipt).serialize()
            return promisfy(tree.put, tree)(path, serializedReceipt)
        })
    );

    return tree;
}

/// TODO: This two function were copied from rainbow-bridge
///       Move them to rainbow-bridge-client and use it from there.
/// Get Ethereum block by number from RPC, and returns raw json object.
async function getEthBlock(number, ethNodeUrl) {
    /// Need to call RPC directly, since function `blockFromRpc` works
    /// when all fields returned by RPC are present. After EIP1559 was introduced
    /// tools that abstract this calls are missing the field `baseFeePerGas`
    blockData = await got.post(ethNodeUrl, {
        json: {
            "id": 0,
            "jsonrpc": "2.0",
            "method": "eth_getBlockByNumber",
            "params": [
                "0x" + number.toString(16),
                false
            ]
        },
        responseType: "json"
    });

    return blockData.body.result;
}

/// bridgeId matches nearNetworkId. It is one of two strings [testnet / mainnet]
function web3BlockToRlp(blockData, bridgeId) {
    let chain;
    if (bridgeId === "testnet") {
        chain = "ropsten";
    } else {
        chain = "mainnet";
    }
    const common = new Common.default({ chain });

    /// baseFeePerGas was introduced after london hard fork.
    /// TODO: Use better way to detect current hard fork.
    if (blockData.baseFeePerGas !== undefined) {
        common.setHardfork("london")
        common.setEIPs([1559])
    }

    const block = blockFromRpc.default(blockData, [], { common });
    return block.header.serialize();
}

async function extractProof(ethersProvider, block, tree, transactionIndex) {
    const encodedTransactionIndex = encode(transactionIndex);
    const [, , stack] = await promisfy(
        tree.findPath,
        tree
    )(encodedTransactionIndex);

    const blockData = await ethersProvider.send(
        'eth_getBlockByNumber',
        [ethers.BigNumber.from(block.number)._hex, true]);

    console.log({ blockData });
    process.exit(0);

    // Correctly compose and encode the header.
    const header = Header.fromObject(blockData);
    return {
        header_rlp: header.serialize(),
        receiptProof: Proof.fromStack(stack),
        txIndex: transactionIndex
    };
}

exports.findProofForEvent = findProofForEvent;
