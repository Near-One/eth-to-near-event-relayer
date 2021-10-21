import * as dotenv from 'dotenv';
import * as metrics from './metrics';
import {getLastSessionBlockNumber, isLastSessionExists, recordSession} from './utils_relayer';
import {balanceNearYoctoToNano} from './utils_near';
import {HttpPrometheus} from '../utils/http-prometheus';
import {EthOnNearClientContract} from './eth-on-near-client';
import {ENearEventRelayer, ERC20EventRelayer, EthEventRelayer, EventRelayer} from "./event_relayer"
import * as ethers from 'ethers';
import {StatsD} from 'hot-shots';
import relayerConfig from './json/relayer-config.json';
import * as nearAPI from 'near-api-js';
import yargs from 'yargs';
import * as dbManager from './db_manager'
import {Incentivizer} from "./incentivizer";
import incentivizationConfig from "./json/incentivization-config.json";

dotenv.config();

class RelayerApp {
    private relayEvents: Array<EventRelayer> = [];
    private isShouldClose = false;
    private sleepPromiseResolve = null;

    async start() {
        await dbManager.open();
        const argv = yargs(process.argv.slice(2))
            .example('$0 --start-from-block 1234', 'Start the event-relayer from the given block number')
            .example('$0 --restore-last-session', 'Start the event-relayer restoring the latest session')
            .boolean(['restore-last-session'])
            .describe('start-from-block', 'The block number from which to start relaying')
            .help('h')
            .alias('h', 'help')
            .parseSync();

        let blockNumberFrom = 0;

        if (argv.restoreLastSession) {
            console.log(`Restarting from the last session...`);

            if (!isLastSessionExists()) {
                throw 'Session file does not exist! Can not restore from the last session';
            }

            blockNumberFrom = getLastSessionBlockNumber();
        } else if (!argv.startFromBlock) {
            console.log('Incorrect usage of the script. `start-from-block` variable is not specified');
        } else {
            blockNumberFrom = Number(argv.startFromBlock);
        }

        const url = process.env.WEB3_RPC_ENDPOINT;
        const ethersProvider = new ethers.providers.JsonRpcProvider(url);

        await this.startRelayerFromBlockNumber(
            ethersProvider,
            relayerConfig.nearJsonRpc,
            relayerConfig.nearNetwork,
            blockNumberFrom,
        );

        await dbManager.close();
    }

    close() {
        this.isShouldClose = true;
        if (this.sleepPromiseResolve != null)
            this.sleepPromiseResolve();

        for (const relay of this.relayEvents) {
            relay.close();
        }
    }

    private static async getEthOnNearLastBlockNumber(nearAccount: nearAPI.Account, ethOnNearClientAccount: string) {
        const ethOnNearClient = new EthOnNearClientContract(
            nearAccount,
            ethOnNearClientAccount,
        );

        return Number(await ethOnNearClient.lastBlockNumber());
    }

