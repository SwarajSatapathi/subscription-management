import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soroban Subscription Manager",
  description:
    "A decentralized subscription system that tracks user access based on time using a Stellar Soroban smart contract.",
  keywords: ["Stellar", "Soroban", "Subscription", "Web3", "Blockchain"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
