require('dotenv').config();

const ethers = require('ethers');

const ethCustodianAbi = require('./json/eth-custodian-abi.json');
const erc20LockerAbi = require('./json/erc20-locker-abi.json');

async function getDepositedEventsForBlocks(provider, contractAddress, isEthCustodian, blockNumberFrom, blockNumberTo) {
    const contractAbi = isEthCustodian ? ethCustodianAbi : erc20LockerAbi;
    const contract = new ethers.Contract(contractAddress, contractAbi);

    const eventFilter = isEthCustodian
        // TODO: change either to `DepositedToEVM` having new `recipient` with `colon-separator` protocol design or even rename the event to `Deposited`
        ? contract.filters.Deposited(null)
        : contract.filters.Locked(null);
    const depositedEvents = await contract.queryFilter(eventFilter, blockNumberFrom, blockNumberTo);

    return depositedEvents;
}

function isEventForAurora(nearAuroraAccount, eventLog) {
    const recipientMessage = eventLog.args[1];
    const recipientArgs = recipientMessage.split(':');

    if (recipientArgs.length < 2) {
        return false;
    }

    const receiverContract = recipientArgs[0];
    return receiverContract === nearAuroraAccount;
}

exports.getDepositedEventsForBlocks = getDepositedEventsForBlocks;
exports.isEventForAurora = isEventForAurora;
