"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../../context/auth.context";

// Deliberately a sibling route group to (dashboard), not nested inside
// it: Next.js layouts compose hierarchically by folder nesting, so a
// layout placed at (dashboard)/orders/new/layout.tsx would still be
// wrapped by (dashboard)/layout.tsx's sidebar - there is no way for a
// child layout to opt its own route out of a parent's render tree. This
// route group resolves to the same URL (/orders/new) without inheriting
// the dashboard shell at all.
export default function PosLayout({ children }: { children: React.ReactNode }): JSX.Element | null {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return null;
  }

  return <>{children}</>;
}
