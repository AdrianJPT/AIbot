"use client";

import { useQuery } from "@tanstack/react-query";
import { PhoneNumberList } from "@/features/businesses/components/phone-number-list";
import { AddPhoneNumberFormContainer } from "@/features/businesses/containers/add-phone-number-form-container";
import { fetchPhoneNumbers } from "@/features/businesses/api";
import type { PhoneNumberItem } from "@/features/businesses/types";

export function PhoneNumbersPanelContainer({
  businessId,
  canManage,
  initialPhoneNumbers,
}: {
  businessId: string;
  canManage: boolean;
  initialPhoneNumbers: PhoneNumberItem[];
}) {
  // Seeded with the server-fetched list so the first render needs no extra
  // round trip; still refetches after adding a number (see
  // AddPhoneNumberFormContainer's invalidateQueries on this same key).
  const { data: phoneNumbers = [] } = useQuery({
    queryKey: ["phoneNumbers", businessId],
    queryFn: () => fetchPhoneNumbers(businessId),
    initialData: initialPhoneNumbers,
  });

  return (
    <div className="space-y-4">
      <PhoneNumberList phoneNumbers={phoneNumbers} />
      {canManage && <AddPhoneNumberFormContainer businessId={businessId} />}
    </div>
  );
}
