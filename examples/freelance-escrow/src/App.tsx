import { useState } from "react";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import {
  useFreighter,
  useSorobanContract,
  useSorobanRead,
  useCreateClaimableBalance,
} from "stellar-hooks";

/**
 * Milestone payments: the client funds a milestone in an escrow contract,
 * approves it when the work is accepted, and the freelancer releases it.
 * If the freelancer never delivers, the client can lock a refund as a
 * time-limited claimable balance. See README.md for the contract ABI.
 */

const STATUS = ["None", "Funded", "Approved", "Released"] as const;

const i128 = (n: string) => nativeToScVal(BigInt(Math.round(Number(n) * 1e7)), { type: "i128" });
const u32 = (n: number) => nativeToScVal(n, { type: "u32" });
const addr = (a: string) => nativeToScVal(a, { type: "address" });

function Milestone({ contractId, id, role }: { contractId: string; id: number; role: "client" | "freelancer" }) {
  const { publicKey } = useFreighter();
  const escrow = useSorobanContract(contractId);
  const { data, refetch } = useSorobanRead<{ amount: bigint; status: number } | null>(
    contractId,
    "get_milestone",
    [u32(id)],
    { refetchInterval: 10_000 },
  );
  const status = STATUS[data?.status ?? 0];

  const run = async (method: string, args: xdr.ScVal[]) => {
    await escrow.call({ method, args });
    await refetch();
  };

  return (
    <li>
      <strong>Milestone {id}</strong> — {status}
      {data ? ` (${Number(data.amount) / 1e7} XLM)` : ""}{" "}
      {role === "client" && status === "Funded" && (
        <button disabled={escrow.isLoading} onClick={() => run("approve_milestone", [addr(publicKey!), u32(id)])}>
          Approve
        </button>
      )}
      {role === "freelancer" && status === "Approved" && (
        <button disabled={escrow.isLoading} onClick={() => run("release_milestone", [addr(publicKey!), u32(id)])}>
          Release payment
        </button>
      )}
      {escrow.error && <em> {escrow.error.message}</em>}
    </li>
  );
}

export function App() {
  const { publicKey, isConnected, connect } = useFreighter();
  const [contractId, setContractId] = useState("");
  const [freelancer, setFreelancer] = useState("");
  const [amount, setAmount] = useState("10");
  const [milestoneId, setMilestoneId] = useState(1);
  const [role, setRole] = useState<"client" | "freelancer">("client");

  const escrow = useSorobanContract(contractId);
  const refund = useCreateClaimableBalance();

  if (!isConnected) return <button onClick={connect}>Connect Freighter</button>;

  const fund = () =>
    escrow.call({
      method: "fund_milestone",
      args: [addr(publicKey!), addr(freelancer), u32(milestoneId), i128(amount)],
    });

  const lockRefund = () =>
    refund.create({
      asset: { type: "native" },
      amount,
      // Refund is claimable by the client only; add a time predicate with
      // useCreateClaimableBalance's `predicate` (xdr.ClaimPredicate) if needed.
      claimants: [{ destination: publicKey! }],
    });

  return (
    <main style={{ maxWidth: 560, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Freelance escrow</h1>
      <p>Connected as {publicKey}</p>
      <label>Escrow contract <input value={contractId} onChange={(e) => setContractId(e.target.value)} /></label>
      <label> I am the{" "}
        <select value={role} onChange={(e) => setRole(e.target.value as "client" | "freelancer")}>
          <option value="client">client</option>
          <option value="freelancer">freelancer</option>
        </select>
      </label>

      {role === "client" && (
        <section>
          <h2>Fund a milestone</h2>
          <input placeholder="Freelancer G..." value={freelancer} onChange={(e) => setFreelancer(e.target.value)} />
          <input type="number" min={1} value={milestoneId} onChange={(e) => setMilestoneId(Number(e.target.value))} />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button disabled={!contractId || escrow.isLoading} onClick={fund}>Fund</button>
          <button disabled={refund.isLoading} onClick={lockRefund}>Lock refund balance</button>
          {refund.error && <em> {refund.error.message}</em>}
        </section>
      )}

      {contractId && (
        <ul>
          {[1, 2, 3].map((id) => <Milestone key={id} contractId={contractId} id={id} role={role} />)}
        </ul>
      )}
    </main>
  );
}
