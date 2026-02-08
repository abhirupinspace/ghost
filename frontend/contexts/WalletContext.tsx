"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  type WalletClient,
  type PublicClient,
} from "viem";
import { supportedChains } from "@/lib/wallet";
import { arcTestnet } from "viem/chains";

interface WalletState {
  address: string | undefined;
  chainId: number;
  walletClient: WalletClient | null;
  publicClient: PublicClient;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: (chainId: number) => Promise<void>;
}

const WalletContext = createContext<WalletState>({
  address: undefined,
  chainId: arcTestnet.id,
  walletClient: null,
  publicClient: createPublicClient({ chain: arcTestnet, transport: http() }) as PublicClient,
  connect: async () => {},
  disconnect: () => {},
  switchChain: async () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

function getChain(id: number) {
  return supportedChains.find((c) => c.id === id) ?? arcTestnet;
}

function getEthereum(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).ethereum ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | undefined>();
  const [chainId, setChainId] = useState<number>(arcTestnet.id);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);

  const chain = getChain(chainId);
  const publicClient = createPublicClient({ chain, transport: http() }) as PublicClient;

  const buildWalletClient = useCallback((addr: string, cId: number) => {
    const ethereum = getEthereum();
    if (!ethereum) return null;
    return createWalletClient({
      account: addr as `0x${string}`,
      chain: getChain(cId),
      transport: custom(ethereum),
    });
  }, []);

  const connect = useCallback(async () => {
    const ethereum = getEthereum();
    if (!ethereum) {
      window.open("https://metamask.io", "_blank");
      return;
    }
    const accounts: string[] = await ethereum.request({
      method: "eth_requestAccounts",
    });
    if (accounts[0]) {
      const hexChain: string = await ethereum.request({
        method: "eth_chainId",
      });
      const cId = parseInt(hexChain, 16);
      setAddress(accounts[0]);
      setChainId(cId);
      setWalletClient(buildWalletClient(accounts[0], cId));
      localStorage.setItem("ghost_wallet_connected", "1");
    }
  }, [buildWalletClient]);

  const disconnect = useCallback(() => {
    setAddress(undefined);
    setWalletClient(null);
    setChainId(arcTestnet.id);
    localStorage.removeItem("ghost_wallet_connected");
  }, []);

  const switchChain = useCallback(async (targetChainId: number) => {
    const ethereum = getEthereum();
    if (!ethereum) return;
    const hexId = `0x${targetChainId.toString(16)}`;
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
    } catch (err: any) {
      // 4902 = chain not added
      if (err.code === 4902) {
        const chain = getChain(targetChainId);
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexId,
              chainName: chain.name,
              nativeCurrency: chain.nativeCurrency,
              rpcUrls: [chain.rpcUrls.default.http[0]],
              blockExplorerUrls: chain.blockExplorers
                ? [chain.blockExplorers.default.url]
                : [],
            },
          ],
        });
      }
    }
  }, []);

  // Listen for MetaMask events
  useEffect(() => {
    const ethereum = getEthereum();
    if (!ethereum) return;

    const handleAccounts = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setAddress(accounts[0]);
        setWalletClient(buildWalletClient(accounts[0], chainId));
      }
    };

    const handleChain = (hexChain: string) => {
      const cId = parseInt(hexChain, 16);
      setChainId(cId);
      if (address) {
        setWalletClient(buildWalletClient(address, cId));
      }
    };

    ethereum.on("accountsChanged", handleAccounts);
    ethereum.on("chainChanged", handleChain);
    return () => {
      ethereum.removeListener("accountsChanged", handleAccounts);
      ethereum.removeListener("chainChanged", handleChain);
    };
  }, [address, chainId, disconnect, buildWalletClient]);

  // Auto-reconnect
  useEffect(() => {
    const ethereum = getEthereum();
    if (!ethereum) return;
    if (localStorage.getItem("ghost_wallet_connected") !== "1") return;
    ethereum
      .request({ method: "eth_accounts" })
      .then((accounts: string[]) => {
        if (accounts[0]) {
          ethereum
            .request({ method: "eth_chainId" })
            .then((hexChain: string) => {
              const cId = parseInt(hexChain, 16);
              setAddress(accounts[0]);
              setChainId(cId);
              setWalletClient(buildWalletClient(accounts[0], cId));
            });
        }
      })
      .catch(() => {});
  }, [buildWalletClient]);

  return (
    <WalletContext.Provider
      value={{
        address,
        chainId,
        walletClient,
        publicClient,
        connect,
        disconnect,
        switchChain,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
