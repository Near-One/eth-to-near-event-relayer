import {Account} from "near-api-js";
import {LockEvent} from './utils_eth';
import {IPriceSource, BinancePriceSource} from './price_source'
import BN from "bn.js";
import {formatTokenAmount, parseTokenAmount} from "./utils_near";
import {getTotalTokensSpent, incentivizationCol} from './db_manager';
import {FungibleToken} from "./fungible_token";

interface IRule {
    uuid: string,
    fiatSymbol: string,
    ethTokenSymbol: string,
    incentivizationTokenSymbol: string,
    ethToken: string
    bridgedToken: string,
    incentivizationToken: string,
    incentivizationFactor: number,
    incentivizationTotalCap: number,
    incentivizationBaseAmount: number
}

export class Incentivizer {
    private rulesByEthToken = new Map<string, IRule[]>();
    private readonly nearAccount: Account;
    private priceSource: IPriceSource;

    constructor(nearAccount: Account, priceSource: IPriceSource = new BinancePriceSource()) {
        this.nearAccount = nearAccount;
        this.priceSource = priceSource;
    }

    init(rules: IRule[]): void {
        for (const configRule of rules) {
            let arrayOfRules = this.rulesByEthToken.get(configRule.ethToken);
            if (arrayOfRules == null) {
                arrayOfRules = [];
                this.rulesByEthToken.set(configRule.ethToken, arrayOfRules);
            }

            arrayOfRules.push(configRule);
        }
    }

    async getAmountToTransfer(rule: {ethTokenSymbol: string,
                                     incentivizationTokenSymbol: string,
                                     incentivizationFactor: number,
                                     incentivizationBaseAmount: number,
                                     fiatSymbol: string},
                                     eventAmount: BN, decimals: number): Promise<BN> {
        const lockedTokenAmount = Number (formatTokenAmount (eventAmount.toString(), decimals));
        const bridgeTokenPrice = await this.priceSource.getPrice(rule.ethTokenSymbol, rule.fiatSymbol);
        const incentivizationTokenPrice = await this.priceSource.getPrice(rule.incentivizationTokenSymbol, rule.fiatSymbol);
        const amountBridgeTokenFiat = lockedTokenAmount * bridgeTokenPrice;
        const amountIncentivizationFiat = amountBridgeTokenFiat * rule.incentivizationFactor;
        const tokenAmount = String((amountIncentivizationFiat / incentivizationTokenPrice).toFixed(decimals));

        const res = new BN(parseTokenAmount(tokenAmount, decimals));
        if (rule.incentivizationBaseAmount > 0) {
            res.iadd(new BN(parseTokenAmount(String(rule.incentivizationBaseAmount), decimals)));
        }
        return res;
    }

    async incentivize(lockEvent: LockEvent): Promise<boolean> {
        const rules = this.rulesByEthToken.get(lockEvent.contractAddress.toLowerCase());
        if (rules == null || rules.length == 0 || lockEvent.accountId == this.nearAccount.accountId) {
            return false;
        }

        for (const rule of rules) {
            const contract = new FungibleToken(this.nearAccount, rule.incentivizationToken);
            await this.incentivizeByRule (lockEvent, rule, contract);
        }

        return true;
    }

    async incentivizeByRule(lockEvent: LockEvent, rule: IRule, contract: FungibleToken): Promise<boolean> {
        const decimals = (await contract.getMetaData()).decimals;
        let amountToTransfer = await this.getAmountToTransfer(rule, new BN(lockEvent.amount), decimals);
        const accountTokenBalance = new BN(await contract.balanceOf(this.nearAccount.accountId));
        if (amountToTransfer.lten(0)) {
            return false;
        }

        const totalSpent = getTotalTokensSpent(rule.uuid, rule.ethToken, rule.incentivizationToken);
        const totalCap = new BN (formatTokenAmount (rule.incentivizationTotalCap.toString(), decimals));
        if (totalSpent.gte(totalCap)){
            console.log(`The total cap ${totalCap} was exhausted`);
            return false;
        }

        const remainingCap = totalCap.sub(totalSpent);
        if (amountToTransfer.gt(remainingCap)){
            amountToTransfer = remainingCap;
        }

        if (accountTokenBalance.lt(amountToTransfer)) {
            console.log(`The account ${this.nearAccount.accountId} has balance ${accountTokenBalance} which is not enough to transfer ${amountToTransfer} 
                            ${rule.incentivizationToken} tokens`);
            return false;
        }

        const gasLimit = new BN('300' + '0'.repeat(12));
        await contract.registerReceiverIfNeeded(lockEvent.accountId, gasLimit);
        console.log(`Reward the account ${lockEvent.accountId} with ${amountToTransfer} of token ${rule.incentivizationToken}`);
        const res = await contract.transfer(lockEvent.accountId, amountToTransfer.toString(), gasLimit, new BN('1'));
        incentivizationCol().insert({uuid: rule.uuid,
            ethTokenAddress: rule.ethToken,
            incentivizationTokenAddress: rule.incentivizationToken,
            accountId: lockEvent.accountId,
            txHash: res.transaction.hash,
            tokensAmount: amountToTransfer.toString(),
            eventTxHash: lockEvent.txHash
        });
        return true;
    }
}
