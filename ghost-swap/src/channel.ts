import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  encodeAbiParameters,
  type Address,
  type Hash,
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
  createCreateChannelMessage,
  createResizeChannelMessage,
  NitroliteClient,
  WalletStateSigner,
  type CreateChannelParams,
  type ResizeChannelParams,
  type FinalState,
  type Channel,
  type UnsignedState,
  StateIntent,
} from '@erc7824/nitrolite'
import type { LoadedWallet } from './types.ts'
import {
  CLEARNODE_URL,
  RPC_URL,
  APP_NAME,
  BASE_SEPOLIA_CHAIN_ID,
  ETH_ADDRESS,
  WALLET_DEPOSITS,
  type ConfigResponse,
  parseConfigResponse,
} from './config.ts'

// Lightweight WS client for setup (no persistent connection needed)
class SetupClient {
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

  async getConfig(): Promise<ConfigResponse> {
    const msg = createGetConfigMessageV2()
    const res = await this.send(msg)
    return parseConfigResponse(res)
  }

  async createChannelRPC(wallet: LoadedWallet, chainId: number, token: Address) {
    const msg = await createCreateChannelMessage(wallet.signer, {
      chain_id: chainId,
      token,
    })
    const res = await this.send(msg) as { res: [number, string, CreateChannelResponse] }
    return res.res[2]
  }

  close(): void {
    this.ws?.close()
  }
}

export interface CreateChannelResponse {
  channel_id: Hex
  server_signature: Hex
  channel: {
    participants: [Address, Address]
    adjudicator: Address
    challenge: bigint
    nonce: bigint
  }
  state: {
    intent: number
    version: bigint
    state_data: Hex
    allocations: { destination: Address; token: Address; amount: bigint }[]
  }
}

export function buildCreateChannelParams(response: CreateChannelResponse): CreateChannelParams {
  const channel: Channel = {
    participants: response.channel.participants,
    adjudicator: response.channel.adjudicator,
    challenge: BigInt(response.channel.challenge),
    nonce: BigInt(response.channel.nonce),
  }

  const unsignedInitialState: UnsignedState = {
    intent: response.state.intent as StateIntent,
    version: BigInt(response.state.version),
    data: response.state.state_data,
    allocations: response.state.allocations.map((a) => ({
      destination: a.destination,
      token: a.token,
      amount: BigInt(a.amount),
    })),
  }

  return {
    channel,
    unsignedInitialState,
    serverSignature: response.server_signature,
  }
}

export function createNitroliteClient(
  privateKey: Hex,
  addresses: { custody: Address; adjudicator: Address },
): NitroliteClient {
  const account = privateKeyToAccount(privateKey)
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(RPC_URL) })
  const stateSigner = new WalletStateSigner(walletClient)

  return new NitroliteClient({
    publicClient: publicClient as any,
    walletClient: walletClient as any,
    stateSigner,
    addresses,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    challengeDuration: BigInt(86400),
  })
}

