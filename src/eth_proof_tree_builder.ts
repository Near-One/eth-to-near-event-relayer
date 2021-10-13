import * as ethers from "ethers";
import {IBlockTransactionString, IReceipt, RetrieveReceiptsMode} from "./types";
import {encode} from 'eth-util-lite';
import {BaseTrie as Tree} from "merkle-patricia-tree";
import {promises as fs} from "fs";
import Web3 from "web3";
import {Receipt} from 'eth-object';

export class TreeBuilder {
    private ethersProvider: ethers.providers.JsonRpcProvider;
    private readonly getReceipts: (block: IBlockTransactionString) => Promise<Array<IReceipt>>;

    constructor(provider: ethers.providers.JsonRpcProvider, mode: RetrieveReceiptsMode) {
        this.ethersProvider = provider;
        switch (mode){
            case RetrieveReceiptsMode.Batch:
                this.getReceipts = this.getReceiptsForBlockBatch;
                break;
            case RetrieveReceiptsMode.Parity:
                this.getReceipts = this.getReceiptsForBlockParity;
                break;
            default:
                this.getReceipts = this.getReceiptsForBlock;
                break;
        }
    }

    async getTreeForBlock(block: IBlockTransactionString): Promise<Tree>{
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

    private async getReceiptsForBlock(block: IBlockTransactionString): Promise<Array<IReceipt>>{
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

    private async getReceiptsForBlockBatch(block: IBlockTransactionString): Promise<Array<IReceipt>>{
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

    private async getReceiptsForBlockParity(block: IBlockTransactionString): Promise<Array<IReceipt>>{
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
