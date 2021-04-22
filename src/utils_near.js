const nearAPI = require('near-api-js');
const { serializeBorsh } = require('near-api-js/lib/utils/serialize');

const relayerConfig = require('./json/relayer-config.json');

async function depositProofsToNear(nearAccount, isEthConnector, isNoStd, proofs) {
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

    proofs.forEach(function(proof) {
        console.log(`Submitting deposit transaction from: ${nearAccount} account to ${connectorContractAddress}`);
        await connector.deposit({'proof': proof});//, 'gas': gas_limit, 'storage': payment_for_storage});
        console.log(`Submitted.`);
    });
}
