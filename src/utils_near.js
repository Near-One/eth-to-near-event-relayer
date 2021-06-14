const BN = require('bn.js')
const nearAPI = require('near-api-js');

const relayerConfig = require('./json/relayer-config.json');

async function depositProofToNear(nearAccount, isEthConnector, proof) {
    const connectorContractAddress = isEthConnector ? relayerConfig.auroraAccount : relayerConfig.rainbowTokenFactoryAccount;
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

async function nearIsUsedProof(nearAccount, isEthConnector, proof) {
    const connectorContractAddress = isEthConnector ? relayerConfig.auroraAccount : relayerConfig.rainbowTokenFactoryAccount;
    const nearEvmContract = new nearAPI.Contract(
        nearAccount,
        connectorContractAddress,
        {
            viewMethods: ['is_used_proof'],
        }
    );

    return await nearEvmContract.is_used_proof(Buffer.from(proof), options = { parse: parseBool });
}

exports.depositProofToNear = depositProofToNear;
exports.nearIsUsedProof = nearIsUsedProof;
