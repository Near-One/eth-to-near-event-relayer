require('dotenv').config();

const ethers = require('ethers');

const ethCustodianAbi = require('./json/eth-custodian-abi.json');
const erc20LockerAbi = require('./json/erc20-locker-abi.json');
const eNearAbi = require('./json/eth-near-abi.json');

const { ConnectorType } = require('./types');

function getConnectorABI(connectorType) {
    let contractABI;

    if (connectorType === ConnectorType.ethCustodian) {
        contractABI = ethCustodianAbi;
    } else if (connectorType === ConnectorType.erc20Locker) {
        contractABI = erc20LockerAbi;
    } else if (connectorType === ConnectorType.eNear) {
        contractABI = eNearAbi;
    } else {
        console.log("SHOULD NEVER GET HERE! Connector ABI not found");
        return null;
    }

    return contractABI;
}

function getEventFilter(contract, connectorType) {
    let eventFilter;

    if (connectorType === ConnectorType.ethCustodian) {
        eventFilter = contract.filters.Deposited(null);
    } else if (connectorType === ConnectorType.erc20Locker) {
        eventFilter = contract.filters.Locked(null);
    } else if (connectorType === ConnectorType.eNear) {
        eventFilter = contract.filters.TransferToNearInitiated(null);
    } else {
        console.log("SHOULD NEVER GET HERE! Connector EventFilter not found");
        return null;
    }

    return eventFilter;
}

async function getDepositedEventsForBlocks(provider, contractAddress, connectorType, blockNumberFrom, blockNumberTo) {
    const contractABI = getConnectorABI(connectorType);
    const contract = new ethers.Contract(contractAddress, contractABI).connect(provider);
    const eventFilter = getEventFilter(contract, connectorType);

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
