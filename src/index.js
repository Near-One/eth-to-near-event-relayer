require('dotenv').config();

const ethers = require('ethers');

const relayerConfig = require('./json/relayer-config.json');

const nearAPI = require('near-api-js');
const keyStore = new nearAPI.keyStores.UnencryptedFileSystemKeyStore(process.env.NEAR_KEY_STORE_PATH);

const { findProofForEvent } = require('./eth_generate_proof');
const { getDepositedEventsForBlocks } = require('./utils_eth');
const { depositProofToNear } = require('./utils_near');

const { EthOnNearClientContract } = require('./eth-on-near-client.js');

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

    let currentBlockNumber = blockNumber > 0 ? blockNumber - 1 : 0;
    const ethOnNearLastBlockNumber = await getEthOnNearLastBlockNumber(relayerNearAccount, relayerConfig.ethOnNearClientAccount);

    console.log(`Current block number: ${currentBlockNumber}`);
    console.log(`EthOnNear last block number: ${ethOnNearLastBlockNumber}`);
    if (ethOnNearLastBlockNumber > currentBlockNumber) {
        const blockFrom = currentBlockNumber + 1;
        const blockTo = ethOnNearLastBlockNumber;

        console.log(`Processing blocks: [${blockFrom}; ${blockTo}]`);

        const relayEth = true;
        if (relayEth) {
            const ethCustodianDepositedEvents = await getDepositedEventsForBlocks(
                ethersProvider,
                relayerConfig.ethCustodianAddress,
                true,
                blockFrom,
                blockTo
            );

            if (ethCustodianDepositedEvents.length > 0) {
                console.log('Relaying EthCustodian events.');
                console.log(`Found ${ethCustodianDepositedEvents.length} EthCustodian deposited events in blocks [${blockFrom}; ${blockTo}]`);

                for (const eventLog of ethCustodianDepositedEvents) {
                    const proof = await findProofForEvent(ethersProvider, true, eventLog);
                    await depositProofToNear(relayerNearAccount, true, false, proof);
                }
            }
        }

        const relayERC20 = false;
        if (relayERC20) {
            const erc20LockerDepositedEvents = await getDepositedEventsForBlocks(
                ethersProvider,
                relayerConfig.erc20LockerAddress,
                false,
                blockFrom,
                blockTo
            );

            if (ethCustodianDepositedEvents.length > 0) {
                console.log('Relaying ERC20Locker events.');
                console.log(`Found ${erc20LockerDepositedEvents.length} ERC20Locker locked events in blocks [${blockFrom}; ${blockTo}]`);

                for (const eventLog of erc20LockerDepositedEvents) {
                    const proof = await findProofForEvent(ethersProvider,false, eventLog);
                    await depositProofToNear(relayerNearAccount, false, false, proof);
                }
            }
        }

        console.log('--------------------------------------------------------------------------------');
    }
}

async function main() {
    const url = process.env.ETH_PROVIDER_URL;
    const ethersProvider = new ethers.providers.JsonRpcProvider(url);

    const blockNumberFrom = 10088970;
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
