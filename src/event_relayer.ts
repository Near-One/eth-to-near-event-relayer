import { findProofForEvent } from './eth_generate_proof';
import { getDepositedEventsForBlocks, getLockEvent, isEventForAurora } from './utils_eth';
import { ConnectorType } from './types';
import { StatsD } from 'hot-shots';
import * as metrics from './metrics';
import { HttpPrometheus } from '../utils/http-prometheus';
import { depositProofToNear, nearIsUsedProof } from './utils_near';
import { Account } from 'near-api-js';
import { providers, Event } from 'ethers';
import relayerConfig from './json/relayer-config.json';
import { Incentivizer } from "./incentivizer";
import {relayerCol} from "./db_manager";

interface GaugeEvents {
    NUM_PROCESSED: string;
    NUM_SKIPPED: string;
    NUM_RELAYED: string;
    LAST_BLOCK_WITH_RELAYED: string;
}

export abstract class EventRelayer {
    protected processedEventsCounter = 0;
    protected skippedEventsCounter = 0;
    protected relayedEventsCounter = 0;
    protected relayerNearAccount: Account;
    protected ethersProvider: providers.JsonRpcProvider;
    protected dogstatsd: StatsD;
    protected relayedConnectorEventsCounter: any;
    protected connectorType: ConnectorType;
    protected gaugeEvents: GaugeEvents;
    protected address: string;
    protected isShouldClose = false;
    protected isAuroraTransferSupported: boolean;
    protected incentivizer: Incentivizer;

    protected constructor(account: Account, ethersProvider: providers.JsonRpcProvider, dogstatsd: StatsD,
                          connectorType: ConnectorType, gaugeEvents: GaugeEvents, address: string,
                          isAuroraTransferSupported: boolean, incentivizer: Incentivizer) {
        this.relayerNearAccount = account;
        this.ethersProvider = ethersProvider;
        this.dogstatsd = dogstatsd;
        this.connectorType = connectorType;
        this.gaugeEvents = gaugeEvents;
        this.address = address;
        this.isAuroraTransferSupported = isAuroraTransferSupported;
        this.incentivizer = incentivizer;

        this.dogstatsd.gauge(gaugeEvents.NUM_PROCESSED, this.processedEventsCounter);
        this.dogstatsd.gauge(gaugeEvents.NUM_SKIPPED, this.skippedEventsCounter);
        this.dogstatsd.gauge(gaugeEvents.NUM_RELAYED, this.relayedEventsCounter);
    }

    close(): void {
        this.isShouldClose = true;
    }

    async processEvent(blockFrom: number, blockTo: number): Promise<void> {
        const depositedEvents = await getDepositedEventsForBlocks(this.ethersProvider, this.address,
            this.connectorType, blockFrom, blockTo
        );

        if (depositedEvents.length == 0) {
            return;
        }

        console.log(`Relaying ${this.getTypeStr()} events. Relay only Aurora events: ${relayerConfig.relayOnlyAuroraEvents}`);
        console.log(`Found ${depositedEvents.length} ${this.getTypeStr()} deposited events in blocks [${blockFrom}; ${blockTo}]`);

        for (const eventLog of depositedEvents) {
            if (this.isShouldClose)
                return;

            const isAuroraEvent = isEventForAurora(relayerConfig.auroraAccount, eventLog);

            if (! this.isSkipEvent(isAuroraEvent)) {
                console.log(this.processingLogMsg(isAuroraEvent));
                await this.process(eventLog);
            }
        }
    }

    protected async process(eventLog: Event): Promise<void> {
        const receipt = await eventLog.getTransactionReceipt();
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

        const relayEntry = relayerCol().insert({
            eventTxHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            depositTxHash: ""
        });

        try {
            const depositRes = await depositProofToNear(this.relayerNearAccount, this.connectorType, proof);
            relayEntry.depositTxHash = depositRes.transaction.hash;
            relayerCol().update(relayEntry);

            this.relayedConnectorEventsCounter.inc(1);
            this.relayedEventsCounter += 1;
            this.dogstatsd.gauge(this.gaugeEvents.NUM_RELAYED, this.relayedEventsCounter);
            this.dogstatsd.gauge(this.gaugeEvents.LAST_BLOCK_WITH_RELAYED, eventLog.blockNumber);

            const lockEvent = getLockEvent(eventLog, receipt);
            if (lockEvent != null) {
                await this.incentivizer.incentivize(lockEvent);
            }
        } catch (error) {
            console.log(error);
        }
    }

