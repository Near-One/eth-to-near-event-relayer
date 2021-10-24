import dotenv = require('dotenv');

dotenv.config();

import {Contract, ContractInterface, Event, EventFilter, providers} from 'ethers';
import {ConnectorType} from './types';
import ethCustodianAbi from './json/eth-custodian-abi.json';
import erc20LockerAbi from './json/erc20-locker-abi.json';
import eNearAbi from './json/eth-near-abi.json';
import {TransactionReceipt} from "@ethersproject/abstract-provider";

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
    const recipientMessage = eventLog.args[1].toString();
    const recipientArgs = recipientMessage.split(':');

    if (recipientArgs.length < 2) {
        return false;
    }

    const receiverContract = recipientArgs[0];
    return receiverContract === nearAuroraAccount;
}

export class LockEvent {
    contractAddress: string;
    sender: string;
    amount: string;
    accountId: string;
    txHash: string;
}

export function getLockEvent(eventLog: Event, receipt: TransactionReceipt): LockEvent {
    if (eventLog.args.length < 4) {
        return null;
    }

    const lockEvent = new LockEvent();
    lockEvent.contractAddress = eventLog.args[0];
    lockEvent.sender = eventLog.args[1];
    lockEvent.amount = String(eventLog.args[2]);
    lockEvent.accountId = eventLog.args[3];
    lockEvent.txHash = receipt.transactionHash;
    return lockEvent;
}


export const erc20Abi = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
];
