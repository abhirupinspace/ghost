import {
  createWalletClient,
  createPublicClient,
  http,
  formatEther,
  formatUnits,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import {
  createEIP712AuthMessageSigner,
  createAuthRequestMessage,
  createAuthVerifyMessageFromChallenge,
  createGetConfigMessageV2,
  createGetChannelsMessageV2,
  createCloseChannelMessage,
  createCreateChannelMessage,
  createResizeChannelMessage,
  StateIntent,
  type CloseChannelParams,
  type FinalState,
  type ResizeChannelParams,
  type RPCAppSessionAllocation,
} from '@erc7824/nitrolite'
import type { LoadedWallet } from './types.ts'
import { createNitroliteClient, buildCreateChannelParams, type CreateChannelResponse } from './channel.ts'
import {
  CLEARNODE_URL,
  RPC_URL,
  APP_NAME,
  BASE_SEPOLIA_CHAIN_ID,
  ETH_ADDRESS,
  USDC_ADDRESS,
  WALLET_DEPOSITS,
  parseConfigResponse,
  type ConfigResponse,
} from './config.ts'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

function assetToToken(asset: string): Address {
  if (asset === 'eth') return ETH_ADDRESS
  if (asset === 'usdc') return USDC_ADDRESS
  throw new Error(`Unknown asset: ${asset}`)
}

// --- WS client for close channel RPC ---

class CloseClient {
  private ws: WebSocket | null = null
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(CLEARNODE_URL)
      this.ws.onopen = () => resolve()
      this.ws.onerror = (e) => reject(new Error(`WebSocket error: ${e}`))
      this.ws.onmessage = (event) => this.handleMessage(event.data as string)
    })
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data)
      const reqId = msg.res?.[0] ?? msg.req?.[0]
      if (reqId && this.pending.has(reqId)) {
        const p = this.pending.get(reqId)!
        this.pending.delete(reqId)
        if (msg.res?.[1] === 'error') {
          p.reject(new Error(msg.res[2].error))
        } else {
          p.resolve(msg)
        }
      }
    } catch {
      // ignore
    }
  }

  async send(message: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket not connected'))
      }
      const parsed = JSON.parse(message)
      const reqId = parsed.req?.[0]
      if (reqId) {
        this.pending.set(reqId, { resolve, reject })
      }
      this.ws.send(message)
    })
  }

  async authenticate(wallet: LoadedWallet): Promise<void> {
    const walletAddress = wallet.address as Address
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400)

    const authReq = await createAuthRequestMessage({
      address: walletAddress,
      session_key: walletAddress,
      application: APP_NAME,
      allowances: [],
      expires_at: expiresAt,
      scope: 'console',
    })

    const challengeRes = await this.send(authReq) as { res: [number, string, { challenge_message: string }] }
    if (challengeRes.res[1] !== 'auth_challenge') {
      throw new Error('Auth failed: expected auth_challenge')
    }

    const account = privateKeyToAccount(wallet.privateKey)
    const viemWalletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(),
    })

    const eip712Signer = createEIP712AuthMessageSigner(
      viemWalletClient,
      {
        scope: 'console',
        session_key: walletAddress,
        expires_at: expiresAt,
        allowances: [],
      },
      { name: APP_NAME }
    )

    const verifyMsg = await createAuthVerifyMessageFromChallenge(
      eip712Signer,
      challengeRes.res[2].challenge_message
    )
    const verifyRes = await this.send(verifyMsg) as { res: [number, string, { success: boolean }] }
    if (!verifyRes.res[2].success) {
      throw new Error('Auth verify failed')
    }
  }

  async getChannels(walletAddress: Address): Promise<any[]> {
    const msg = createGetChannelsMessageV2(walletAddress)
    const res = await this.send(msg) as { res: [number, string, { channels: any[] }] }
    return res.res[2].channels ?? []
  }

  async closeChannelRPC(wallet: LoadedWallet, channelId: Hex): Promise<any> {
    const msg = await createCloseChannelMessage(wallet.signer, channelId, wallet.address as Address)
    const res = await this.send(msg) as { res: [number, string, any] }
    return res.res[2]
  }

  async createChannelRPC(wallet: LoadedWallet, chainId: number, token: Address): Promise<CreateChannelResponse> {
    const msg = await createCreateChannelMessage(wallet.signer, {
      chain_id: chainId,
      token,
    })
    const res = await this.send(msg) as { res: [number, string, CreateChannelResponse] }
    return res.res[2]
  }

  async resizeChannelRPC(wallet: LoadedWallet, channelId: Hex, allocateAmount: bigint): Promise<any> {
    const msg = await createResizeChannelMessage(wallet.signer, {
      channel_id: channelId,
      allocate_amount: allocateAmount,
      funds_destination: wallet.address as Address,
    })
    const res = await this.send(msg) as { res: [number, string, any] }
    return res.res[2]
  }

  async getConfig(): Promise<ConfigResponse> {
    const msg = createGetConfigMessageV2()
    const res = await this.send(msg)
    return parseConfigResponse(res)
  }

  close(): void {
    this.ws?.close()
  }
}

