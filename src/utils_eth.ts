import dotenv = require('dotenv');

dotenv.config();

import {Contract, ContractInterface, Event, EventFilter, providers} from 'ethers';
import {ConnectorType} from './types';
import ethCustodianAbi from './json/eth-custodian-abi.json';
import erc20LockerAbi from './json/erc20-locker-abi.json';
import erc271LockerAbi from './json/erc271-locker-abi.json';
import eNearAbi from './json/eth-near-abi.json';
import eFastBridge from './json/eth-fast-bridge-abi.json';

function getConnectorABI(connectorType: ConnectorType): ContractInterface {
    switch (connectorType) {
        case ConnectorType.ethCustodian:
            return ethCustodianAbi;
        case ConnectorType.erc20Locker:
            return erc20LockerAbi;
        case ConnectorType.eNear:
            return eNearAbi;
        case ConnectorType.erc271Locker:
            return erc271LockerAbi;
        case ConnectorType.eFastBridge:
            return eFastBridge
        default:
            console.log("SHOULD NEVER GET HERE! Connector ABI not found");
            return null;
    }
}

function getEventFilter(contract: Contract, connectorType: ConnectorType): EventFilter {
    switch (connectorType) {
        case ConnectorType.ethCustodian:
            return contract.filters.Deposited(null);
        case ConnectorType.erc20Locker:
            return contract.filters.Locked(null);
        case ConnectorType.erc271Locker:
            return contract.filters.Locked(null);
        case ConnectorType.eNear:
            return contract.filters.TransferToNearInitiated(null);
        case ConnectorType.eFastBridge:
            return contract.filters.TransferTokens(null);
        default:
            console.log("SHOULD NEVER GET HERE! Connector EventFilter not found");
            return null;
    }
}

export async function getDepositedEventsForBlocks(provider: providers.JsonRpcProvider, contractAddress: string,
    connectorType: ConnectorType, blockNumberFrom: number, blockNumberTo: number): Promise<Array<Event>> {
    const contractABI = getConnectorABI(connectorType);
    const contract = new Contract(contractAddress, contractABI).connect(provider);
    const eventFilter = getEventFilter(contract, connectorType);
    return await contract.queryFilter(eventFilter, blockNumberFrom, blockNumberTo);
}

export function isEventForAurora(nearAuroraAccount: string, eventLog: Event): boolean {
    const recipientMessage = eventLog.args[1].toString();
    const recipientArgs = recipientMessage.split(':');

    if (recipientArgs.length < 2) {
        return false;
    }

    const receiverContract = recipientArgs[0];
    return receiverContract === nearAuroraAccount;
}
