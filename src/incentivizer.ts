import {Account, Contract} from "near-api-js";
import incentivizationConfig from './json/incentivization-config.json';
import {LockEvent} from './utils_eth';
import BN from "bn.js";

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
                viewMethods: ['storage_balance_bounds', 'storage_balance_of', 'ft_balance_of']
            }
        );
    }

    async transfer(receiver_id: string, amount: string, gas_limit: BN, payment_for_storage: BN): Promise<void> {
        await (this.contract as any).ft_transfer({
            args: {receiver_id: receiver_id, amount: amount},
            gas: gas_limit,
            amount: payment_for_storage
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


export class Incentivizer {
    private rules = new Map<string, IncentivizationRule>();
    private nearAccount: Account;

    constructor(nearAccount: Account) {
        this.nearAccount = nearAccount;
        for (const configRule of incentivizationConfig.rules) {
            const incentivizationRule = new IncentivizationRule(configRule, nearAccount);
            this.rules.set(configRule.ethToken, incentivizationRule);
        }
    }

    async incentivize(lockEvent: LockEvent): Promise<void> {
        const incentivizationRule = this.rules.get(lockEvent.contractAddress.toLowerCase());
        if (incentivizationRule == null)
            return;

        if (lockEvent.accountId == this.nearAccount.accountId)
            return;

        // TODO: change the fixed amount size
        const amountToTransfer = new BN("1");

        try {
            const accountBalance = new BN(await incentivizationRule.contract.balanceOf(this.nearAccount.accountId));

            if (accountBalance < amountToTransfer) {
                console.log(`The account ${this.nearAccount.accountId} hasn't enough balance to transfer the 
                            ${incentivizationRule.rule.incentivizationToken} tokens`);
                return;
            }

            const gasLimit = new BN('300' + '0'.repeat(12));
            await incentivizationRule.contract.registerReceiverIfNeeded(lockEvent.accountId, gasLimit);
            console.log(`Reward the account ${lockEvent.accountId} with ${amountToTransfer} of token ${incentivizationRule.rule.incentivizationToken}`);
            await incentivizationRule.contract.transfer(lockEvent.accountId, amountToTransfer.toString(), gasLimit, new BN('1'));
        } catch (e) {
            console.log(e);
        }
    }
}
