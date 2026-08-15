import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PaymentInboxItem } from "@/features/payments/types";

/**
 * Parity guard (tasks #568 PR4, task 4): confirming/rejecting from the
 * inline chat card must hit the exact same `confirmPayment`/`rejectPayment`
 * functions — same endpoint, same request shape — as confirming from the
 * dashboard (PR3's PaymentInboxContainer). Both containers are exercised
 * here with `@tanstack/react-query` mocked to a synchronous stub so the
 * `mutationFn` each container registers can be captured and called
 * directly, without needing a DOM/click-simulation harness (this repo's
 * vitest environment is "node", no jsdom/testing-library — see
 * payment-inbox.test.tsx for the existing markup-only testing convention).
 */

const confirmPaymentMock = vi.fn();
const rejectPaymentMock = vi.fn();
const fetchPaymentDetailMock = vi.fn();

vi.mock("@/features/payments/api", () => ({
  confirmPayment: (...args: unknown[]) => confirmPaymentMock(...args),
  rejectPayment: (...args: unknown[]) => rejectPaymentMock(...args),
  fetchPaymentDetail: (...args: unknown[]) => fetchPaymentDetailMock(...args),
  paymentMediaUrl: (sessionId: string, proofId: string) =>
    `/api/payments/${sessionId}/media/${proofId}`,
}));

type MutationFn = (...args: unknown[]) => unknown;
let registeredMutationFns: MutationFn[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: ({ mutationFn }: { mutationFn: MutationFn }) => {
    registeredMutationFns.push(mutationFn);
    return { mutate: () => {}, isPending: false, variables: undefined };
  },
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const baseItem: PaymentInboxItem = {
  id: "session-1",
  conversationId: "conv-1",
  customerPhone: "+5491100000000",
  customerName: "Cliente Test",
  status: "ready_to_confirm",
  statusReason: null,
  expectedAmount: 20000,
  receivedAmount: 20000,
  remaining: 0,
  catalogItem: { name: "Corte", price: 20000, currency: "MXN" },
  latestProof: null,
  aiMessage: null,
  confirmedById: null,
  confirmedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("dashboard confirm/reject vs. chat-card confirm/reject", () => {
  it("both call confirmPayment(id, partial) with the same arguments for the same input", async () => {
    const { PaymentInboxContainer } = await import(
      "../payment-inbox-container"
    );
    const { PaymentCardContainer } = await import("../payment-card-container");

    registeredMutationFns = [];
    renderToStaticMarkup(<PaymentInboxContainer items={[baseItem]} />);
    const [dashboardConfirm, dashboardReject] = registeredMutationFns;

    dashboardConfirm({ id: "session-1", partial: true });
    expect(confirmPaymentMock).toHaveBeenCalledWith("session-1", true);
    dashboardReject("session-1");
    expect(rejectPaymentMock).toHaveBeenCalledWith("session-1");

    confirmPaymentMock.mockClear();
    rejectPaymentMock.mockClear();
    registeredMutationFns = [];

    renderToStaticMarkup(<PaymentCardContainer sessionId="session-1" />);
    const [cardConfirm, cardReject] = registeredMutationFns;

    cardConfirm(true);
    expect(confirmPaymentMock).toHaveBeenCalledWith("session-1", true);
    cardReject();
    expect(rejectPaymentMock).toHaveBeenCalledWith("session-1");
  });

  it("both call confirmPayment without the partial override by default", async () => {
    const { PaymentInboxContainer } = await import(
      "../payment-inbox-container"
    );
    const { PaymentCardContainer } = await import("../payment-card-container");

    registeredMutationFns = [];
    renderToStaticMarkup(<PaymentInboxContainer items={[baseItem]} />);
    const [dashboardConfirm] = registeredMutationFns;
    dashboardConfirm({ id: "session-1", partial: false });
    expect(confirmPaymentMock).toHaveBeenLastCalledWith("session-1", false);

    registeredMutationFns = [];
    renderToStaticMarkup(<PaymentCardContainer sessionId="session-1" />);
    const [cardConfirm] = registeredMutationFns;
    cardConfirm(false);
    expect(confirmPaymentMock).toHaveBeenLastCalledWith("session-1", false);
  });
});
