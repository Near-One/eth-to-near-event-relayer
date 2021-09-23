import { BorshContract, hexToBuffer, readerToHex, Web3 } from 'rainbow-bridge-utils';
import { Account } from 'near-api-js';

export const borshSchema = {
  bool: {
    kind: 'function',
    ser: (b: any) => Buffer.from(Web3.utils.hexToBytes(b ? '0x01' : '0x00')),
    deser: (z: any) => readerToHex(1)(z) === '0x01'
  },
  dagMerkleRootInput: {
    kind: 'struct',
    fields: [['epoch', 'u64']]
  },
  H128: {
    kind: 'function',
    ser: hexToBuffer,
    deser: readerToHex(16)
  },
  H256: {
    kind: 'function',
    ser: hexToBuffer,
    deser: readerToHex(32)
  },
  H512: {
    kind: 'function',
    ser: hexToBuffer,
    deser: readerToHex(64)
  },
  '?H256': {
    kind: 'option',
    type: 'H256'
  },
  '?AccountId': {
    kind: 'option',
    type: 'string'
  }
}

export class EthOnNearClientContract extends BorshContract {
  constructor (account: Account, contractId: string) {
    super(borshSchema, account, contractId, {
      viewMethods: [
        {
          methodName: 'initialized',
          inputFieldType: null,
          outputFieldType: 'bool'
        },
        {
          methodName: 'dag_merkle_root',
          inputFieldType: 'dagMerkleRootInput',
          outputFieldType: 'H128'
        },
        {
          methodName: 'last_block_number',
          inputFieldType: null,
          outputFieldType: 'u64'
        },
        {
          methodName: 'block_hash',
          inputFieldType: 'u64',
          outputFieldType: '?H256'
        },
        {
          methodName: 'known_hashes',
          inputFieldType: 'u64',
          outputFieldType: ['H256']
        },
        {
          methodName: 'block_hash_safe',
          inputFieldType: 'u64',
          outputFieldType: '?H256'
        }
      ],

      changeMethods: [
      ]
    })
  }

  async lastBlockNumber(): Promise<Number> {
    const self: any = this;
    return self.last_block_number();
  }
}
