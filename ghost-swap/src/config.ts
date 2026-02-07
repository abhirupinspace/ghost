import { Wallet } from 'ethers'
import { createECDSAMessageSigner } from '@erc7824/nitrolite'
import type { Hex, Address } from 'viem'
import type { LoadedWallet } from './types.ts'

export const CLEARNODE_URL = process.env.CLEARNODE_URL || 'wss://clearnet-sandbox.yellow.com/ws'
export const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org'
export const APP_NAME = 'ghost-swap'
export const BASE_SEPOLIA_CHAIN_ID = 84532
export const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address

// Asset labels used in app session allocations
export const SELL_ASSET = 'eth'
export const BUY_ASSET = 'usdc'

// Deposit amounts per wallet — keep small, wallets have limited funds
export const WALLET_DEPOSITS: Record<string, { token: Address; amount: bigint }> = {
  A: { token: ETH_ADDRESS, amount: BigInt('100000000000000') },    // 0.0001 ETH
  B: { token: ETH_ADDRESS, amount: BigInt('100000000000000') },    // 0.0001 ETH
  C: { token: ETH_ADDRESS, amount: BigInt('100000000000000') },    // 0.0001 ETH
  D: { token: USDC_ADDRESS, amount: BigInt('15000') },             // 0.015 USDC
  F: { token: USDC_ADDRESS, amount: BigInt('10000') },             // 0.01 USDC
}

const PARTICIPANT_NAMES = ['A', 'B', 'C', 'D', 'F'] as const

export interface ConfigResponse {
  broker_address: Address
  networks: {
    chain_id: number
    custody_address: Address
    adjudicator_address: Address
  }[]
}

export function loadServerWallet(): LoadedWallet {
  const key = process.env.SERVER_PRIVATE_KEY
  if (!key) throw new Error('Missing SERVER_PRIVATE_KEY in env')

  const ethersWallet = new Wallet(key)
  return {
    name: 'SERVER',
    address: ethersWallet.address,
    privateKey: key as Hex,
    ethersWallet,
    signer: createECDSAMessageSigner(key as Hex),
  }
}

export function loadParticipantWallets(): LoadedWallet[] {
  const wallets: LoadedWallet[] = []

  for (const name of PARTICIPANT_NAMES) {
    const key = process.env[`WALLET_${name}_PRIVATE_KEY`]
    if (!key) throw new Error(`Missing WALLET_${name}_PRIVATE_KEY in env`)

    const ethersWallet = new Wallet(key)
    wallets.push({
      name,
      address: ethersWallet.address,
      privateKey: key as Hex,
      ethersWallet,
      signer: createECDSAMessageSigner(key as Hex),
    })
  }

  return wallets
}

export function parseConfigResponse(res: unknown): ConfigResponse {
  const r = res as { res: [number, string, ConfigResponse] }
  return r.res[2]
}
