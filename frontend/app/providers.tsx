"use client";

import { WalletProvider } from "@/contexts/WalletContext";
import { PythPriceProvider } from "@/contexts/PythPriceContext";
import { GatewayProvider } from "@/contexts/GatewayContext";
import { IdentityProvider } from "@/contexts/IdentityContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <IdentityProvider>
        <PythPriceProvider>
          <GatewayProvider>{children}</GatewayProvider>
        </PythPriceProvider>
      </IdentityProvider>
    </WalletProvider>
  );
}
