"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useWallet } from "@/contexts/WalletContext";
import { GATEWAY_CONFIG, gatewayChains, getDomainName } from "@/lib/gateway-contracts";

export interface GatewayBalance {
  domain: number;
  chainName: string;
  balance: string;
}

interface GatewayState {
  balances: GatewayBalance[];
  totalBalance: number;
  loading: boolean;
  refresh: () => void;
}

const GatewayContext = createContext<GatewayState>({
  balances: [],
  totalBalance: 0,
  loading: false,
  refresh: () => {},
});

export function useGateway() {
  return useContext(GatewayContext);
}

export function GatewayProvider({ children }: { children: ReactNode }) {
  const { address: walletAddress } = useWallet();

  const [balances, setBalances] = useState<GatewayBalance[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) {
      setBalances([]);
      return;
    }

    setLoading(true);
    try {
      const sources = gatewayChains.map((chain) => ({
        domain: chain.domain,
        depositor: walletAddress,
      }));

      const response = await fetch(`${GATEWAY_CONFIG.TESTNET_URL}/balances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "USDC", sources }),
      });

      if (response.ok) {
        const data = await response.json();
        const gwBalances: GatewayBalance[] = (data.balances || []).map(
          (b: { domain: number; balance: string }) => ({
            domain: b.domain,
            chainName: getDomainName(b.domain),
            balance: b.balance,
          })
        );
        setBalances(gwBalances);
      }
    } catch {
      // Gateway may not be available in dev
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      fetchBalances();
    }
  }, [walletAddress, fetchBalances]);

  const totalBalance = balances.reduce(
    (sum, b) => sum + parseFloat(b.balance || "0"),
    0
  );

  return (
    <GatewayContext.Provider
      value={{ balances, totalBalance, loading, refresh: fetchBalances }}
    >
      {children}
    </GatewayContext.Provider>
  );
}
