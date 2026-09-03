import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "./providers";
import { Shell } from "@/components/Shell";
import "./globals.css";
import "./production-package.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Field Desk",
  description: "Qualified Commercial — field rep console",
};

// Every request hits the SSR Lambda, which is why amplify.yml writes
// .env.production at build time: Amplify console env vars reach the build
// container but not reliably the runtime, and a missing CLERK_SECRET_KEY here
// throws inside clerkMiddleware and 503s every page.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
        <body>
          <Providers>
            <Shell>{children}</Shell>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
