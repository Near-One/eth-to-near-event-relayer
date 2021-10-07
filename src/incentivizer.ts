import {Account, Contract} from "near-api-js";
import {LockEvent} from './utils_eth';
import Binance from 'node-binance-api';
import BN from "bn.js";
import {formatTokenAmount, parseTokenAmount} from "./utils_near";
import {FinalExecutionOutcome} from "near-api-js/src/providers/index";
import {incentivizationCol} from './db_manager';

class IncentivizationContract {
    private contract: Contract;
    private address: string;

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

    async transfer(receiver_id: string, amount: string, gas_limit: BN, payment_for_storage: BN): Promise<FinalExecutionOutcome> {
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

class IncentivizationRule {
    rule: IRule;
    contract: IncentivizationContract;

    constructor(rule: IRule, nearAccount: Account) {
        this.rule = rule;
        this.contract = new IncentivizationContract(nearAccount, rule.incentivizationToken);
    }
}

export interface IPriceSource {
    getPrice(fistSymbol: string, secondSymbol: string): Promise<number>;
}

export class BinancePriceSource implements IPriceSource{
    private binance = new Binance();
    async getPrice(fistSymbol: string, secondSymbol: string): Promise<number>{
        const pair = fistSymbol + secondSymbol;
        return Number((await this.binance.prices(pair))[pair]);
    }
}

export class Incentivizer {
    private rules = new Map<string, IncentivizationRule>();
    private nearAccount: Account;
    private priceSource: IPriceSource;

    constructor(nearAccount: Account, rules: IRule[], priceSource: IPriceSource = new BinancePriceSource()) {
        this.nearAccount = nearAccount;
        for (const configRule of rules) {
            const incentivizationRule = new IncentivizationRule(configRule, nearAccount);
            this.rules.set(configRule.ethToken, incentivizationRule);
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

    async incentivize(lockEvent: LockEvent): Promise<boolean> {
        const incentivizationRule = this.rules.get(lockEvent.contractAddress.toLowerCase());
        if (incentivizationRule == null) {
            return false;
        }

        if (lockEvent.accountId == this.nearAccount.accountId) {
            return false;
        }

        try {
            const decimals = await incentivizationRule.contract.getDecimals();
            const amountToTransfer = await this.getAmountToTransfer(incentivizationRule.rule, new BN(lockEvent.amount), decimals);
            const accountBalance = new BN(await incentivizationRule.contract.balanceOf(this.nearAccount.accountId));

            if (accountBalance.lt(amountToTransfer)) {
                console.log(`The account ${this.nearAccount.accountId} has balance ${accountBalance} which is not enough to transfer ${amountToTransfer} 
                            ${incentivizationRule.rule.incentivizationToken} tokens`);
                return false;
            }

            const gasLimit = new BN('300' + '0'.repeat(12));
            await incentivizationRule.contract.registerReceiverIfNeeded(lockEvent.accountId, gasLimit);
            console.log(`Reward the account ${lockEvent.accountId} with ${amountToTransfer} of token ${incentivizationRule.rule.incentivizationToken}`);
            const res = await incentivizationRule.contract.transfer(lockEvent.accountId, amountToTransfer.toString(), gasLimit, new BN('1'));
            incentivizationCol().insert({ethTokenAddress: lockEvent.contractAddress,
                accountId: lockEvent.accountId,
                txHash: res.transaction.hash,
                tokensAmount: amountToTransfer.toString()
            });
        } catch (e) {
            console.log(e);
            return false;
        }

        return true;
    }
}
