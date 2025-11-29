'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ---------- helpers ---------- */
function toHex(u8: Uint8Array) {
  return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsText(file);
  });
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(file);
  });
}

/* ---------- UI atoms ---------- */
function Tip({ text }: { text: string }) {
  return (
    <span className="ml-2 group relative inline-flex items-center">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-white text-[11px] shadow-sm">?</span>
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden -translate-x-1/2 whitespace-pre rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs text-zinc-700 shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}

function Card({ title, subtitle, tip, children }: { title: string; subtitle?: string; tip?: string; children: any }) {
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-[0_4px_24px_rgba(2,6,23,0.06)] backdrop-blur-sm"
    >
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        {tip ? <Tip text={tip} /> : null}
      </div>
      {subtitle ? <p className="mb-4 text-sm text-zinc-600">{subtitle}</p> : null}
      {children}
    </motion.section>
  );
}

/* ---------- PAGE ---------- */
export default function Page() {
  const [wasm, setWasm] = useState<any>(null);
  const [error, setError] = useState('');

  /* --- chain toggle --- */
  const [chain, setChain] = useState<'cardano' | 'bitcoin'>('cardano');

  const frost = () => (chain === 'bitcoin' ? 'btc_' : '');
  const fx = (n: string) => wasm[`${frost()}${n}`];

  /* --- tabs --- */
  const tabs = ['Dealer', 'Signer', 'Coordinator'] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Dealer');

  /* --- shared state --- */
  const [max, setMax] = useState(5);
  const [min, setMin] = useState(3);
  const [stateJson, setStateJson] = useState('');
  const [exportedShares, setExportedShares] = useState<Array<{ identifier_hex: string; share_json: string }>>([]);

  const [pubkeyPkgJson, setPubkeyPkgJson] = useState('');
  const [pubkeyHex, setPubkeyHex] = useState('');
  const [pkHashHex, setPkHashHex] = useState('');
  const [addrTest, setAddrTest] = useState('');
  const [addrMain, setAddrMain] = useState('');

  const [eternlJson, setEternlJson] = useState('');
  const [txHex, setTxHex] = useState('');
  const [txHashHex, setTxHashHex] = useState('');
  const [txFile, setTxFile] = useState<File | null>(null);

  const [shareFile, setShareFile] = useState<File | null>(null);
  const [shareJsonOne, setShareJsonOne] = useState('');
  const [noncesB64, setNoncesB64] = useState('');
  const [commitmentOutJson, setCommitmentOutJson] = useState('');
  const [signingPackageB64, setSigningPackageB64] = useState('');
  const [signingPackageFile, setSigningPackageFile] = useState<File | null>(null);
  const [signatureShareOutJson, setSignatureShareOutJson] = useState('');

  const [commitmentsFiles, setCommitmentsFiles] = useState<File[]>([]);
  const [commitmentsListJson, setCommitmentsListJson] = useState('');
  const [builtSigningPkgB64, setBuiltSigningPkgB64] = useState('');
  const [signingPackageB64Agg, setSigningPackageB64Agg] = useState('');
  const [sigShareFiles, setSigShareFiles] = useState<File[]>([]);
  const [aggResult, setAggResult] = useState<any>(null);

  const [shareFiles, setShareFiles] = useState<File[]>([]);
  const [signResult, setSignResult] = useState<any>(null);

  /* ---------- wasm load ---------- */
  useEffect(() => {
    (async () => {
      try {
        const mod = await import('../frontend/public/pkg/cardano/frost_pallas_wasm');
        if (typeof mod.default === 'function') await mod.default();
        setWasm(mod);
      } catch (e: any) {
        setError(`WASM load error: ${e?.message || e}`);
      }
    })();
  }, []);

  /* ---------- Dealer ---------- */

  const generate = () => {
    try {
      const out = fx('frost_generate_state')(max, min);
      setStateJson(out);

      if (chain === 'cardano') {
        const pkg = wasm.pubkey_package_from_state(out);
        const pkgStr = typeof pkg === 'string' ? pkg : JSON.stringify(pkg);
        setPubkeyPkgJson(pkgStr);
        downloadText('pubkey_package.json', pkgStr);
        exportShares();
      }

      setError('');
    } catch (e: any) {
      setError(`Generate failed: ${e?.message || e}`);
    }
  };

  const exportShares = () => {
    try {
      const jsVal = wasm.export_shares_for_download(stateJson);
      const arr = typeof jsVal === 'string' ? JSON.parse(jsVal) : jsVal;
      setExportedShares(arr);
      arr.forEach((s: any) => {
        const filename = `frost_share_${s.identifier_hex}.json`;
        downloadText(filename, s.share_json);
      });
    } catch (e: any) {
      setError(`Export shares failed: ${e?.message || e}`);
    }
  };

  const derive = () => {
    try {
      if (!pubkeyPkgJson.trim()) throw new Error('Paste pubkey_package.json first.');

      if (chain === 'bitcoin') {
        const xonly = new Uint8Array(fx('xonly_pubkey_from_pubkey_package')(pubkeyPkgJson));
        setPubkeyHex(toHex(xonly));
        setAddrMain(fx('p2tr_address_from_pubkey_package')(pubkeyPkgJson, true));
        setAddrTest(fx('p2tr_address_from_pubkey_package')(pubkeyPkgJson, false));
        setPkHashHex('');
      } else {
        const pk = new Uint8Array(wasm.frost_pubkey_bytes_from_pubkey_package(pubkeyPkgJson));
        setPubkeyHex(toHex(pk));
        const h = new Uint8Array(wasm.blake2b224_pubkey_from_pubkey_package(pubkeyPkgJson));
        const hHex = toHex(h);
        setPkHashHex(hHex);
        setAddrTest(wasm.addr_bech32_from_hashes(h, h, false));
        setAddrMain(wasm.addr_bech32_from_hashes(h, h, true));
      }
    } catch (e: any) {
      setError(`Derive failed: ${e?.message || e}`);
    }
  };

  /* ---------- Transaction parsing ---------- */

  const onTxFileChange = (e: React.ChangeEvent<HTMLInputElement>) => setTxFile(e.target.files?.[0] || null);

  const parseTx = async () => {
    try {
      if (chain === 'bitcoin') {
        if (!txHex.trim()) throw new Error('For Bitcoin paste raw PSBT hex into tx_hex box.');
        setTxHashHex('(Taproot sighash is computed later from PSBT)');
        return;
      }

      if (eternlJson.trim()) {
        const out = wasm.parse_eternl_json_and_hash(eternlJson.trim());
        const obj = typeof out === 'string' ? JSON.parse(out) : out;
        setTxHex(obj.tx_hex);
        setTxHashHex(obj.tx_hash_hex);
        return;
      }

      if (txFile) {
        const text = await readFileAsText(txFile);
        try {
          const maybe = JSON.parse(text);
          if (maybe && typeof maybe.cborHex === 'string') {
            const out = wasm.parse_eternl_json_and_hash(text);
            const obj = typeof out === 'string' ? JSON.parse(out) : out;
            setTxHex(obj.tx_hex);
            setTxHashHex(obj.tx_hash_hex);
            return;
          }
        } catch {}
        const buf = await readFileAsArrayBuffer(txFile);
        const bytes = new Uint8Array(buf);
        const out = wasm.txhash_from_cbor_bytes(bytes);
        const obj = typeof out === 'string' ? JSON.parse(out) : out;
        setTxHex(obj.tx_hex);
        setTxHashHex(obj.tx_hash_hex);
        return;
      }

      throw new Error('Provide Eternl JSON or upload CBOR.');
    } catch (e: any) {
      setError(`Parse TX failed: ${e?.message || String(e)}`);
    }
  };

  /* ---------- Signer ---------- */

  const onShareFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setShareFile(f);
    setShareJsonOne(f ? await readFileAsText(f) : '');
  };

  const makeCommitments = () => {
    try {
      if (!shareJsonOne) throw new Error('Upload your SecretShare JSON first.');
      const out = fx('round1_make_commitments')(shareJsonOne);
      const obj = typeof out === 'string' ? JSON.parse(out) : out;
      setNoncesB64(obj.nonces_b64);
      const commitLine = JSON.stringify({ identifier: obj.identifier, commitments_b64: obj.commitments_b64 });
      setCommitmentOutJson(commitLine);
      downloadText(`commitments_${String(obj.identifier)}.json`, commitLine);
    } catch (e: any) {
      setError(`Commitments failed: ${e?.message || String(e)}`);
    }
  };

  const onSigningPackageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setSigningPackageFile(f);
    if (!f) return;
    let t = (await readFileAsText(f)).trim();
    try {
      const j = JSON.parse(t);
      if (j && typeof j.signing_package_b64 === 'string') t = j.signing_package_b64;
    } catch {}
    setSigningPackageB64(t);
  };

  const signMyShare = () => {
    try {
      if (!shareJsonOne) throw new Error('Upload your SecretShare JSON.');
      if (!noncesB64) throw new Error('Missing nonces.');
      if (!signingPackageB64.trim()) throw new Error('Paste signing package.');

      const out = fx('round2_sign_share')(shareJsonOne, noncesB64, signingPackageB64.trim());
      const obj = typeof out === 'string' ? JSON.parse(out) : out;
      const sigLine = JSON.stringify(obj);
      setSignatureShareOutJson(sigLine);
      downloadText(`signature_share_${String(obj.identifier)}.json`, sigLine);
    } catch (e: any) {
      setError(`Sign failed: ${e?.message || String(e)}`);
    }
  };

  /* ---------- Coordinator ---------- */

  function normalizeCommitmentEntry(text: string) {
    const obj = JSON.parse(text);
    return { identifier: String(obj.identifier), commitments_b64: String(obj.commitments_b64) };
  }

  const onCommitmentsFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setCommitmentsFiles(files);
    if (!files.length) return;
    const texts = await Promise.all(files.map(readFileAsText));
    const entries = texts.map(normalizeCommitmentEntry);
    const seen = new Set<string>();
    const dedup = entries.filter(x => (seen.has(x.identifier) ? false : (seen.add(x.identifier), true)));
    setCommitmentsListJson(JSON.stringify(dedup, null, 2));
  };

  const buildSigningPackage = () => {
    try {
      let out;
      if (chain === 'bitcoin') {
        out = wasm.btc_build_signing_package_from_psbt(txHex.trim(), 0, pubkeyPkgJson.trim());
      } else {
        const eternlPayload = eternlJson.trim() || JSON.stringify({ cborHex: txHex.trim() });
        out = wasm.build_signing_package_from_eternl(eternlPayload, commitmentsListJson);
      }

      const obj = typeof out === 'string' ? JSON.parse(out) : out;
      setBuiltSigningPkgB64(obj.signing_package_b64);
      setSigningPackageB64Agg(obj.signing_package_b64);

    } catch (e: any) {
      setError(`Build SP failed: ${e?.message || e}`);
    }
  };

  const aggregate = async () => {
    try {
      const texts = await Promise.all(sigShareFiles.map(readFileAsText));
      const entries = texts.map(t => JSON.parse(t));

      let out;
      if (chain === 'bitcoin') {
        out = wasm.btc_aggregate_and_finalize_psbt(
          pubkeyPkgJson.trim(),
          signingPackageB64Agg.trim(),
          JSON.stringify(entries),
          txHex.trim(),
          0
        );
      } else {
        const eternlPayload = eternlJson.trim() || JSON.stringify({ cborHex: txHex.trim() });
        out = wasm.aggregate_and_witness_from_eternl_with_pubkey(
          pubkeyPkgJson.trim(),
          signingPackageB64Agg.trim(),
          JSON.stringify(entries),
          eternlPayload
        );
      }

      const obj = typeof out === 'string' ? JSON.parse(out) : out;
      setAggResult(obj);

      if (obj.final_tx_hex) downloadText('final_tx_hex.txt', obj.final_tx_hex);

    } catch (e: any) {
      setError(`Aggregate failed: ${e?.message || String(e)}`);
    }
  };

  
  const signNow = async () => {
    try {
      if (!pubkeyPkgJson?.trim()) throw new Error('Missing pubkey_package.json.');
      if (!txHex?.trim() && !eternlJson.trim()) throw new Error('Provide Eternl JSON or parse/upload a CBOR.');
      if (!shareFiles.length) throw new Error('Upload at least t SecretShare JSON files.');

      const shareTexts = await Promise.all(shareFiles.map(readFileAsText));

      const perSigner = await Promise.all(
        shareTexts.map((shareJson) => {
          const j = wasm.round1_make_commitments(shareJson);
          return typeof j === 'string' ? JSON.parse(j) : j;
        })
      );
      const commitmentsList = perSigner.map((p: any) => ({ identifier: p.identifier, commitments_b64: p.commitments_b64 }));

      const eternlPayload = eternlJson.trim()
        ? eternlJson.trim()
        : JSON.stringify({ type: 'Tx ConwayEra', description: 'From UI (raw CBOR hex)', cborHex: txHex.trim() });

      const spOut = wasm.build_signing_package_from_eternl(eternlPayload, JSON.stringify(commitmentsList));
      const spObj = typeof spOut === 'string' ? JSON.parse(spOut) : spOut;
      const signing_package_b64 = spObj.signing_package_b64;

      const sigShareEntries = shareTexts.map((shareJson, i) => {
        const nonces_b64 = perSigner[i].nonces_b64;
        const res = wasm.round2_sign_share(shareJson, nonces_b64, signing_package_b64);
        const obj = typeof res === 'string' ? JSON.parse(res) : res;
        return obj;
      });

      const agg = wasm.aggregate_and_witness_from_eternl_with_pubkey(
        pubkeyPkgJson.trim(),
        signing_package_b64,
        JSON.stringify(sigShareEntries),
        eternlPayload
      );
      const aggObj = typeof agg === 'string' ? JSON.parse(agg) : agg;
      setSignResult(aggObj);

      if (aggObj.witness_set_hex) downloadText('witness_set.hex.txt', aggObj.witness_set_hex);
      if (aggObj.signed_tx_hex) downloadText('signed_tx.hex.txt', aggObj.signed_tx_hex);
      if (aggObj.signature_hex) downloadText('group_signature.hex.txt', aggObj.signature_hex);
    } catch (e: any) {
      setError(`Sign failed: ${e?.message || String(e)}`);
    }
  };

  /* ---------- UI ---------- */

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">

      <header className="mb-4">
        <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold tracking-tight">
          FROST {chain === 'bitcoin' ? 'Bitcoin Taproot' : 'Cardano'} multisig
        </motion.h1>
      </header>

      {/* Chain toggle */}
      <div className="mb-6 flex gap-3">
        <button
          onClick={() => setChain('cardano')}
          className={`rounded-xl px-4 py-2 text-sm font-medium ${chain === 'cardano' ? 'bg-blue-600 text-white' : 'bg-zinc-200'}`}
        >Cardano</button>

        <button
          onClick={() => setChain('bitcoin')}
          className={`rounded-xl px-4 py-2 text-sm font-medium ${chain === 'bitcoin' ? 'bg-orange-600 text-white' : 'bg-zinc-200'}`}
        >Bitcoin</button>
      </div>

      {/* Tabs */}
      <div className="mb-6 inline-flex rounded-2xl bg-white p-1 shadow ring-1 ring-zinc-200">
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`mx-1 rounded-xl px-4 py-2 text-sm ${activeTab === t ? 'bg-black text-white' : 'text-zinc-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded bg-red-100 px-4 py-2 text-red-900">{error}</div>}

      
            <AnimatePresence mode="wait">
              {activeTab === 'Dealer' && (
                <motion.div key="dealer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="grid grid-cols-1 gap-6">
                  <Card
                    title="Generate Shares (Dealer)"
                    tip={'Generates t-of-n shares + public pubkey_package.\nDistribute shares privately.\nShare pubkey_package.json with everyone.'}
                  >
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-sm text-zinc-700">
                        max (n)
                        <input
                          type="number"
                          className="ml-2 w-24 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                          value={max}
                          onChange={e => setMax(parseInt(e.target.value || '0'))}
                        />
                      </label>
                      <label className="text-sm text-zinc-700">
                        min (t)
                        <input
                          type="number"
                          className="ml-2 w-24 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                          value={min}
                          onChange={e => setMin(parseInt(e.target.value || '0'))}
                        />
                      </label>
                      <button
                        onClick={generate}
                        disabled={!wasm}
                        className="rounded-xl bg-amber-600 px-4 py-2 text-sm text-white shadow hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Generate
                      </button>
                      <button
                        onClick={exportShares}
                        disabled={!stateJson}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Download shares
                      </button>
                    </div>
      
                    <textarea
                      rows={6}
                      value={stateJson}
                      onChange={e => setStateJson(e.target.value)}
                      className="mt-3 w-full rounded-lg border border-zinc-200 bg-white/70 p-3 font-mono text-xs text-zinc-800"
                      placeholder="PersistedState JSON (dealer only)"
                    />
                    {!!exportedShares.length && (
                      <p className="mt-2 font-mono text-xs text-zinc-600">
                        Exported {exportedShares.length} shares (auto-downloaded). Keep each file private.
                      </p>
                    )}
                  </Card>
      
                  <Card
                    title="Public Key Package"
                    subtitle="This file is public and the same for everyone (pubkey_package.json)."
                    tip={'Use to derive address.\nRequired by coordinator to aggregate.\nSafe to share publicly.'}
                  >
                    <textarea
                      rows={6}
                      value={pubkeyPkgJson}
                      onChange={e => setPubkeyPkgJson(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white/70 p-3 font-mono text-xs text-zinc-800"
                      placeholder="Paste pubkey_package.json here"
                    />
                    <div className="mt-3">
                      <button
                        onClick={derive}
                        disabled={!wasm || !pubkeyPkgJson}
                        className="rounded-xl bg-sky-600 px-4 py-2 text-sm text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Derive address & hash
                      </button>
                    </div>
                    <div className="mt-3 space-y-1 font-mono text-xs text-zinc-700 break-words">
                      <div><b>Pubkey (hex):</b> {pubkeyHex || '—'}</div>
                      <div><b>Pubkey Hash (blake2b-224):</b> {pkHashHex || '—'}</div>
                      <div><b>addr_test:</b> {addrTest || '—'}</div>
                      <div><b>addr:</b> {addrMain || '—'}</div>
                    </div>
                  </Card>
                </motion.div>
              )}
      
              {activeTab === 'Signer' && (
                <motion.div key="signer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="grid grid-cols-1 gap-6">
                  <Card
                    title="Transaction Input"
                    subtitle="Paste Eternl JSON (with cborHex) or upload a JSON/CBOR file. Used only to compute tx_hash and build the signing package."
                    tip={'We compute Blake2b-256 of the Tx body CBOR.\nEither paste Eternl JSON or upload raw CBOR.'}
                  >
                    <label className="mb-2 block text-sm text-zinc-700">
                      Paste Eternl JSON:
                      <textarea
                        rows={6}
                        value={eternlJson}
                        onChange={e => setEternlJson(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-zinc-200 bg-white/70 p-3 font-mono text-xs text-zinc-800"
                        placeholder='{"type":"Tx ConwayEra","description":"Downloaded through Eternl Wallet","cborHex":"84ae..."}'
                      />
                    </label>
                    <label className="mb-3 block text-sm text-zinc-700">
                      Or upload JSON/CBOR:
                      <input
                        type="file"
                        onChange={onTxFileChange}
                        className="mt-2 block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <button
                      onClick={parseTx}
                      disabled={!wasm}
                      className="rounded-xl bg-sky-600 px-4 py-2 text-sm text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Parse & compute tx_hash
                    </button>
                    <div className="mt-3 space-y-1 font-mono text-xs text-zinc-700 break-words">
                      <div><b>tx_hash_hex:</b> {txHashHex || '—'}</div>
                      <div><b>tx_hex:</b> {txHex ? `${txHex.slice(0, 32)}... (${txHex.length} hex chars)` : '—'}</div>
                    </div>
                  </Card>
      
                  <Card
                    title="Signer — Round 1"
                    subtitle="Create commitments and keep nonces private."
                    tip={'Generates fresh nonces + commitments.\nSend commitments.json to the coordinator.\nNever share nonces_b64.'}
                  >
                    <label className="mb-3 block text-sm text-zinc-700">
                      Upload your SecretShare JSON:
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={onShareFile}
                        className="mt-2 block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={makeCommitments}
                        disabled={!wasm || !shareJsonOne}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Make commitments
                      </button>
                      <button
                        onClick={() => downloadText('commitments.json', commitmentOutJson)}
                        disabled={!commitmentOutJson}
                        className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Download commitments.json
                      </button>
      {/*                 <button
                        onClick={() => downloadText('nonces_b64.txt', noncesB64)}
                        disabled={!noncesB64}
                        className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Download nonces_b64.txt
                      </button> */}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <b className="text-sm text-zinc-700">commitments.json</b>
                        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-zinc-900/90 p-3 font-mono text-xs text-amber-100">
                          {commitmentOutJson || '—'}
                        </pre>
                      </div>
                      <div>
                        <b className="text-sm text-zinc-700">nonces_b64.txt</b>
                        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-zinc-900/90 p-3 font-mono text-xs text-amber-100">
                          {noncesB64 || '—'}
                        </pre>
                      </div>
                    </div>
                  </Card>
      
                  <Card
                    title="Signer — Round 2"
                    subtitle="Paste or upload signing_package_b64 from the coordinator, then produce your signature share."
                    tip={'Use your saved nonces_b64 from Round 1 + signing_package_b64.\nThis yields your signature_share.json to send back.'}
                  >
                    <label className="mb-3 block text-sm text-zinc-700">
                      signing_package_b64 (paste or upload):
                      <textarea
                        rows={3}
                        value={signingPackageB64}
                        onChange={e => setSigningPackageB64(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-zinc-200 bg-white/70 p-3 font-mono text-xs text-zinc-800"
                        placeholder="...base64..."
                      />
                      <input
                        type="file"
                        accept=".txt,.json,text/plain,application/json"
                        onChange={onSigningPackageFile}
                        className="mt-2 block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={signMyShare}
                        disabled={!wasm || !shareJsonOne || !noncesB64 || !signingPackageB64}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Create signature share
                      </button>
                      <button
                        onClick={() => downloadText('signature_share.json', signatureShareOutJson)}
                        disabled={!signatureShareOutJson}
                        className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Download signature_share.json
                      </button>
                    </div>
                    <div className="mt-3">
                      <b className="text-sm text-zinc-700">signature_share.json</b>
                      <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-zinc-900/90 p-3 font-mono text-xs text-amber-100">
                        {signatureShareOutJson || '—'}
                      </pre>
                    </div>
                  </Card>
      
                  <Card
                    title="(Optional) Local t-of-n Shortcut"
                    subtitle="Only for testing on one device: load multiple SecretShare JSONs, we’ll do rounds and aggregate locally."
                    tip={'Not for production. Real flow must be multi-device.\nThis runs Round-1/2 for all local shares and aggregates.'}
                  >
                    <div className="grid gap-3">
                      <div className="text-sm text-zinc-700">
                        Load multiple SecretShare JSONs:
                        <input
                          type="file"
                          multiple
                          accept=".json,application/json"
                          onChange={(e) => setShareFiles(Array.from(e.target.files || []))}
                          className="mt-2 block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        onClick={signNow}
                        disabled={!wasm || !pubkeyPkgJson || (!eternlJson && !txHex) || shareFiles.length === 0}
                        className="w-fit rounded-xl bg-amber-600 px-4 py-2 text-sm text-white shadow hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Sign now & download results
                      </button>
                      {signResult && (
                        <pre className="max-h-80 overflow-auto rounded-lg bg-zinc-900/90 p-3 font-mono text-xs text-amber-100">
                          {JSON.stringify(signResult, null, 2)}
                        </pre>
                      )}
                    </div>
                  </Card>
                </motion.div>
              )}
      
              {activeTab === 'Coordinator' && (
                <motion.div key="coordinator" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="grid grid-cols-1 gap-6">
                  <Card
                    title="Public Key Package"
                    subtitle="Paste pubkey_package.json here (public)."
                    tip={'Needed to append the final witness.\nSame for all signers.'}
                  >
                    <textarea
                      rows={6}
                      value={pubkeyPkgJson}
                      onChange={e => setPubkeyPkgJson(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white/70 p-3 font-mono text-xs text-zinc-800"
                      placeholder="Paste pubkey_package.json"
                    />
                    <div className="mt-3">
                      <button
                        onClick={derive}
                        disabled={!wasm || !pubkeyPkgJson}
                        className="rounded-xl bg-amber-600 px-4 py-2 text-sm text-white shadow hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Derive address & hash
                      </button>
                    </div>
                    <div className="mt-3 space-y-1 font-mono text-xs text-zinc-700 break-words">
                      <div><b>Pubkey (hex):</b> {pubkeyHex || '—'}</div>
                      <div><b>Pubkey Hash (blake2b-224):</b> {pkHashHex || '—'}</div>
                    </div>
                  </Card>
      
                  <Card
                    title="Coordinator — Transaction Input"
                    subtitle="Provide Eternl JSON or upload a JSON/CBOR file. Used to compute tx_hash."
                    tip={'We hash the Tx body CBOR with Blake2b-256.\nSigners must sign exactly this body.'}
                  >
                    <label className="mb-2 block text-sm text-zinc-700">
                      Paste Eternl JSON:
                      <textarea
                        rows={6}
                        value={eternlJson}
                        onChange={e => setEternlJson(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-zinc-200 bg-white/70 p-3 font-mono text-xs text-zinc-800"
                      />
                    </label>
                    <label className="mb-3 block text-sm text-zinc-700">
                      Or upload JSON/CBOR:
                      <input
                        type="file"
                        onChange={onTxFileChange}
                        className="mt-2 block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <button
                      onClick={parseTx}
                      disabled={!wasm}
                      className="rounded-xl bg-sky-600 px-4 py-2 text-sm text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Parse & compute tx_hash
                    </button>
                    <div className="mt-3 space-y-1 font-mono text-xs text-zinc-700 break-words">
                      <div><b>tx_hash_hex:</b> {txHashHex || '—'}</div>
                      <div><b>tx_hex:</b> {txHex ? `${txHex.slice(0, 32)}... (${txHex.length} hex chars)` : '—'}</div>
                    </div>
                  </Card>
      
                  <Card
                    title="Build Signing Package"
                    subtitle="Bulk upload commitments from t signers, we’ll sort & dedupe and build the signing_package_b64."
                    tip={'One commitment per participating signer for this session.\nDistribute the result back to those signers.'}
                  >
                    <input
                      type="file"
                      accept=".json,application/json"
                      multiple
                      onChange={onCommitmentsFiles}
                      className="mb-3 block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                    />
                    <textarea
                      rows={6}
                      value={commitmentsListJson}
                      onChange={e => setCommitmentsListJson(e.target.value)}
                      className="mb-3 w-full rounded-lg border border-zinc-200 bg-white/70 p-3 font-mono text-xs text-zinc-800"
                      placeholder='[{"identifier":"...","commitments_b64":"..."}, ...]'
                    />
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={buildSigningPackage}
                        disabled={!wasm || (!eternlJson && !txHex) || !commitmentsListJson.trim()}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Build signing package
                      </button>
                      <button
                        onClick={() => downloadText('signing_package_b64.txt', builtSigningPkgB64)}
                        disabled={!builtSigningPkgB64}
                        className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Download signing_package_b64
                      </button>
                    </div>
                    <div className="mt-3">
                      <b className="text-sm text-zinc-700">signing_package_b64</b>
                      <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-zinc-900/90 p-3 font-mono text-xs text-emerald-100">
                        {builtSigningPkgB64 || '—'}
                      </pre>
                    </div>
                  </Card>
      
                  <Card
                    title="Aggregate from Signature Shares"
                    subtitle="Upload signature_share.json from each signer, paste the signing_package_b64, and produce witness & signed tx."
                    tip={'We verify shares, aggregate, and append a vkey witness using the pubkey_package.\nOutputs: group signature, witness set, full signed tx.'}
                  >
                    <label className="mb-3 block text-sm text-zinc-700">
                      Paste signing_package_b64:
                      <textarea
                        rows={3}
                        value={signingPackageB64Agg}
                        onChange={e => setSigningPackageB64Agg(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-zinc-200 bg-white/70 p-3 font-mono text-xs text-zinc-800"
                      />
                    </label>
                    <label className="mb-3 block text-sm text-zinc-700">
                      Upload signature_shares:
                      <input
                        type="file"
                        multiple
                        onChange={e => setSigShareFiles(Array.from(e.target.files || []))}
                        className="mt-2 block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <button
                      onClick={aggregate}
                      disabled={!wasm || !pubkeyPkgJson || !signingPackageB64Agg || (!eternlJson && !txHex) || sigShareFiles.length === 0}
                      className="rounded-xl bg-amber-600 px-4 py-2 text-sm text-white shadow hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Aggregate & download
                    </button>
                    {aggResult && (
                      <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-zinc-900/90 p-3 font-mono text-xs text-amber-100">
                        {JSON.stringify(aggResult, null, 2)}
                      </pre>
                    )}
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>


    </div>
  );
}
