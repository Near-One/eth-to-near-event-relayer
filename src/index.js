require('dotenv').config();

const ethers = require('ethers');

const StatsD = require('hot-shots');
const dogstatsd = new StatsD();

const relayerConfig = require('./json/relayer-config.json');

const nearAPI = require('near-api-js');
const keyStore = new nearAPI.keyStores.UnencryptedFileSystemKeyStore(process.env.NEAR_KEY_STORE_PATH);

const { findProofForEvent } = require('./eth_generate_proof');
const { getDepositedEventsForBlocks, isEventForAurora } = require('./utils_eth');
const { ConnectorType } = require('./types');
const { depositProofToNear, nearIsUsedProof } = require('./utils_near');

const { HttpPrometheus } = require('../utils/http-prometheus');

const { EthOnNearClientContract } = require('./eth-on-near-client.js');

function sleep(time_ms) {
    return new Promise((empty) => setTimeout(empty, time_ms));
}

async function getEthOnNearLastBlockNumber(nearAccount, ethOnNearClientAccount) {
    const ethOnNearClient = new EthOnNearClientContract(
        nearAccount,
        ethOnNearClientAccount,
    );

    const lastBlockNumber = Number(await ethOnNearClient.last_block_number());
    return lastBlockNumber;
}

async function startRelayerFromBlockNumber(ethersProvider, nearJsonRpc, nearNetwork, blockNumber) {
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
    const relayedEthConnectorEventsCounter = httpPrometheus.counter('num_relayed_eth_connector_events', 'Number of relayed ETH connector events');
    const relayedERC20ConnectorEventsCounter = httpPrometheus.counter('num_relayed_erc20_connector_events', 'Number of relayed ERC20 connector events');
    const relayedENearConnectorEventsCounter = httpPrometheus.counter('num_relayed_eNear_connector_events', 'Number of relayed eNEAR connector events');

    let currentBlockNumber = blockNumber > 0 ? blockNumber - 1 : 0;

    while (true) {
        const currentRelayerBalance = await relayerNearAccount.getAccountBalance().available;
        // Fix this as the balance is of `string` type
        //dogstatsd.gauge('event_relayer.account_near_balance', currentRelayerBalance);

        const ethOnNearLastBlockNumber = await getEthOnNearLastBlockNumber(relayerNearAccount, relayerConfig.ethOnNearClientAccount);
        const clientLastSafeBlockNumber = ethOnNearLastBlockNumber - relayerConfig.numRequiredClientConfirmations;

        ethOnNearLastBlockNumberGauge.set(ethOnNearLastBlockNumber);
        relayerCurrentBlockNumberGauge.set(currentBlockNumber);

        dogstatsd.gauge('eth_on_near_client.current_block_number', ethOnNearLastBlockNumber);
        dogstatsd.gauge('event_relayer.current_block_number', currentBlockNumber);

        //console.log(`Current block number: ${currentBlockNumber}`);
        //console.log(`EthOnNear last block number: ${ethOnNearLastBlockNumber}`);

        if (clientLastSafeBlockNumber > currentBlockNumber) {
            const blockFrom = currentBlockNumber + 1;
            const blockTo = clientLastSafeBlockNumber;

            console.log(`Processing blocks: [${blockFrom}; ${blockTo}]`);

            if (relayerConfig.relayEthConnectorEvents) {
                const ethCustodianDepositedEvents = await getDepositedEventsForBlocks(
                    ethersProvider,
                    relayerConfig.ethCustodianAddress,
                    ConnectorType.ethCustodian,
                    blockFrom,
                    blockTo
                );

                if (ethCustodianDepositedEvents.length > 0) {
                    console.log(`Relaying EthCustodian events. Relay only Aurora events: ${relayerConfig.relayOnlyAuroraEvents}`);
                    console.log(`Found ${ethCustodianDepositedEvents.length} EthCustodian deposited events in blocks [${blockFrom}; ${blockTo}]`);

                    for (const eventLog of ethCustodianDepositedEvents) {
                        const isAuroraEvent = isEventForAurora(relayerConfig.auroraAccount, eventLog);
                        const logMsg = isAuroraEvent ? '> Processing ETH->AuroraETH deposit event...'
                            : '> Processing ETH->NEP-141 deposit event...';

                        if (relayerConfig.relayOnlyAuroraEvents && !isAuroraEvent) {
                            continue;
                        } else {
                            console.log(logMsg);

                            const proof = await findProofForEvent(ethersProvider, ConnectorType.ethCustodian, eventLog);
                            const isUsedProof = await nearIsUsedProof(relayerNearAccount, ConnectorType.ethCustodian, proof);

                            dogstatsd.increment('event_relayer.ETH.num_processed_events');

                            if (isUsedProof) {
                                console.log("Skipped the event as its proof was already used.");
                                dogstatsd.increment('event_relayer.ETH.num_skipped_events');
                                continue;
                            }

                            await depositProofToNear(relayerNearAccount, ConnectorType.ethCustodian, proof);
                            relayedEthConnectorEventsCounter.inc(1);
                            dogstatsd.increment('event_relayer.ETH.num_relayed_events');
                            dogstatsd.gauge('event_relayer.ETH.last_block_with_relayed_event', eventLog.blockNumber);
                        }
                    }
                }
            }

            if (relayerConfig.relayERC20Events) {
                const erc20LockerDepositedEvents = await getDepositedEventsForBlocks(
                    ethersProvider,
                    relayerConfig.erc20LockerAddress,
                    ConnectorType.erc20Locker,
                    blockFrom,
                    blockTo
                );

                if (erc20LockerDepositedEvents.length > 0) {
                    console.log(`Relaying ERC20Locker events. Relay only Aurora events: ${relayerConfig.relayOnlyAuroraEvents}`);
                    console.log(`Found ${erc20LockerDepositedEvents.length} ERC20Locker locked events in blocks [${blockFrom}; ${blockTo}]`);

                    for (const eventLog of erc20LockerDepositedEvents) {
                        const isAuroraEvent = isEventForAurora(relayerConfig.auroraAccount, eventLog);
                        const logMsg = isAuroraEvent ? '> Processing ERC20->AuroraERC20 deposit event...'
                            : '> Processing ERC20->NEP-141 deposit event...';

                        if (relayerConfig.relayOnlyAuroraEvents && !isAuroraEvent) {
                            continue;
                        } else {
                            console.log(logMsg);

                            const proof = await findProofForEvent(ethersProvider, ConnectorType.erc20Locker, eventLog);
                            const isUsedProof = await nearIsUsedProof(relayerNearAccount, ConnectorType.erc20Locker, proof);

                            dogstatsd.increment('event_relayer.erc20.num_processed_events');

                            if (isUsedProof) {
                                console.log("Skipped the event as its proof was already used.");
                                dogstatsd.increment('event_relayer.erc20.num_skipped_events');
                                continue;
                            }

                            await depositProofToNear(relayerNearAccount, ConnectorType.erc20Locker, proof);
                            relayedERC20ConnectorEventsCounter.inc(1);
                            dogstatsd.increment('event_relayer.erc20.num_relayed_events');
                            dogstatsd.gauge('event_relayer.erc20.last_block_with_relayed_event', eventLog.blockNumber);
                        }
                    }
                }
            }

            if (relayerConfig.relayENearEvents) {
                const eNearDepositedEvents = await getDepositedEventsForBlocks(
                    ethersProvider,
                    relayerConfig.eNearAddress,
                    ConnectorType.eNear,
                    blockFrom,
                    blockTo
                );

                if (eNearDepositedEvents.length > 0) {
                    console.log(`Relaying eNear events.`);
                    console.log(`Found ${eNearDepositedEvents.length} eNear locked events in blocks [${blockFrom}; ${blockTo}]`);

                    for (const eventLog of eNearDepositedEvents) {
                        const isAuroraTransferSupported = false; // not available yet
                        const isAuroraEvent = false;
                        const logMsg = '> Processing eNEAR->NEP-141 deposit event...';

                        if (isAuroraTransferSupported && relayerConfig.relayOnlyAuroraEvents && !isAuroraEvent) {
                            continue;
                        } else {
                            console.log(logMsg);

                            const proof = await findProofForEvent(ethersProvider, ConnectorType.eNear, eventLog);
                            const isUsedProof = await nearIsUsedProof(relayerNearAccount, ConnectorType.eNear, proof);

                            dogstatsd.increment('event_relayer.eNEAR.num_processed_events');

                            if (isUsedProof) {
                                console.log("Skipped the event as its proof was already used.");
                                dogstatsd.increment('event_relayer.eNEAR.num_skipped_events');
                                continue;
                            }

                            await depositProofToNear(relayerNearAccount, ConnectorType.eNear, proof);
                            relayedENearConnectorEventsCounter.inc(1);
                            dogstatsd.increment('event_relayer.eNEAR.num_relayed_events');
                            dogstatsd.gauge('event_relayer.eNEAR.last_block_with_relayed_event', eventLog.blockNumber);
                        }
                    }
                }
            }

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

        await sleep(relayerConfig.pollingIntervalMs);
    }
}

async function main() {
    if (process.argv.length != 3) {
        console.log("Incorrect usage of the script. Please call:");
        console.log("$ node", process.argv[1], "<eth_block_number_to_start_from>");
        return;
    }
    const blockNumberFrom = process.argv[2];

    const url = process.env.WEB3_RPC_ENDPOINT;
    const ethersProvider = new ethers.providers.JsonRpcProvider(url);

    await startRelayerFromBlockNumber(
        ethersProvider,
        relayerConfig.nearJsonRpc,
        relayerConfig.nearNetwork,
        blockNumberFrom,
    );
}


main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    })
