import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allo Fulfillment - Multi-Warehouse Inventory & Hold Console",
  description: "Allo's real-time order-fulfillment and stock reservation platform with distributed concurrency control and lazy hold reclamation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

