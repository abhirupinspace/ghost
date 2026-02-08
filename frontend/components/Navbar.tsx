"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnect } from "@/components/WalletConnect";
import { GhostNameBadge } from "@/components/GhostNameBadge";

const navLinks = [
  { href: "/", label: "Lend" },
  { href: "/borrow", label: "Borrow" },
  { href: "/portfolio", label: "Portfolio" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="relative z-10 flex items-center justify-between px-8 py-5">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-[20px] tracking-tight">
          <span className="font-black">GHOST </span>
          <span className="font-normal">FINANCE</span>
        </Link>
        <nav className="flex items-center gap-5">
          {navLinks.map((link) => {
            const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-[14px] transition-colors ${
                  isActive ? "text-white font-medium" : "text-[#555] hover:text-[#999]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <GhostNameBadge showEdit />
        <WalletConnect />
      </div>
    </header>
  );
}
