# ETH-to-NEAR event relayer

The purpose of this app is to relay Ethereum events coming from `ERC20Locker` and `EthCustodian` contracts, build proofs
for each and submit it to NEAR.

## Configuration

1. Install packages:<br/>
`$ yarn install`

2. Set the appropriate `relayerNearAccount` address in `src/json/relayer-config.json` file.

3. Add to the file your RPC endpoint (with or without API key):<br/>
`$ echo "WEB3_RPC_ENDPOINT=YOUR_WEB3_RPC_ENDPOINT_HERE" >> .env`
RPC access can be easily gained from [Alchemy](https://www.alchemyapi.io/).

4. Add path to the Near credentials (e.g. this usually will be at `~/.near-credentials` on Linux <br/>
and `/Users/<user>/.near-credentials` on MacOS: <br/>
`$ echo "NEAR_KEY_STORE_PATH=PATH_TO_YOUR_NEAR_CREDENTIALS_HERE" >> .env`

5. Set the incentivization program if needed in `src/json/relayer-config.json` file.
```
"incentivization": [
    {
        // nDAI - nLINK incentivization programm
        "ethToken": "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
        "bridgedToken": "6B175474E89094C44Da98b954EedeAC495271d0F.factory.bridge.near", // nDAI
        "incentivizationToken": "514910771af9ca656af840dff83e8264ecf986ca.factory.bridge.near", // nLINK
        "incentivizationFactor": 0.001, // 0.1% of $USD value of `bridgedToken`
        "incentivizationTotalCap": 10000 // We assume 10000 nLINK tokens will be delivered to users at max
    },
    {
        // Another incentivization programm here
    }
]
```
## Running

To build relayer run:<br/>
`$ make`

To start relayer run:<br/>
`$ make run START_FROM_BLOCK=<required_block_number_to_start_from_here>`

To restore the last session run:<br/>
`$ make restore-last-session`

Alternatively, you can use the script directly. To get the list of available commands type:<br/>
`$ node src/index.js --help`
