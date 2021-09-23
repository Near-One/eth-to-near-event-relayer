import { findProofForEvent } from './eth_generate_proof';
import { getDepositedEventsForBlocks, isEventForAurora } from './utils_eth';
import { ConnectorType } from './types';
import { StatsD } from 'hot-shots';
import { metrics } from './metrics';
import { HttpPrometheus } from '../utils/http-prometheus';
import { depositProofToNear, nearIsUsedProof } from './utils_near';
import { Account } from 'near-api-js';
import { providers, Event } from 'ethers';
import relayerConfig from './json/relayer-config.json';

interface GaugeEvents {
    NUM_PROCESSED: string;
    NUM_SKIPPED: string;
    NUM_RELAYED: string;
    LAST_BLOCK_WITH_RELAYED: string;
}

export abstract class RelayEvents {
    processedEventsCounter: number = 0;
    skippedEventsCounter: number = 0;
    relayedEventsCounter: number = 0;
    protected relayerNearAccount: Account;
    protected ethersProvider: providers.JsonRpcProvider;
    protected dogstatsd: StatsD;
    protected relayedConnectorEventsCounter: any;
    protected connectorType: ConnectorType;
    protected gaugeEvents: GaugeEvents;

    protected constructor(account: Account, ethersProvider: providers.JsonRpcProvider, dogstatsd: StatsD, connectorType: ConnectorType, gaugeEvents: GaugeEvents) {
        this.relayerNearAccount = account;
        this.ethersProvider = ethersProvider;
        this.dogstatsd = dogstatsd;
        this.connectorType = connectorType;
        this.gaugeEvents = gaugeEvents;

        this.dogstatsd.gauge(gaugeEvents.NUM_PROCESSED, this.processedEventsCounter);
        this.dogstatsd.gauge(gaugeEvents.NUM_SKIPPED, this.skippedEventsCounter);
        this.dogstatsd.gauge(gaugeEvents.NUM_RELAYED, this.relayedEventsCounter);
    }

    abstract processEvent(blockFrom: number, blockTo: number): Promise<void>;

    protected async process(eventLog: Event, logMsg: string): Promise<void> {
        console.log(logMsg);

        const proof = await findProofForEvent(this.ethersProvider, this.connectorType, eventLog);
        const isUsedProof = await nearIsUsedProof(this.relayerNearAccount, this.connectorType, proof);

        this.processedEventsCounter += 1;
        this.dogstatsd.gauge(this.gaugeEvents.NUM_PROCESSED, this.processedEventsCounter);

        if (isUsedProof) {
            console.log("Skipped the event as its proof was already used.");
            this.skippedEventsCounter += 1;
            this.dogstatsd.gauge(this.gaugeEvents.NUM_SKIPPED, this.skippedEventsCounter);
            return;
        }

        await depositProofToNear(this.relayerNearAccount, this.connectorType, proof);

        this.relayedConnectorEventsCounter.inc(1);
        this.relayedEventsCounter += 1;
        this.dogstatsd.gauge(this.gaugeEvents.NUM_RELAYED, this.relayedEventsCounter);
        this.dogstatsd.gauge(this.gaugeEvents.LAST_BLOCK_WITH_RELAYED, eventLog.blockNumber);
    }
}

export class RelayEthEvents extends RelayEvents {
    constructor(account: Account, ethersProvider: providers.JsonRpcProvider, httpPrometheus: HttpPrometheus, dogstatsd: StatsD) {
        super(account, ethersProvider, dogstatsd, ConnectorType.ethCustodian, {
            NUM_PROCESSED: metrics.GAUGE_ETH_NUM_PROCESSED_EVENTS,
            NUM_SKIPPED: metrics.GAUGE_ETH_NUM_SKIPPED_EVENTS,
            NUM_RELAYED: metrics.GAUGE_ETH_NUM_RELAYED_EVENTS,
            LAST_BLOCK_WITH_RELAYED: metrics.GAUGE_ETH_LAST_BLOCK_WITH_RELAYED_EVENT
        });
        this.relayedConnectorEventsCounter = httpPrometheus.counter('num_relayed_eth_connector_events', 'Number of relayed ETH connector events');
    }

