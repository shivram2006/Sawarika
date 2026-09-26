import type { Metadata } from "next";
import { AuthProvider } from "../lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sawarika",
  description: "Apni sawari, apne shehar me",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
