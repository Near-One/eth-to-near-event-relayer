import {Account, Contract} from "near-api-js";
import {LockEvent} from './utils_eth';
import {IPriceSource, BinancePriceSource} from './price_source'
import BN from "bn.js";
import {formatTokenAmount, parseTokenAmount} from "./utils_near";
import {getTotalTokensSpent, incentivizationCol} from './db_manager';

export class IncentivizationContract {
    private contract: Contract;
    private readonly address: string;

    constructor(nearAccount: Account, contractAddress: string) {
        this.address = contractAddress;
        this.contract = new Contract(
            nearAccount,
            contractAddress,
            {
                changeMethods: ['ft_transfer', 'storage_deposit'],
                viewMethods: ['storage_balance_bounds', 'storage_balance_of', 'ft_balance_of', `ft_metadata`]
            }
        );
    }

    async getDecimals(): Promise<number> {
        return (await (this.contract as any).ft_metadata()).decimals;
    }

    async transfer(receiver_id: string, amount: string, gas_limit: BN, payment_for_storage: BN) { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
        return this.contract.account.functionCall({
            contractId: this.address,
            methodName: "ft_transfer",
            args: {receiver_id: receiver_id, amount: amount},
            gas: gas_limit,
            attachedDeposit: payment_for_storage
        });
    }

    async balanceOf(accountId: string): Promise<string> {
        return (this.contract as any).ft_balance_of({account_id: accountId});
    }

    async registerReceiverIfNeeded(accountId: string, gasLimit: BN): Promise<void> {
        const storageBounds = await (this.contract as any).storage_balance_bounds();
        const currentStorageBalance = await (this.contract as any).storage_balance_of({account_id: accountId});
        const storageMinimumBalance = storageBounds != null ? new BN(storageBounds.min) : new BN(0);
        const storageCurrentBalance = currentStorageBalance != null ? new BN(currentStorageBalance.total) : new BN(0);

        if (storageCurrentBalance < storageMinimumBalance) {
            console.log(`Registering ${accountId}`);
            await (this.contract as any).storage_deposit({
                args: {account_id: accountId, registration_only: true},
                gas: gasLimit,
                amount: storageMinimumBalance
            });
        }
    }
}

interface IRule {
    fiatSymbol: string,
    ethTokenSymbol: string,
    incentivizationTokenSymbol: string,
    ethToken: string
    bridgedToken: string,
    incentivizationToken: string,
    incentivizationFactor: number,
    incentivizationTotalCap: number,
}

export class Incentivizer {
    private rules = new Map<string, IRule>();
    private readonly nearAccount: Account;
    private priceSource: IPriceSource;

    constructor(nearAccount: Account, rules: IRule[], priceSource: IPriceSource = new BinancePriceSource()) {
        this.nearAccount = nearAccount;
        for (const configRule of rules) {
            this.rules.set(configRule.ethToken, configRule);
        }

        this.priceSource = priceSource;
    }

    async getAmountToTransfer(rule: {ethTokenSymbol: string,
                                     incentivizationTokenSymbol: string,
                                     incentivizationFactor: number,
                                     fiatSymbol: string}, eventAmount: BN,
                                     decimals: number): Promise<BN>{
        const lockedTokenAmount = Number (formatTokenAmount (eventAmount.toString(), decimals));
        const bridgeTokenPrice = await this.priceSource.getPrice(rule.ethTokenSymbol, rule.fiatSymbol);
        const incentivizationTokenPrice = await this.priceSource.getPrice(rule.incentivizationTokenSymbol, rule.fiatSymbol);
        const amountBridgeTokenFiat = lockedTokenAmount * bridgeTokenPrice;
        const amountIncentivizationFiat = amountBridgeTokenFiat * rule.incentivizationFactor;
        const tokenAmount = String((amountIncentivizationFiat / incentivizationTokenPrice).toFixed(decimals));
        return new BN(parseTokenAmount(tokenAmount, decimals));
    }

    async incentivize (lockEvent: LockEvent): Promise<boolean> {
        const rule = this.rules.get(lockEvent.contractAddress.toLowerCase());
        if (rule == null) {
            return false;
        }

        if (lockEvent.accountId == this.nearAccount.accountId) {
            return false;
        }

        const contract = new IncentivizationContract(this.nearAccount, rule.incentivizationToken);
        return this.incentivizeByRule (lockEvent, rule, contract);
    }

    async incentivizeByRule(lockEvent: LockEvent, rule: IRule, contract: IncentivizationContract): Promise<boolean> {
        const decimals = await contract.getDecimals();
        let amountToTransfer = await this.getAmountToTransfer(rule, new BN(lockEvent.amount), decimals);
        const accountBalance = new BN(await contract.balanceOf(this.nearAccount.accountId));
        if (amountToTransfer.lten(0)) {
            return false;
        }

        const totalSpent = getTotalTokensSpent(rule.ethToken, rule.incentivizationToken);
        const totalCap = new BN (formatTokenAmount (rule.incentivizationTotalCap.toString(), decimals));
        if (totalSpent.gte(totalCap)){
            console.log(`The total cap ${totalCap} was exhausted`);
            return false;
        }

        const remainingCap = totalCap.sub(totalSpent);
        if (amountToTransfer.gt(remainingCap)){
            amountToTransfer = remainingCap;
        }

        if (accountBalance.lt(amountToTransfer)) {
            console.log(`The account ${this.nearAccount.accountId} has balance ${accountBalance} which is not enough to transfer ${amountToTransfer} 
                            ${rule.incentivizationToken} tokens`);
            return false;
        }

        const gasLimit = new BN('300' + '0'.repeat(12));
        await contract.registerReceiverIfNeeded(lockEvent.accountId, gasLimit);
        console.log(`Reward the account ${lockEvent.accountId} with ${amountToTransfer} of token ${rule.incentivizationToken}`);
        const res = await contract.transfer(lockEvent.accountId, amountToTransfer.toString(), gasLimit, new BN('1'));
        incentivizationCol().insert({ethTokenAddress: rule.ethToken,
            incentivizationTokenAddress: rule.incentivizationToken,
            accountId: lockEvent.accountId,
            txHash: res.transaction.hash,
            tokensAmount: amountToTransfer.toString(),
            eventTxHash: lockEvent.txHash
        });
        return true;
    }
}
