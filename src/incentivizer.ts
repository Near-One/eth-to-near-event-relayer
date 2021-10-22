import {Account} from "near-api-js";
import {erc20Abi, LockEvent} from './utils_eth';
import {IPriceSource, BinancePriceSource} from './price_source'
import BN from "bn.js";
import {formatTokenAmount, parseTokenAmount} from "./utils_near";
import {getTotalTokensSpent, incentivizationCol} from './db_manager';
import {FungibleToken} from "./fungible_token";
import {ethers} from "ethers";

interface IRule {
    uuid: string,
    fiatSymbol: string,
    ethTokenSymbol: string,
    ethTokenDecimals: number,
    incentivizationTokenSymbol: string,
    incentivizationTokenDecimals: number,
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

    addRules(rules: IRule[]): void {
        for (const configRule of rules) {
            let arrayOfRules = this.rulesByEthToken.get(configRule.ethToken);
            if (arrayOfRules == null) {
                arrayOfRules = [];
                this.rulesByEthToken.set(configRule.ethToken, arrayOfRules);
            }

            arrayOfRules.push(configRule);
        }
    }

    static async validateRules(rules: IRule[], nearAccount: Account, ethersProvider: ethers.providers.Provider): Promise<void> {
        for (const rule of rules) {
            const erc20Contract = new ethers.Contract(rule.ethToken, erc20Abi, ethersProvider);
            const ethTokenSymbol = await erc20Contract.symbol();
            if (ethTokenSymbol != rule.ethTokenSymbol) {
                throw new Error(`Invalid eth token symbol ${ethTokenSymbol} != ${rule.ethTokenSymbol}`);
            }
            const ethTokenDecimals = await erc20Contract.decimals();
            if (ethTokenDecimals != rule.ethTokenDecimals) {
                throw new Error(`Invalid eth token decimals ${ethTokenDecimals} != ${rule.ethTokenDecimals}`);
            }

            const fungibleToken = new FungibleToken(nearAccount, rule.incentivizationToken);
            const metaData = await fungibleToken.getMetaData();
            if (metaData.symbol != rule.incentivizationTokenSymbol) {
                throw new Error(`Invalid incentivization token symbol ${metaData.symbol} != ${rule.incentivizationTokenSymbol}`);
            }
            if (metaData.decimals != rule.incentivizationTokenDecimals) {
                throw new Error(`Invalid incentivization token decimals ${metaData.decimals} != ${rule.incentivizationTokenDecimals}`);
            }
        }
    }

    async getAmountToTransfer(rule: Partial<IRule>, eventAmount: BN): Promise<BN> {
        const lockedTokenAmount = Number (formatTokenAmount (eventAmount.toString(), rule.ethTokenDecimals));
        const bridgeTokenPrice = await this.priceSource.getPrice(rule.ethTokenSymbol, rule.fiatSymbol);
        const incentivizationTokenPrice = await this.priceSource.getPrice(rule.incentivizationTokenSymbol, rule.fiatSymbol);
        const amountBridgeTokenFiat = lockedTokenAmount * bridgeTokenPrice;
        const amountIncentivizationFiat = amountBridgeTokenFiat * rule.incentivizationFactor;
        const tokenAmount = String((amountIncentivizationFiat / incentivizationTokenPrice).toFixed(rule.incentivizationTokenDecimals));

        const res = new BN(parseTokenAmount(tokenAmount, rule.incentivizationTokenDecimals));
        if (rule.incentivizationBaseAmount > 0) {
            res.iadd(new BN(parseTokenAmount(String(rule.incentivizationBaseAmount), rule.incentivizationTokenDecimals)));
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
        let amountToTransfer = await this.getAmountToTransfer(rule, new BN(lockEvent.amount));
        const accountTokenBalance = new BN(await contract.balanceOf(this.nearAccount.accountId));
        if (amountToTransfer.lten(0)) {
            return false;
        }

        const totalSpent = getTotalTokensSpent(rule.uuid, rule.ethToken, rule.incentivizationToken);
        const totalCap = new BN (formatTokenAmount (rule.incentivizationTotalCap.toString(), rule.incentivizationTokenDecimals));
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
