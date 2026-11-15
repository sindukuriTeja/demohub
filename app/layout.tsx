import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DemoHub — Interactive Product Demos",
  description: "Create, share, and analyze interactive product demos. Your SupaDemo alternative.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
