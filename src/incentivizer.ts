import {Account, Contract} from "near-api-js";
import relayerConfig from './json/relayer-config.json';
import {LockEvent} from './utils_eth';

class IncentivizationContract {
    private contract: Contract;
    private address: string;

    constructor(nearAccount: Account, contractAddress: string) {
        this.address = contractAddress;
        this.contract = new Contract(
            nearAccount,
            contractAddress,
            {
                changeMethods: ['ft_transfer'],
                viewMethods: []
            }
        );
    }

    async ft_transfer(receiver_id: string, amount: string): Promise<void> {
        await(this.contract as any).ft_transfer(receiver_id, amount);
    }
}

interface IRule {
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

    constructor(nearAccount: Account) {
        for (const configRule of relayerConfig.incentivization) {
            const incentivizationRule = new IncentivizationRule(configRule, nearAccount);
            this.rules.set(configRule.bridgedToken, incentivizationRule);
        }
    }

    async incentivize(lockEvent: LockEvent): Promise<void> {
        const incentivizationRule = this.rules.get(lockEvent.contractAddress);
        if (incentivizationRule != null) {
            // TODO: change the fixed amount size
            await incentivizationRule.contract.ft_transfer(lockEvent.accountId, "1");
        }
    }
}
