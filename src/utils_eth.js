require('dotenv').config();

const ethers = require('ethers');

const ethCustodianAbi = require('./json/eth-custodian-abi.json');
const erc20LockerAbi = require('./json/erc20-locker-abi.json');

async function getDepositedEventsForBlocks(provider, contractAddress, isEthCustodian, blockNumberFrom, blockNumberTo) {
    const signerAccount = new ethers.Wallet(process.env.ROPSTEN_PRIVATE_KEY, provider);
    const contractAbi = isEthCustodian ? ethCustodianAbi : erc20LockerAbi;
    const contract = new ethers.Contract(contractAddress, contractAbi, signerAccount);

    const eventFilter = isEthCustodian
    // TODO: change either to `DepositedToEVM` having new `recipient` with `colon-separator` protocol design or even rename the event to `Deposited`
        ? contract.filters.DepositedToNear(null)
        : contract.filters.Locked(null);
    const depositedEvents = await contract.queryFilter(eventFilter, blockNumberFrom, blockNumberTo);

    return depositedEvents;
}

exports.getDepositedEventsForBlocks = getDepositedEventsForBlocks
