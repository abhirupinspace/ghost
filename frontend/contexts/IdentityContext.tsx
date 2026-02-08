"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { formatAddress } from "@/lib/utils";

type IdentityState = {
  walletAddress: string | undefined;
  ensName: string | null;
  ghostAlias: string | null;
  displayName: string;
  setGhostAlias: (name: string | null) => void;
};

const IdentityContext = createContext<IdentityState>({
  walletAddress: undefined,
  ensName: null,
  ghostAlias: null,
  displayName: "",
  setGhostAlias: () => {},
});

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const { address } = useWallet();

  const [ensName] = useState<string | null>(null);
  const [ghostAlias, setGhostAliasState] = useState<string | null>(null);

  // Load ghost alias from localStorage on wallet connect
  useEffect(() => {
    if (!address) {
      setGhostAliasState(null);
      return;
    }
    const stored = localStorage.getItem(`ghost_alias_${address.toLowerCase()}`);
    setGhostAliasState(stored);
  }, [address]);

  const setGhostAlias = useCallback((name: string | null) => {
    if (!address) return;
    const key = `ghost_alias_${address.toLowerCase()}`;
    if (name) {
      localStorage.setItem(key, name);
    } else {
      localStorage.removeItem(key);
    }
    setGhostAliasState(name);
  }, [address]);

  const displayName = address
    ? (ghostAlias ? `${ghostAlias}.ghost.eth` : ensName ?? formatAddress(address))
    : "";

  return (
    <IdentityContext.Provider value={{ walletAddress: address, ensName, ghostAlias, displayName, setGhostAlias }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  return useContext(IdentityContext);
}