// --- Channel verification helper ---

export async function waitForAllChannels(wallets: LoadedWallet[]): Promise<void> {
  console.log('  Verifying ClearNode detected all channels...')
  for (const wallet of wallets) {
    const client = new CloseClient()
    await client.connect()
    try {
      await client.authenticate(wallet)
      for (let attempt = 0; attempt < 60; attempt++) {
        const channels = await client.getChannels(wallet.address as Address)
        const openChannels = channels.filter((c: any) => c.status === 'open')
        if (openChannels.length > 0) {
          console.log(`    ${wallet.name}: channel detected`)
          break
        }
        if (attempt === 59) {
          throw new Error(`ClearNode never detected channel for ${wallet.name} — restart ClearNode and retry`)
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
    } finally {
      client.close()
    }
  }
  console.log('  All channels verified.\n')
}

// --- On-chain balance helper ---

export async function printOnChainBalances(label: string, wallets: LoadedWallet[]): Promise<void> {
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) })

  console.log(`\n  ${label}`)
  console.log(`  ${'Wallet'.padEnd(8)} ${'ETH'.padStart(22)} ${'USDC'.padStart(12)}`)
  console.log(`  ${'─'.repeat(8)} ${'─'.repeat(22)} ${'─'.repeat(12)}`)

  for (const w of wallets) {
    const [ethBal, usdcBal] = await Promise.all([
      publicClient.getBalance({ address: w.address as Address }),
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [w.address as Address],
      }),
    ])
    console.log(`  ${w.name.padEnd(8)} ${formatEther(ethBal).padStart(22)} ${formatUnits(usdcBal, 6).padStart(12)}`)
  }
}

// --- Close channels & withdraw from custody ---