async function setupWallet(
  wallet: LoadedWallet,
  config: ConfigResponse,
  token: Address,
  depositAmount: bigint
): Promise<void> {
  console.log(`\n  Setting up ${wallet.name} (${wallet.address})`)

  const client = new SetupClient()
  await client.connect()

  try {
    console.log(`    Authenticating...`)
    await client.authenticate(wallet)

    console.log(`    Requesting channel creation...`)
    const channelRes = await client.createChannelRPC(wallet, BASE_SEPOLIA_CHAIN_ID, token)
    console.log(`    Channel ID: ${channelRes.channel_id}`)

    const network = config.networks.find((n) => n.chain_id === BASE_SEPOLIA_CHAIN_ID)
    if (!network) throw new Error(`Network ${BASE_SEPOLIA_CHAIN_ID} not found in config`)

    const nitroliteClient = createNitroliteClient(wallet.privateKey, {
      custody: network.custody_address,
      adjudicator: network.adjudicator_address,
    })

    // Approve tokens if ERC20
    if (token !== ETH_ADDRESS) {
      const allowance = await nitroliteClient.getTokenAllowance(token)
      if (allowance < depositAmount) {
        console.log(`    Approving ${depositAmount} tokens...`)
        await nitroliteClient.approveTokens(token, depositAmount)
      }
    }

    console.log(`    Depositing ${depositAmount} and creating channel...`)
    const params = buildCreateChannelParams(channelRes)
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) })
    const result = await nitroliteClient.depositAndCreateChannel(token, depositAmount, params)
    await publicClient.waitForTransactionReceipt({ hash: result.txHash })
    console.log(`    Channel created (status=ACTIVE)`)
    const initialState = result.initialState

    // Resize channel to move deposit from account into channel allocation
    console.log(`    Resizing channel to lock deposit...`)

    // Wait for ClearNode to detect the channel
    const tempClient = new SetupClient()
    await tempClient.connect()
    await tempClient.authenticate(wallet)
    for (let attempt = 0; attempt < 60; attempt++) {
      const channels = await (tempClient as any).send(createGetChannelsMessageV2(wallet.address as Address)) as any
      const chs = channels?.res?.[2]?.channels ?? []
      if (chs.some((c: any) => (c.channelId ?? c.channel_id) === channelRes.channel_id && c.status === 'open')) break
      if (attempt === 59) throw new Error('ClearNode never detected channel')
      await new Promise((r) => setTimeout(r, 2000))
    }

    // Send resize RPC
    const resizeMsg = await createResizeChannelMessage(wallet.signer, {
      channel_id: channelRes.channel_id,
      allocate_amount: depositAmount,
      funds_destination: wallet.address as Address,
    })
    const resizeRes = await tempClient.send(resizeMsg) as { res: [number, string, any] }
    const resizeData = resizeRes.res[2]
    tempClient.close()

    // Build resize params for on-chain
    const resizeFinalState: FinalState = {
      channelId: resizeData.channelId ?? resizeData.channel_id,
      intent: StateIntent.RESIZE,
      version: BigInt(resizeData.state.version),
      data: resizeData.state.stateData ?? resizeData.state.state_data,
      allocations: resizeData.state.allocations.map((a: any) => ({
        destination: a.destination,
        token: a.token,
        amount: BigInt(a.amount),
      })),
      serverSignature: resizeData.serverSignature ?? resizeData.server_signature,
    }

    const resizeParams: ResizeChannelParams = {
      resizeState: resizeFinalState,
      proofStates: [initialState],
    }

    console.log(`    resize state: v=${resizeFinalState.version}, intent=${resizeFinalState.intent}`)
    console.log(`    resize allocs: ${JSON.stringify(resizeFinalState.allocations.map(a => ({ d: a.destination.slice(0, 10), amt: a.amount.toString() })))}`)
    console.log(`    proof state: v=${initialState.version}, intent=${initialState.intent}, sigs=${initialState.sigs?.length}`)
    // Check account balance before resize
    const acctBal = await nitroliteClient.getAccountBalance(token)
    const chanBal = await nitroliteClient.getChannelBalance(result.channelId, token)
    console.log(`    account balance: ${acctBal}, channel balance: ${chanBal}`)

    try {
      const resizeResult = await nitroliteClient.resizeChannel(resizeParams)
      await publicClient.waitForTransactionReceipt({ hash: resizeResult.txHash })
      console.log(`    Resized: ${resizeResult.txHash}`)
    } catch (e: any) {
      // Walk the cause chain to find the actual revert data
      let inner = e
      while (inner.cause) inner = inner.cause
      console.log(`    Revert: ${inner.message?.slice(0, 600)}`)
      throw e
    }
  } finally {
    client.close()
  }
}

/**
 * Create channels + deposit for all participant wallets.
 * Server wallet does NOT need a channel — it only needs auth.
 */
export async function createChannelFunction(wallets: LoadedWallet[]): Promise<ConfigResponse> {
  console.log('=== Step 1: Channel Setup ===\n')

  // Fetch config
  const configClient = new SetupClient()
  await configClient.connect()
  const config = await configClient.getConfig()
  configClient.close()

  console.log(`  Broker: ${config.broker_address}`)
  for (const n of config.networks) {
    console.log(`  Network ${n.chain_id}: custody=${n.custody_address}`)
  }

  // Setup each participant wallet
  for (const wallet of wallets) {
    const deposit = WALLET_DEPOSITS[wallet.name]
    if (!deposit) {
      console.log(`  Skipping ${wallet.name} (no deposit config)`)
      continue
    }

    try {
      await setupWallet(wallet, config, deposit.token, deposit.amount)
    } catch (e) {
      console.error(`  Error setting up ${wallet.name}: ${e}`)
    }
  }

  console.log('\n  Channel setup complete.\n')
  return config
}
