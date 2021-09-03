const BN = require('bn.js')
const nearAPI = require('near-api-js');

const { ConnectorType } = require('./types');
const relayerConfig = require('./json/relayer-config.json');

const NEAR_YOCTO_TO_NANO = new BN(10).pow(new BN(15))

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

async function getConnector(nearAccount, connectorType) {
    const connectorContractAddress = getConnectorAccount(connectorType);
    const contractChangeMethods = (connectorType === ConnectorType.eNear) ? ['finalise_eth_to_near_transfer'] : ['deposit'];
    const connector = new nearAPI.Contract(
        nearAccount,
        connectorContractAddress,
        {
            changeMethods: contractChangeMethods,
        }
    );
    return connector;
}

async function depositProofToNear(nearAccount, connectorType, proof) {
    const connectorContractAddress = getConnectorAccount(connectorType);
    const connector = await getConnector(nearAccount, connectorType);

    const gas_limit = new BN('300' + '0'.repeat(12)); // Gas limit
    const payment_for_storage = new BN('100000000000000000000').mul(new BN('600')); // Attached payment to pay for the storage

    console.log(`Submitting deposit transaction from: ${nearAccount.accountId} account to ${connectorContractAddress}`);
    try {
        if (connectorType === ConnectorType.eNear) {
            await connector.finalise_eth_to_near_transfer(proof, gas_limit, payment_for_storage);
        } else {
            await connector.deposit(proof, gas_limit, payment_for_storage);
        }
        console.log(`Submitted.`);
    } catch (error) {
        console.log(error);
    }
}

function parseBool(data) {
    // Try to deserialize first as borsh
    if (data.length === 1) {
        if (data[0] === 0)
            return false;
        else if (data[0] === 1)
            return true;
    }

    return JSON.parse(Buffer.from(data).toString());
}

async function nearIsUsedProof(nearAccount, connectorType, proof) {
    const connectorContractAddress = getConnectorAccount(connectorType);
    const nearEvmContract = new nearAPI.Contract(
        nearAccount,
        connectorContractAddress,
        {
            viewMethods: ['is_used_proof'],
        }
    );

    return await nearEvmContract.is_used_proof(Buffer.from(proof), options = { parse: parseBool });
}

function balanceNearYoctoToNano(balanceYocto) {
    const balanceNanoNear = new BN(balanceYocto).div(NEAR_YOCTO_TO_NANO).toNumber()
    return balanceNanoNear;
}

exports.depositProofToNear = depositProofToNear;
exports.nearIsUsedProof = nearIsUsedProof;
exports.balanceNearYoctoToNano = balanceNearYoctoToNano;