    protected isSkipEvent(isAuroraEvent: boolean): boolean {
        if (isAuroraEvent && !this.isAuroraTransferSupported)
            return true;

        return !isAuroraEvent && relayerConfig.relayOnlyAuroraEvents;
    }

    abstract getTypeStr(): string;
    abstract processingLogMsg(isAuroraEvent: boolean): string;
}

export class EthEventRelayer extends EventRelayer {
    constructor(account: Account, ethersProvider: providers.JsonRpcProvider, httpPrometheus: HttpPrometheus,
                dogstatsd: StatsD, incentivizer: Incentivizer) {
        super(account, ethersProvider, dogstatsd, ConnectorType.ethCustodian, {
            NUM_PROCESSED: metrics.GAUGE_ETH_NUM_PROCESSED_EVENTS,
            NUM_SKIPPED: metrics.GAUGE_ETH_NUM_SKIPPED_EVENTS,
            NUM_RELAYED: metrics.GAUGE_ETH_NUM_RELAYED_EVENTS,
            LAST_BLOCK_WITH_RELAYED: metrics.GAUGE_ETH_LAST_BLOCK_WITH_RELAYED_EVENT
        }, relayerConfig.ethCustodianAddress, true, incentivizer);
        this.relayedConnectorEventsCounter = httpPrometheus.counter('num_relayed_eth_connector_events', 'Number of relayed ETH connector events');
    }

    override getTypeStr(): string {
        return "EthCustodian";
    }

    override processingLogMsg(isAuroraEvent: boolean): string {
        return isAuroraEvent ? '> Processing ETH->AuroraETH deposit event...'
            : '> Processing ETH->NEP-141 deposit event...';
    }
}

export class ERC20EventRelayer extends EventRelayer {
    constructor(account: Account, ethersProvider: providers.JsonRpcProvider, httpPrometheus: HttpPrometheus,
                dogstatsd: StatsD, incentivizer: Incentivizer) {
        super(account, ethersProvider, dogstatsd, ConnectorType.erc20Locker, {
            NUM_PROCESSED: metrics.GAUGE_ERC20_NUM_PROCESSED_EVENTS,
            NUM_SKIPPED: metrics.GAUGE_ERC20_NUM_SKIPPED_EVENTS,
            NUM_RELAYED: metrics.GAUGE_ERC20_NUM_RELAYED_EVENTS,
            LAST_BLOCK_WITH_RELAYED: metrics.GAUGE_ERC20_LAST_BLOCK_WITH_RELAYED_EVENT
        }, relayerConfig.erc20LockerAddress, true, incentivizer);
        this.relayedConnectorEventsCounter = httpPrometheus.counter('num_relayed_erc20_connector_events', 'Number of relayed ERC20 connector events');
    }

    override getTypeStr(): string {
        return "ERC20Locker";
    }

    override processingLogMsg(isAuroraEvent: boolean): string {
        return isAuroraEvent ? '> Processing ERC20->AuroraERC20 deposit event...'
            : '> Processing ERC20->NEP-141 deposit event...';
    }
}

export class ENearEventRelayer extends EventRelayer {
    constructor(account: Account, ethersProvider: providers.JsonRpcProvider, httpPrometheus: HttpPrometheus,
                dogstatsd: StatsD, incentivizer: Incentivizer) {
        super(account, ethersProvider, dogstatsd, ConnectorType.eNear, {
            NUM_PROCESSED: metrics.GAUGE_ENEAR_NUM_PROCESSED_EVENTS,
            NUM_SKIPPED: metrics.GAUGE_ENEAR_NUM_SKIPPED_EVENTS,
            NUM_RELAYED: metrics.GAUGE_ENEAR_NUM_RELAYED_EVENTS,
            LAST_BLOCK_WITH_RELAYED: metrics.GAUGE_ENEAR_LAST_BLOCK_WITH_RELAYED_EVENT
        }, relayerConfig.eNearAddress, false, incentivizer);

        this.relayedConnectorEventsCounter = httpPrometheus.counter('num_relayed_eNear_connector_events', 'Number of relayed eNEAR connector events');
    }

    override getTypeStr(): string {
        return "eNear";
    }

    override processingLogMsg(): string {
        return '> Processing eNEAR->NEP-141 deposit event...';
    }
}
