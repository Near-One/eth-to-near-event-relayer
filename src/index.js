require('dotenv').config();

const ethers = require('ethers');

const relayerConfig = require('./json/relayer-config.json');

const nearAPI = require('near-api-js');
const keyStore = new nearAPI.keyStores.UnencryptedFileSystemKeyStore(process.env.NEAR_KEY_STORE_PATH);

const { findProofForEvent } = require('./eth_generate_proof');
const { getDepositedEventsForBlocks, isEventForAurora } = require('./utils_eth');
const { depositProofToNear } = require('./utils_near');

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
    console.log(`Num required EthOnNear client confirmations: ${relayerConfig.numRequiredClientConfirmations} ms`);
    console.log(`Event polling interval: ${relayerConfig.pollingIntervalMs} ms`);

    let currentBlockNumber = blockNumber > 0 ? blockNumber - 1 : 0;

    while (true) {
        const ethOnNearLastBlockNumber = await getEthOnNearLastBlockNumber(relayerNearAccount, relayerConfig.ethOnNearClientAccount);
        const clientLastSafeBlockNumber = ethOnNearLastBlockNumber - relayerConfig.numRequiredClientConfirmations;

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
                    true,
                    blockFrom,
                    blockTo
                );

                if (ethCustodianDepositedEvents.length > 0) {
                    console.log(`Relaying EthCustodian events. Relay only Aurora events: ${relayerConfig.relayOnlyAuroraEvents}`);
                    console.log(`Found ${ethCustodianDepositedEvents.length} EthCustodian deposited events in blocks [${blockFrom}; ${blockTo}]`);

                    for (const eventLog of ethCustodianDepositedEvents) {
                        if (relayerConfig.relayOnlyAuroraEvents) {
                            const isAuroraEvent = isEventForAurora(relayerConfig.auroraAccount, eventLog);
                            if (isAuroraEvent) {
                                console.log('Processing ETH->AuroraETH deposit event...');
                                const proof = await findProofForEvent(ethersProvider, true, eventLog);
                                await depositProofToNear(relayerNearAccount, true, proof);
                            }
                        } else {
                            console.log('Processing ETH->NEP-141 deposit event...');
                            const proof = await findProofForEvent(ethersProvider, true, eventLog);
                            await depositProofToNear(relayerNearAccount, true, proof);
                        }
                    }
                }
            }

            if (relayerConfig.relayERC20Events) {
                const erc20LockerDepositedEvents = await getDepositedEventsForBlocks(
                    ethersProvider,
                    relayerConfig.erc20LockerAddress,
                    false,
                    blockFrom,
                    blockTo
                );

                if (erc20LockerDepositedEvents.length > 0) {
                    console.log(`Relaying ERC20Locker events. Relay only Aurora events: ${relayerConfig.relayOnlyAuroraEvents}`);
                    console.log(`Found ${erc20LockerDepositedEvents.length} ERC20Locker locked events in blocks [${blockFrom}; ${blockTo}]`);

                    for (const eventLog of erc20LockerDepositedEvents) {
                        if (relayerConfig.relayOnlyAuroraEvents) {
                            const isAuroraEvent = isEventForAurora(relayerConfig.auroraAccount, eventLog);
                            if (isAuroraEvent) {
                                console.log('Processing ERC20->AuroraERC20 deposit event...');
                                const proof = await findProofForEvent(ethersProvider, false, eventLog);
                                await depositProofToNear(relayerNearAccount, false, proof);
                            }
                        } else {
                            console.log('Processing ERC20->NEP-141 deposit event...');
                            const proof = await findProofForEvent(ethersProvider, false, eventLog);
                            await depositProofToNear(relayerNearAccount, false, proof);
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
