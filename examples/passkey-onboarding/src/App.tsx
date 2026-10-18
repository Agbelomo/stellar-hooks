import { useMemo, useState } from "react";
import { Address, Asset, Networks, nativeToScVal } from "@stellar/stellar-sdk";
import { StellarProvider, usePasskeyRegister, usePasskeySign } from "stellar-hooks";
import { createDemoFeePayer } from "./feePayer";

const FACTORY_CONTRACT_ID = import.meta.env.VITE_FACTORY_CONTRACT_ID ?? "";
const XLM_SAC = Asset.native().contractId(Networks.TESTNET);
const STARTING_BALANCE_XLM = "100";

type Step = "intro" | "register" | "fund" | "pay" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "intro", label: "No extension needed" },
  { id: "register", label: "Create passkey" },
  { id: "fund", label: "Fund account" },
  { id: "pay", label: "First payment" },
  { id: "done", label: "Done" },
];

/** Convert a decimal XLM amount to an i128 stroop ScVal. */
function xlmToStroops(amount: string) {
  const [whole, fraction = ""] = amount.split(".");
  const stroops = BigInt(whole || "0") * 10_000_000n + BigInt(fraction.padEnd(7, "0").slice(0, 7));
  return nativeToScVal(stroops, { type: "i128" });
}

function shorten(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function explorerTx(hash: string) {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

function Onboarding() {
  const feePayer = useMemo(() => createDemoFeePayer(), []);
  const [step, setStep] = useState<Step>("intro");
  const [userName, setUserName] = useState("");
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [txHashes, setTxHashes] = useState<{ label: string; hash: string }[]>([]);

  const passkey = usePasskeyRegister({ factoryContractId: FACTORY_CONTRACT_ID, feePayer });
  const signer = usePasskeySign({
    credentialId: passkey.credential?.id,
    smartAccountAddress: passkey.contractAddress,
    feePayer,
  });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setStepError(null);
    try {
      await fn();
    } catch (err) {
      setStepError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = () =>
    run(async () => {
      if (!FACTORY_CONTRACT_ID) throw new Error("Set VITE_FACTORY_CONTRACT_ID in .env");
      // The demo sponsor needs testnet XLM to pay the deployment fee.
      await feePayer.fund();
      const { transactionHash } = await passkey.register({ userName });
      if (transactionHash) setTxHashes((t) => [...t, { label: "Smart account deployed", hash: transactionHash }]);
      setStep("fund");
    });

  const handleFund = () =>
    run(async () => {
      // Sponsor sends starting XLM to the smart account through the native asset contract.
      const { hash } = await signer.invoke({
        contractId: XLM_SAC,
        method: "transfer",
        args: [
          new Address(feePayer.publicKey).toScVal(),
          new Address(passkey.contractAddress!).toScVal(),
          xlmToStroops(STARTING_BALANCE_XLM),
        ],
      });
      setTxHashes((t) => [...t, { label: `Funded with ${STARTING_BALANCE_XLM} XLM`, hash }]);
      setStep("pay");
    });

  const handlePay = () =>
    run(async () => {
      // The smart account is `from`, so its auth entry is signed with the passkey.
      const { hash } = await signer.invoke({
        contractId: XLM_SAC,
        method: "transfer",
        args: [
          new Address(passkey.contractAddress!).toScVal(),
          new Address(destination).toScVal(),
          xlmToStroops(amount),
        ],
      });
      setTxHashes((t) => [...t, { label: `Sent ${amount} XLM`, hash }]);
      setStep("done");
    });

  const currentIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="app">
      <header>
        <h1>Passkey Onboarding</h1>
        <p>A Stellar wallet with just your fingerprint or face.</p>
      </header>

      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s.id} className={i < currentIndex ? "complete" : i === currentIndex ? "active" : ""}>
            <span className="dot">{i < currentIndex ? "✓" : i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>

      <div className="card">
        {step === "intro" && (
          <>
            <h2>No extension. No seed phrase.</h2>
            <ul className="checklist">
              <li>No browser extension like Freighter is required.</li>
              <li>No secret key is generated, shown, or stored for you.</li>
              <li>Your device's passkey (Touch ID, Face ID, Windows Hello, security key) controls a Soroban smart account.</li>
              <li>Transactions are submitted by a sponsor; only your passkey can authorise spending.</li>
            </ul>
            <button className="button" onClick={() => setStep("register")}>
              Get started
            </button>
          </>
        )}

        {step === "register" && (
          <>
            <h2>Create your passkey</h2>
            <p className="muted">
              Your device will ask you to create a passkey. We then deploy a smart account contract
              that only that passkey can authorise.
            </p>
            <label>
              Account name
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="alice@example.com"
              />
            </label>
            <button className="button" disabled={!userName || busy} onClick={handleRegister}>
              {passkey.isRegistering ? "Waiting for passkey…" : "Create passkey account"}
            </button>
          </>
        )}

        {step === "fund" && (
          <>
            <h2>Fund your account</h2>
            <p className="muted">
              Your smart account <code>{shorten(passkey.contractAddress!)}</code> is live. The demo
              sponsor will send it {STARTING_BALANCE_XLM} testnet XLM.
            </p>
            <button className="button" disabled={busy} onClick={handleFund}>
              {busy ? "Funding…" : `Receive ${STARTING_BALANCE_XLM} XLM`}
            </button>
          </>
        )}

        {step === "pay" && (
          <>
            <h2>Make your first payment</h2>
            <p className="muted">
              You'll be asked to confirm with your passkey. That signature authorises exactly this
              transfer — nothing else.
            </p>
            <label>
              Destination (G… or C…)
              <input value={destination} onChange={(e) => setDestination(e.target.value.trim())} />
            </label>
            <label>
              Amount (XLM)
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </label>
            <button className="button" disabled={!destination || !amount || busy} onClick={handlePay}>
              {signer.isSigning ? "Confirm with your passkey…" : "Send with passkey"}
            </button>
          </>
        )}

        {step === "done" && (
          <>
            <h2>You're onboarded 🎉</h2>
            <p className="muted">
              You created a wallet and sent a payment without installing anything or writing down a
              secret key.
            </p>
          </>
        )}

        {stepError && <p className="error">{stepError}</p>}

        {txHashes.length > 0 && (
          <ul className="tx-list">
            {txHashes.map(({ label, hash }) => (
              <li key={hash}>
                {label} —{" "}
                <a href={explorerTx(hash)} target="_blank" rel="noopener noreferrer">
                  {shorten(hash)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StellarProvider network="testnet">
      <Onboarding />
    </StellarProvider>
  );
}
