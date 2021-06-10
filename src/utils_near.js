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

async function nearIsUsedProof(nearAccount, isEthConnector, proof) {
    const connectorContractAddress = isEthConnector ? relayerConfig.auroraAccount : relayerConfig.rainbowTokenFactoryAccount;
    const nearEvmContract = new nearAPI.Contract(
        nearAccount,
        connectorContractAddress,
        {
            viewMethods: ['is_used_proof'],
        }
    );

    const res = await nearEvmContract.is_used_proof(proof);
    // EthConnector uses borshified params
    const booleanRes = isEthConnector ? Boolean(res.codePointAt(0)) : res;
    return booleanRes;
}

exports.depositProofToNear = depositProofToNear;
exports.nearIsUsedProof = nearIsUsedProof;
