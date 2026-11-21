"use client";

import { useParams } from "next/navigation";
import { BankDetailPage } from "@/components/assets/BankDetailPage";

export default function BankAccountRoute() {
  const params = useParams<{ accountId: string }>();
  return <BankDetailPage accountId={params.accountId} />;
}
