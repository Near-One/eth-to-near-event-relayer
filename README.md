# ETH-to-NEAR event relayer

The purpose of this app is to relay Ethereum events coming from `ERC20Locker` and `EthCustodian` contracts, build proofs
for each and submit it to NEAR.

## Configuration

Install packages:<br/>
`$ yarn install`

## Running

To start relayer run:<br/>
`$ make run START_FROM_BLOCK=<required_block_number_to_start_from_here>`