    async processEvent(blockFrom: number, blockTo: number): Promise<void> {
        const ethCustodianDepositedEvents = await getDepositedEventsForBlocks(this.ethersProvider, relayerConfig.ethCustodianAddress,
            this.connectorType, blockFrom, blockTo
        );

        if (ethCustodianDepositedEvents.length == 0) {
            return;
        }

        console.log(`Relaying EthCustodian events. Relay only Aurora events: ${relayerConfig.relayOnlyAuroraEvents}`);
        console.log(`Found ${ethCustodianDepositedEvents.length} EthCustodian deposited events in blocks [${blockFrom}; ${blockTo}]`);

        for (const eventLog of ethCustodianDepositedEvents) {
            const isAuroraEvent = isEventForAurora(relayerConfig.auroraAccount, eventLog);
            const logMsg = isAuroraEvent ? '> Processing ETH->AuroraETH deposit event...'
                : '> Processing ETH->NEP-141 deposit event...';

            if (relayerConfig.relayOnlyAuroraEvents && !isAuroraEvent) {
                continue;
            } else {
                await this.process(eventLog, logMsg);
            }
        }
    }
}

export class RelayERC20Events extends RelayEvents {
    constructor(account: Account, ethersProvider: providers.JsonRpcProvider, httpPrometheus: HttpPrometheus, dogstatsd: StatsD) {
        super(account, ethersProvider, dogstatsd, ConnectorType.erc20Locker, {
            NUM_PROCESSED: metrics.GAUGE_ERC20_NUM_PROCESSED_EVENTS,
            NUM_SKIPPED: metrics.GAUGE_ERC20_NUM_SKIPPED_EVENTS,
            NUM_RELAYED: metrics.GAUGE_ERC20_NUM_RELAYED_EVENTS,
            LAST_BLOCK_WITH_RELAYED: metrics.GAUGE_ERC20_LAST_BLOCK_WITH_RELAYED_EVENT
        });
        this.relayedConnectorEventsCounter = httpPrometheus.counter('num_relayed_erc20_connector_events', 'Number of relayed ERC20 connector events');
    }

    async processEvent(blockFrom: number, blockTo: number): Promise<void> {
        const erc20LockerDepositedEvents = await getDepositedEventsForBlocks(this.ethersProvider, relayerConfig.erc20LockerAddress,
            this.connectorType, blockFrom, blockTo
        );

        if (erc20LockerDepositedEvents.length == 0) {
            return;
        }

        console.log(`Relaying ERC20Locker events. Relay only Aurora events: ${relayerConfig.relayOnlyAuroraEvents}`);
        console.log(`Found ${erc20LockerDepositedEvents.length} ERC20Locker locked events in blocks [${blockFrom}; ${blockTo}]`);

        for (const eventLog of erc20LockerDepositedEvents) {
            const isAuroraEvent = isEventForAurora(relayerConfig.auroraAccount, eventLog);
            const logMsg = isAuroraEvent ? '> Processing ERC20->AuroraERC20 deposit event...'
                : '> Processing ERC20->NEP-141 deposit event...';

            if (relayerConfig.relayOnlyAuroraEvents && !isAuroraEvent) {
                continue;
            } else {
                await this.process(eventLog, logMsg);
            }
        }
    }
}

export class RelayENearEvents extends RelayEvents {
    constructor(account: Account, ethersProvider: providers.JsonRpcProvider, httpPrometheus: HttpPrometheus, dogstatsd: StatsD) {
        super(account, ethersProvider, dogstatsd, ConnectorType.eNear, {
            NUM_PROCESSED: metrics.GAUGE_ENEAR_NUM_PROCESSED_EVENTS,
            NUM_SKIPPED: metrics.GAUGE_ENEAR_NUM_SKIPPED_EVENTS,
            NUM_RELAYED: metrics.GAUGE_ENEAR_NUM_RELAYED_EVENTS,
            LAST_BLOCK_WITH_RELAYED: metrics.GAUGE_ENEAR_LAST_BLOCK_WITH_RELAYED_EVENT
        });

        this.relayedConnectorEventsCounter = httpPrometheus.counter('num_relayed_eNear_connector_events', 'Number of relayed eNEAR connector events');
    }

    async processEvent(blockFrom: number, blockTo: number): Promise<void> {
        const eNearDepositedEvents = await getDepositedEventsForBlocks(this.ethersProvider, relayerConfig.eNearAddress,
            this.connectorType, blockFrom, blockTo
        );

        if (eNearDepositedEvents.length == 0) {
            return;
        }

        console.log(`Relaying eNear events.`);
        console.log(`Found ${eNearDepositedEvents.length} eNear locked events in blocks [${blockFrom}; ${blockTo}]`);

        for (const eventLog of eNearDepositedEvents) {
            const isAuroraTransferSupported = false; // not available yet
            const isAuroraEvent = false;
            const logMsg = '> Processing eNEAR->NEP-141 deposit event...';

            if (isAuroraTransferSupported && relayerConfig.relayOnlyAuroraEvents && !isAuroraEvent) {
                continue;
            } else {
                await this.process(eventLog, logMsg);
            }
        }
    }
}
