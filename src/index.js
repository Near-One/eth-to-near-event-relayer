require('dotenv').config();

const ethers = require('ethers');

const relayerConfig = require('./json/relayer-config.json');
const ethCustodianAbi = require('./json/eth-custodian-abi.json');
const erc20LockerAbi = require('./json/erc20-locker-abi.json');
const ETH_CUSTODIAN = "0x4dE5E423CA193dF67081A1BAb17d253B55d63688";

// NEAR keystore init
const nearAPI = require('near-api-js');
const keyStore = new nearAPI.keyStores.UnencryptedFileSystemKeyStore(NEAR_KEY_STORE_PATH);

const { findProofForEvent } = require('./eth_generate_proof');
const { getDepositedEventsForBlocks } = require('./utils_eth');
const { depositProofsToNear } = require('./utils_near');

// Relayer config:
// "ethCustodianAddress": "0xcafe.."
// "erc20LockerAddress": "0xabcd.."
// "ethOnNearClientAccount": "eth-client.near",
// "relayerNearAccount": "relayerWhichPaysForTxs.near"
// "rainbowTokenFactoryAccount": "factory.bridge.near"
// "ethConnectorAccount": "eth-connector.bridge.near"

async function getEthOnNearLastBlockNumber(nearAccount, ethOnNearClientAccount) {
    const ethOnNearClient = new nearAPI.Contract(
        nearAccount,
        ethOnNearClientAccount,
        {
            viewMethods: ['initialized', 'last_block_number'],
        }
    );

    const lastBlockNumber = await ethOnNearClient.last_block_number();
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

    let currentBlockNumber = blockNumber > 0 ? blockNumber - 1 : 0;
    const ethOnNearLastBlockNumber = getEthOnNearLastBlockNumber(nearAccount, relayerConfig.ethOnNearClientAccount);

    if (ethOnNearLastBlockNumber > currentBlockNumber) {
        const blockFrom = currentBlockNumber + 1;
        const blockTo = ethOnNearLastBlockNumber;

        console.log(`Processing blocks: [${blockFrom}; ${blockTo}]`);

        const relayEth = true;
        if (relayEth) {
            const ethCustodianDepositedEvents = getDepositedEventsForBlocks(
                ethersProvider,
                relayerConfig.ethCustodianAddress,
                true,
                blockFrom,
                blockTo
            );

            if (ethCustodianDepositedEvents.length > 0) {
                console.log('Relaying EthCustodian events.');
                console.log(`Found ${ethCustodianDepositedEvents.length} EthCustodian deposited events in blocks [${blockFrom}; ${blockTo}]`);
            }

            const ethCustodianDepositedProofs = await Promise.all(
                ethCustodianDepositedEvents.map(eventLog => findProofForEvent(ethersProvider, true, eventLog))
            );

            await depositProofsToNear(relayerNearAccount, true, ethCustodianDepositedProofs);
        }

        const relayERC20 = false;
        if (relayERC20) {
            const erc20LockerDepositedEvents = getDepositedEventsForBlocks(
                ethersProvider,
                relayerConfig.erc20LockerAddress,
                false,
                blockFrom,
                blockTo
            );

            if (ethCustodianDepositedEvents.length > 0) {
                console.log('Relaying ERC20Locker events.');
                console.log(`Found ${erc20LockerDepositedEvents.length} ERC20Locker locked events in blocks [${blockFrom}; ${blockTo}]`);
            }

            const erc20LockerDepositedProofs = await Promise.all(
                erc20LockerDepositedEvents.map(eventLog => findProofForEvent(ethersProvider, false, eventLog))
            );

            await depositProofsToNear(relayerNearAccount, false, erc20LockerDepositedProofs);
        }

        console.log('--------------------------------------------------------------------------------');
    }
}
