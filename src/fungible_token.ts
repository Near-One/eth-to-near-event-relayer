import {Account} from "near-api-js";
import BN from "bn.js";
import {FinalExecutionOutcome} from "near-api-js/lib/providers";

interface IFungibleTokenMetadata {
    spec: string,
    name: string,
    symbol: string,
    icon: string | null,
    reference: string | null,
    reference_hash: string | null,
    decimals: number,
}

export class FungibleToken {
    private readonly address: string;
    private readonly account: Account;

    constructor(nearAccount: Account, contractAddress: string) {
        this.address = contractAddress;
        this.account = nearAccount;
    }

    async getMetaData(): Promise<IFungibleTokenMetadata> {
        return this.account.viewFunction(this.address,'ft_metadata');
    }

    async transfer(receiverId: string, amount: string, gasLimit: BN, paymentForStorage: BN, memo?: string): Promise<FinalExecutionOutcome> {
        return this.account.functionCall({
            contractId: this.address,
            methodName: "ft_transfer",
            args: {receiver_id: receiverId, amount: amount, memo: memo},
            gas: gasLimit,
            attachedDeposit: paymentForStorage
        });
    }

    async balanceOf(accountId: string): Promise<string> {
        return await this.account.viewFunction(this.address,'ft_balance_of', {account_id: accountId});
    }

    async registerReceiverIfNeeded(accountId: string, gasLimit: BN): Promise<void> {
        const storageBounds = await this.account.viewFunction(this.address,'storage_balance_bounds');
        const currentStorageBalance = await this.account.viewFunction(this.address,'storage_balance_of', {account_id: accountId});
        const storageMinimumBalance = storageBounds != null ? new BN(storageBounds.min) : new BN(0);
        const storageCurrentBalance = currentStorageBalance != null ? new BN(currentStorageBalance.total) : new BN(0);

        if (storageCurrentBalance < storageMinimumBalance) {
            console.log(`Registering ${accountId}`);
            await this.account.functionCall({
                contractId: this.address,
                methodName: "storage_deposit",
                args: {account_id: accountId, registration_only: true},
                gas: gasLimit,
                attachedDeposit: storageMinimumBalance
            });
        }
    }
}