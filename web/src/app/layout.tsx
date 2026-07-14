import type { Metadata, Viewport } from "next";
import { AuthProvider } from "../context/auth.context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Big Bites | Management System",
  description: "Secure Restaurant Billing & Management System",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
