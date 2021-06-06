const BN = require('bn.js')
const nearAPI = require('near-api-js');

const { ConnectorType } = require('./utils_eth');
const relayerConfig = require('./json/relayer-config.json');

function getConnectorAccount(connectorType) {
    if (connectorType === ConnectorType.ethCustodian) {
        return relayerConfig.auroraAccount;
    } else if (connectorType === ConnectorType.erc20Locker) {
        return relayerConfig.rainbowTokenFactoryAccount;
    } else if (connectorType === ConnectorType.eNear) {
        return relayerConfig.eNearAccount;
    } else {
        console.log("SHOULD NEVER GET HERE! Connector account not found");
        return null;
    }
}

async function depositProofToNear(nearAccount, connectorType, proof) {
    const connectorContractAddress = getConnectorAccount(connectorType);
    const connector = new nearAPI.Contract(
        nearAccount,
        connectorContractAddress,
        {
            changeMethods: ['deposit']
        }
    );

    const gas_limit = new BN('300' + '0'.repeat(12)); // Gas limit
    const payment_for_storage = new BN('100000000000000000000').mul(new BN('600')); // Attached payment to pay for the storage

    console.log(`Submitting deposit transaction from: ${nearAccount.accountId} account to ${connectorContractAddress}`);
    try {
        await connector.deposit(proof, gas_limit, payment_for_storage);
        console.log(`Submitted.`);
    } catch (error) {
        console.log(error);
    }
}

async function nearIsUsedProof(nearAccount, connectorType, proof) {
    if (connectorType === ConnectorType.eNear) {
        console.log("isUsedProof API is not supported for eNear connector. Submitting the proof...");
        return false;
    }

    const connectorContractAddress = getConnectorAccount(connectorType);
    const nearEvmContract = new nearAPI.Contract(
        nearAccount,
        connectorContractAddress,
        {
            changeMethods: ['is_used_proof'],
        }
    );

    const res = await nearEvmContract.is_used_proof(proof);
    // EthConnector uses borshified params
    const booleanRes = connectorType === ConnectorType.ethCustodian ? Boolean(res.codePointAt(0)) : res;
    return booleanRes;
}

exports.depositProofToNear = depositProofToNear;
exports.nearIsUsedProof = nearIsUsedProof;
