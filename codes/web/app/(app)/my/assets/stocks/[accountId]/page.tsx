"use client";

import { useParams } from "next/navigation";
import { StockDetailPage } from "@/components/assets/StockDetailPage";

export default function StockAccountRoute() {
  const params = useParams<{ accountId: string }>();
  return <StockDetailPage accountId={params.accountId} />;
}