async function closeWalletChannels(
  wallet: LoadedWallet,
  config: ConfigResponse,
  finalAllocations?: RPCAppSessionAllocation[],
): Promise<void> {
  console.log(`\n  ${wallet.name} (${wallet.address})`)

  const client = new CloseClient()
  await client.connect()

  try {
    await client.authenticate(wallet)

    const channels = await client.getChannels(wallet.address as Address)
    const openChannels = channels.filter((c: any) => c.status === 'open')

    console.log(`    ${openChannels.length} open channel(s)`)

    const network = config.networks.find((n) => n.chain_id === BASE_SEPOLIA_CHAIN_ID)
    if (!network) throw new Error(`Network ${BASE_SEPOLIA_CHAIN_ID} not in config`)

    const nitroliteClient = createNitroliteClient(wallet.privateKey, {
      custody: network.custody_address,
      adjudicator: network.adjudicator_address,
    })

    for (const ch of openChannels) {
      const chId = ch.channelId ?? ch.channel_id
      console.log(`    Closing ${chId.slice(0, 18)}...`)

      const closeRes = await client.closeChannelRPC(wallet, chId)
      const state = closeRes.state
      console.log(`    Close state allocations:`, JSON.stringify(state.allocations.map((a: any) => ({ dest: a.destination.slice(0, 10), token: a.token.slice(0, 10), amount: a.amount.toString() }))))

      const finalState: FinalState = {
        channelId: closeRes.channelId ?? closeRes.channel_id,
        intent: StateIntent.FINALIZE,
        version: BigInt(state.version),
        data: state.stateData ?? state.state_data,
        allocations: state.allocations.map((a: any) => ({
          destination: a.destination,
          token: a.token,
          amount: BigInt(a.amount),
        })),
        serverSignature: closeRes.serverSignature ?? closeRes.server_signature,
      }

      const stateData = state.stateData ?? state.state_data
      const params: CloseChannelParams = { stateData, finalState }
      const txHash = await nitroliteClient.closeChannel(params)
      console.log(`    Closed: ${txHash}`)
    }

    // Wait for ClearNode to see all channel closes before Phase 2
    if (openChannels.length > 0) {
      console.log(`    Waiting for ClearNode to confirm closes...`)
      for (let attempt = 0; attempt < 30; attempt++) {
        const remaining = await client.getChannels(wallet.address as Address)
        if (remaining.filter((c: any) => c.status === 'open').length === 0) break
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    // Phase 2: Create + close withdrawal channels for swapped tokens
    if (finalAllocations) {
      const deposit = WALLET_DEPOSITS[wallet.name]
      const originalToken = deposit?.token
      const addr = wallet.address.toLowerCase()

      // Find positive balances in tokens OTHER than what wallet originally deposited
      for (const alloc of finalAllocations) {
        if (alloc.participant.toLowerCase() !== addr) continue
        if (parseFloat(alloc.amount) <= 0) continue

        const allocToken = assetToToken(alloc.asset)
        if (allocToken === originalToken) continue // skip original token

        const symbol = allocToken === ETH_ADDRESS ? 'ETH' : 'USDC'
        console.log(`    Creating withdrawal channel for swapped ${symbol}...`)

        const channelRes = await client.createChannelRPC(wallet, BASE_SEPOLIA_CHAIN_ID, allocToken)
        console.log(`    Withdrawal channel: ${channelRes.channel_id.slice(0, 18)}...`)
        console.log(`    Channel create allocations:`, JSON.stringify(channelRes.state.allocations.map((a: any) => ({ dest: a.destination.slice(0, 10), token: a.token.slice(0, 10), amount: a.amount.toString() }))))

        const chParams = buildCreateChannelParams(channelRes)
        const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) })

        const createResult = await nitroliteClient.createChannel(chParams)
        console.log(`    Created: ${createResult.txHash}`)
        await publicClient.waitForTransactionReceipt({ hash: createResult.txHash })
        const withdrawalInitialState = createResult.initialState

        // Checkpoint to transition INITIAL→ACTIVE (use ClearNode's channelId)
        console.log(`    Checkpointing...`)
        const cpHash = await nitroliteClient.checkpointChannel({
          channelId: channelRes.channel_id,
          candidateState: withdrawalInitialState,
        })
        await publicClient.waitForTransactionReceipt({ hash: cpHash })

        // Wait for ClearNode to see the channel
        console.log(`    Waiting for ClearNode to detect channel...`)
        for (let attempt = 0; attempt < 30; attempt++) {
          const chs = await client.getChannels(wallet.address as Address)
          if (chs.some((c: any) => (c.channelId ?? c.channel_id) === channelRes.channel_id)) break
          await new Promise((r) => setTimeout(r, 2000))
        }

        // Resize channel to increase RawAmount (backed by ledger balance)
        const decimals = allocToken === ETH_ADDRESS ? 18 : 6
        const rawAmount = parseUnits(alloc.amount, decimals)
        console.log(`    Resizing channel with ${alloc.amount} ${symbol} (raw: ${rawAmount})...`)

        const resizeRes = await client.resizeChannelRPC(wallet, channelRes.channel_id, rawAmount)
        const resizeState = resizeRes.state
        console.log(`    Resize allocations:`, JSON.stringify(resizeState.allocations.map((a: any) => ({ dest: a.destination?.slice(0, 10), amount: a.amount?.toString() }))))

        const resizeFinalState: FinalState = {
          channelId: resizeRes.channelId ?? resizeRes.channel_id,
          intent: StateIntent.RESIZE,
          version: BigInt(resizeState.version),
          data: resizeState.stateData ?? resizeState.state_data,
          allocations: resizeState.allocations.map((a: any) => ({
            destination: a.destination,
            token: a.token,
            amount: BigInt(a.amount),
          })),
          serverSignature: resizeRes.serverSignature ?? resizeRes.server_signature,
        }

        const resizeParams: ResizeChannelParams = {
          resizeState: resizeFinalState,
          proofStates: [withdrawalInitialState],
        }

        const resizeResult = await nitroliteClient.resizeChannel(resizeParams)
        await publicClient.waitForTransactionReceipt({ hash: resizeResult.txHash })
        console.log(`    Resized on-chain: ${resizeResult.txHash}`)

        // Wait for ClearNode to process Resized event (status: resizing → open)
        console.log(`    Waiting for resize confirmation...`)
        for (let attempt = 0; attempt < 30; attempt++) {
          const chs = await client.getChannels(wallet.address as Address)
          const ch = chs.find((c: any) => (c.channelId ?? c.channel_id) === channelRes.channel_id)
          if (ch && ch.status === 'open') break
          await new Promise((r) => setTimeout(r, 2000))
        }

        const closeRes2 = await client.closeChannelRPC(wallet, channelRes.channel_id)
        const state2 = closeRes2.state
        console.log(`    Withdrawal close allocations:`, JSON.stringify(state2.allocations.map((a: any) => ({ dest: a.destination.slice(0, 10), token: a.token.slice(0, 10), amount: a.amount.toString() }))))

        const finalState2: FinalState = {
          channelId: closeRes2.channelId ?? closeRes2.channel_id,
          intent: StateIntent.FINALIZE,
          version: BigInt(state2.version),
          data: state2.stateData ?? state2.state_data,
          allocations: state2.allocations.map((a: any) => ({
            destination: a.destination,
            token: a.token,
            amount: BigInt(a.amount),
          })),
          serverSignature: closeRes2.serverSignature ?? closeRes2.server_signature,
        }

        const stateData2 = state2.stateData ?? state2.state_data
        const closeParams: CloseChannelParams = { stateData: stateData2, finalState: finalState2 }
        const closeTx = await nitroliteClient.closeChannel(closeParams)
        console.log(`    Closed withdrawal channel: ${closeTx}`)
      }
    }

    // Phase 3: Withdraw all custody balances
    for (const token of [ETH_ADDRESS, USDC_ADDRESS]) {
      const balance = await nitroliteClient.getAccountBalance(token)
      if (balance > 0n) {
        const symbol = token === ETH_ADDRESS ? 'ETH' : 'USDC'
        const formatted = token === ETH_ADDRESS ? formatEther(balance) : formatUnits(balance, 6)
        console.log(`    Withdraw ${formatted} ${symbol}`)
        await nitroliteClient.withdrawal(token, balance)
      }
    }
  } finally {
    client.close()
  }
}

export async function closeChannelsAndWithdraw(wallets: LoadedWallet[], finalAllocations?: RPCAppSessionAllocation[]): Promise<void> {
  console.log('=== Step 6: Close Channels & Withdraw ===')

  const configClient = new CloseClient()
  await configClient.connect()
  await configClient.authenticate(wallets[0]!)
  const config = await configClient.getConfig()
  configClient.close()

  for (const wallet of wallets) {
    try {
      await closeWalletChannels(wallet, config, finalAllocations)
    } catch (e) {
      console.error(`  Error for ${wallet.name}: ${e}`)
    }
  }

  console.log()
}
