import type { Metadata } from "next";
import { WalletContextProvider } from "./providers";

export const metadata: Metadata = {
  title: "On-Chain Workflow Engine | Superteam Poland Bounty",
  description: "Production backend pattern rebuilt as a Solana program: role-gated approvals, bounded retries, deadline escalation, immutable audit trail.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, background: "#0a0a0f", minHeight: "100vh" }}>
        <WalletContextProvider>{children}</WalletContextProvider>
      </body>
    </html>
  );
}
