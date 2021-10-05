import dotenv = require('dotenv');

dotenv.config();

import {Contract, ContractInterface, Event, EventFilter, providers} from 'ethers';
import {ConnectorType} from './types';
import ethCustodianAbi from './json/eth-custodian-abi.json';
import erc20LockerAbi from './json/erc20-locker-abi.json';
import eNearAbi from './json/eth-near-abi.json';

function getConnectorABI(connectorType: ConnectorType): ContractInterface {
    if (connectorType === ConnectorType.ethCustodian) {
        return ethCustodianAbi;
    } else if (connectorType === ConnectorType.erc20Locker) {
        return erc20LockerAbi;
    } else if (connectorType === ConnectorType.eNear) {
        return eNearAbi;
    } else {
        console.log("SHOULD NEVER GET HERE! Connector ABI not found");
        return null;
    }
}

function getEventFilter(contract: Contract, connectorType: ConnectorType): EventFilter {
    let eventFilter: EventFilter;

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

export async function getDepositedEventsForBlocks(provider: providers.JsonRpcProvider, contractAddress: string,
    connectorType: ConnectorType, blockNumberFrom: number, blockNumberTo: number): Promise<Array<Event>> {
    const contractABI = getConnectorABI(connectorType);
    const contract = new Contract(contractAddress, contractABI).connect(provider);
    const eventFilter = getEventFilter(contract, connectorType);
    return await contract.queryFilter(eventFilter, blockNumberFrom, blockNumberTo);
}

export function isEventForAurora(nearAuroraAccount: string, eventLog: Event): boolean {
    const recipientMessage = eventLog.args[1];
    const recipientArgs = recipientMessage.split(':');

    if (recipientArgs.length < 2) {
        return false;
    }

    const receiverContract = recipientArgs[0];
    return receiverContract === nearAuroraAccount;
}
