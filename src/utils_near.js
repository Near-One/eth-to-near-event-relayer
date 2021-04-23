const BN = require('bn.js')
const nearAPI = require('near-api-js');

const relayerConfig = require('./json/relayer-config.json');

async function depositProofToNear(nearAccount, isEthConnector, isNoStd, proof) {
    const connectorContractAddress = isEthConnector ? relayerConfig.ethConnectorAccount : relayerConfig.rainbowTokenFactoryAccount;
    const connector = new nearAPI.Contract(
        nearAccount,
        connectorContractAddress,
        {
            changeMethods: ['deposit']
        }
    );

    const gas_limit = new BN('300000000000000'); // Gas limit
    const payment_for_storage = new BN('100000000000000000000').mul(new BN('600')); // Attached payment to pay for the storage

    console.log(`Submitting deposit transaction from: ${nearAccount.accountId} account to ${connectorContractAddress}`);
    try {
        if (isEthConnector) {
            await connector.deposit({'proof': proof});//, 'gas': gas_limit, 'storage': payment_for_storage});
        } else {
            await connector.deposit(proof, gas_limit, payment_for_storage);
        }

        console.log(`Submitted.`);
    } catch (error) {
        console.log(error);
    }
}

exports.depositProofToNear = depositProofToNear;