    private async startRelayerFromBlockNumber(ethersProvider: ethers.providers.JsonRpcProvider, nearJsonRpc: string, nearNetwork: string, blockNumber: number) {
        const dogstatsd = new StatsD();
        const keyStore = new nearAPI.keyStores.UnencryptedFileSystemKeyStore(process.env.NEAR_KEY_STORE_PATH);
        const near = await nearAPI.connect({
            deps: {
                keyStore,
            },
            nodeUrl: nearJsonRpc,
            networkId: nearNetwork
        });

        const relayerNearAccount = await near.account(relayerConfig.relayerNearAccount);
        const accountBalance = await relayerNearAccount.getAccountBalance();
        const availableAccountBalance = nearAPI.utils.format.formatNearAmount(accountBalance.available);
        console.log(`Account balance of ${relayerNearAccount.accountId}: ${availableAccountBalance} NEAR`);
        console.log(`Num required EthOnNear client confirmations: ${relayerConfig.numRequiredClientConfirmations} s`);
        console.log(`Event polling interval: ${relayerConfig.pollingIntervalMs} ms`);

        const httpPrometheus = new HttpPrometheus(58000, 'eth_to_near_event_relayer_');
        const ethOnNearLastBlockNumberGauge = httpPrometheus.gauge('eth_on_near_client_block_number', 'Current EthOnNear client block number');
        const relayerCurrentBlockNumberGauge = httpPrometheus.gauge('event_relayer_current_block_number', 'Current EthToNearEventRelayer block number');

        let currentBlockNumber = blockNumber > 0 ? blockNumber - 1 : 0;

        const incentivizer = new Incentivizer(relayerNearAccount);
        incentivizer.init(incentivizationConfig.rules);

        if (relayerConfig.relayEthConnectorEvents) {
            this.relayEvents.push(new EthEventRelayer(relayerNearAccount, ethersProvider, httpPrometheus, dogstatsd, incentivizer));
        }

        if (relayerConfig.relayERC20Events) {
            this.relayEvents.push(new ERC20EventRelayer(relayerNearAccount, ethersProvider, httpPrometheus, dogstatsd, incentivizer));
        }

        if (relayerConfig.relayENearEvents) {
            this.relayEvents.push(new ENearEventRelayer(relayerNearAccount, ethersProvider, httpPrometheus, dogstatsd, incentivizer));
        }

        while (!this.isShouldClose) {
            recordSession(currentBlockNumber);

            const currentRelayerNearBalance = await relayerNearAccount.getAccountBalance();
            const currentRelayerNanoNearBalance = balanceNearYoctoToNano(currentRelayerNearBalance.available);
            dogstatsd.gauge(metrics.GAUGE_EVENT_RELAYER_ACCOUNT_NEAR_BALANCE, currentRelayerNanoNearBalance);

            const ethOnNearLastBlockNumber = await RelayerApp.getEthOnNearLastBlockNumber(relayerNearAccount, relayerConfig.ethOnNearClientAccount);
            const clientLastSafeBlockNumber = ethOnNearLastBlockNumber - relayerConfig.numRequiredClientConfirmations;

            ethOnNearLastBlockNumberGauge.set(ethOnNearLastBlockNumber);
            relayerCurrentBlockNumberGauge.set(currentBlockNumber);

            dogstatsd.gauge(metrics.GAUGE_CLIENT_ETH_TO_NEAR_CURRENT_BLOCK_NUMBER, ethOnNearLastBlockNumber);
            dogstatsd.gauge(metrics.GAUGE_EVENT_RELAYER_CURRENT_BLOCK_NUMBER, currentBlockNumber);

            if (clientLastSafeBlockNumber > currentBlockNumber) {
                const blockFrom = currentBlockNumber + 1;
                const blockTo = clientLastSafeBlockNumber;

                console.log(`Processing blocks: [${blockFrom}; ${blockTo}]`);

                for (const relay of this.relayEvents) {
                    if (! this.isShouldClose)
                        await relay.processEvent(blockFrom, blockTo);
                }

                if (this.isShouldClose)
                    return;

                currentBlockNumber = clientLastSafeBlockNumber;

                console.log('--------------------------------------------------------------------------------');
            } else if (currentBlockNumber > ethOnNearLastBlockNumber) {
                console.log(`=> It seems that EthOnNearClient is not synced. `
                    + `Current relayer block height: ${currentBlockNumber}; `
                    + `EthOnNearClient block height: ${ethOnNearLastBlockNumber}`);
            } else {
                console.log(`=> Waiting for the new blocks in EthOnNearClient. `
                    + `Current relayer block height: ${currentBlockNumber}; `
                    + `EthOnNearClient block height: ${ethOnNearLastBlockNumber}. `
                    + `Required num confirmations: ${relayerConfig.numRequiredClientConfirmations}`);
            }

            await new Promise((resolve) => {
                this.sleepPromiseResolve = resolve;
                setTimeout(resolve, relayerConfig.pollingIntervalMs);
            });
        }
    }
}

const relayerApp = new RelayerApp();

relayerApp.start()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    dbManager.close().then(() => {
        process.exit(1);
    });
})

process.on('SIGTERM', () => {
    relayerApp.close();
});

process.on('SIGINT', () => {
    relayerApp.close();
});
