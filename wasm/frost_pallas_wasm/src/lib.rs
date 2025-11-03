use wasm_bindgen::prelude::*;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use blake2b_simd::Params;
use bech32::{encode, Bech32, Hrp};
use frost_ed25519 as frost;
use frost_ed25519::VerifyingKey;
use hex::FromHex;
use rand::rngs::OsRng;
use pallas_codec::minicbor;
use pallas_crypto::hash::Hasher;
use pallas_primitives::conway::Tx;
use pallas_primitives::{NonEmptySet, conway::VKeyWitness};
use serde_json::Value;
use base64::{engine::general_purpose, Engine as _};
use bincode;


fn parse_share_file_flexible(json: &str) -> Result<ShareFile, JsValue> {
    // 1) Try full ShareFile first
    if let Ok(sf) = serde_json::from_str::<ShareFile>(json) {
        return Ok(sf);
    }

    // 2) Fallback: plain SecretShare (your file format)
    let ss: frost::keys::SecretShare = serde_json::from_str(json).map_err(js_err)?;
    let kp = frost::keys::KeyPackage::try_from(ss.clone()).map_err(js_err)?;

    // ⬅️ FIX: take the identifier by value (dereference the &Identifier)
    let identifier: frost::Identifier = *kp.identifier();
    // If that doesn't compile in your crate version, use:
    // let identifier = kp.identifier().clone();
    // or:
    // let identifier = kp.identifier().to_owned();

    Ok(ShareFile {
        identifier,
        secret_share: ss,
    })
}



// helper: serialize to JSON string -> JsValue
fn js_json<T: Serialize>(v: &T) -> Result<JsValue, JsValue> {
    let s = serde_json::to_string(v).map_err(js_err)?;
    Ok(JsValue::from_str(&s))
}

// ------------- helpers -------------

fn parse_state(state_json: &str) -> Result<PersistedState, JsValue> {
    let v: serde_json::Value = serde_json::from_str(state_json).map_err(js_err)?;
    if let Some(inner) = v.as_str() {
        let st: PersistedState = serde_json::from_str(inner).map_err(js_err)?;
        Ok(st)
    } else {
        let st: PersistedState = serde_json::from_value(v).map_err(js_err)?;
        Ok(st)
    }
}


#[derive(Serialize, Deserialize, Clone)]
pub struct PersistedState {
    pub max_signers: u16,
    pub min_signers: u16,
    pub shares: Vec<(frost::Identifier, frost::keys::SecretShare)>,
    pub pubkey_package: frost::keys::PublicKeyPackage,
}

fn blake2b_224(data: &[u8]) -> [u8; 28] {
    let mut st = Params::new().hash_length(28).to_state();
    st.update(data);
    let hash = st.finalize();
    let mut out = [0u8; 28];
    out.copy_from_slice(hash.as_bytes());
    out
}

fn js_err<E: core::fmt::Display>(e: E) -> JsValue { JsValue::from_str(&format!("{e}")) }

#[wasm_bindgen]
pub fn frost_generate_state(max: u16, min: u16) -> Result<JsValue, JsValue> {
    let (shares, pubkey_package) = frost::keys::generate_with_dealer(
        max,
        min,
        frost::keys::IdentifierList::Default,
        &mut OsRng,
    ).map_err(js_err)?;
    let shares_vec: Vec<(frost::Identifier, frost::keys::SecretShare)> =
        shares.into_iter().map(|(id, s)| (id, s)).collect();
    let state = PersistedState { max_signers: max, min_signers: min, shares: shares_vec, pubkey_package };
    let json = serde_json::to_string(&state).map_err(js_err)?;
Ok(JsValue::from_str(&json))
}



// === already present ===
// #[derive(Serialize, Deserialize, Clone)] pub struct PersistedState { ... }
// fn blake2b_224(...)
// #[wasm_bindgen] pub fn frost_generate_state(...)

// === MISSING: export raw 32-byte verifying key ===
#[wasm_bindgen]
pub fn frost_pubkey_bytes(state_json: &str) -> Result<Box<[u8]>, JsValue> {
    let state: PersistedState = serde_json::from_str(state_json).map_err(js_err)?;
    let vk = state.pubkey_package.verifying_key();
    let bytes = VerifyingKey::serialize(&vk).map_err(js_err)?; // 32 bytes
    Ok(bytes.into_boxed_slice())
}

// === MISSING: export BLAKE2b-224(pubkey) ===
#[wasm_bindgen]
pub fn blake2b224_pubkey(state_json: &str) -> Result<Box<[u8]>, JsValue> {
    let vk = frost_pubkey_bytes(state_json)?;   // 32 bytes
    let hash = blake2b_224(&vk);               // 28 bytes
    Ok(Box::new(hash))
}

// === MISSING: simple Bech32 encoder using your payload format ===
#[wasm_bindgen]
pub fn addr_bech32_from_hashes(
    pubkey_hash: &[u8],
    stakekey_hash: &[u8],
    is_mainnet: bool
) -> Result<String, JsValue> {
    if pubkey_hash.len() != 28 { return Err(js_err("pubkey_hash must be 28 bytes")); }
    if stakekey_hash.len() != 28 { return Err(js_err("stakekey_hash must be 28 bytes")); }

    let hrp = Hrp::parse(if is_mainnet { "addr" } else { "addr_test" }).map_err(js_err)?;

    let mut payload = Vec::with_capacity(1 + 28 + 28);
    payload.push(if is_mainnet { 0x01 } else { 0x00 }); // network byte
    payload.extend_from_slice(pubkey_hash);
    payload.extend_from_slice(stakekey_hash);

    let bech = encode::<Bech32>(hrp, &payload).map_err(js_err)?;
    Ok(bech)
}

// (Optional) If you want signing + witness here too:
// This matches what the UI expects as `frost_sign_and_witness(...)`
#[wasm_bindgen]
pub fn frost_sign_and_witness(
    state_json: &str,
    message_hex: &str,
    tx_hex: &str,
) -> Result<JsValue, JsValue> {
    let state: PersistedState = serde_json::from_str(state_json).map_err(js_err)?;

    // rebuild key packages
    let mut key_packages = std::collections::BTreeMap::new();
    for (identifier, secret_share) in state.shares.iter() {
        let kp = frost::keys::KeyPackage::try_from(secret_share.clone()).map_err(js_err)?;
        key_packages.insert(*identifier, kp);
    }

    let msg = hex::decode(message_hex).map_err(js_err)?;

    // Round 1
    let mut commitments_map = std::collections::BTreeMap::new();
    let mut nonces_map = std::collections::BTreeMap::new();
    for participant_idx in 1..=state.min_signers {
        let pid: frost::Identifier = participant_idx.try_into().map_err(|_| js_err("bad identifier"))?;
        let kp = key_packages.get(&pid).ok_or_else(|| js_err("missing key package"))?;
        let (nonces, commitments) = frost::round1::commit(kp.signing_share(), &mut OsRng);
        nonces_map.insert(pid, nonces);
        commitments_map.insert(pid, commitments);
    }

    let signing_package = frost::SigningPackage::new(commitments_map, &msg);

    // Round 2
    let mut sig_shares = std::collections::BTreeMap::new();
    for (pid, nonces) in nonces_map.iter() {
        let kp = key_packages.get(pid).ok_or_else(|| js_err("missing kp"))?;
        let share = frost::round2::sign(&signing_package, nonces, kp).map_err(js_err)?;
        sig_shares.insert(*pid, share);
    }

    // Aggregate
    let group_sig = frost::aggregate(&signing_package, &sig_shares, &state.pubkey_package).map_err(js_err)?;
    let sig_bytes: Vec<u8> = group_sig.serialize().map_err(js_err)?;
    let sig_hex = hex::encode(&sig_bytes);

    // Decode/encode Tx
    let tx_bytes = hex::decode(tx_hex).map_err(js_err)?;
    let mut tx: Tx = minicbor::decode(&tx_bytes).map_err(js_err)?;
    let body_cbor = minicbor::to_vec(&tx.transaction_body).map_err(js_err)?;
    let tx_hash = Hasher::<256>::hash(&body_cbor);
    let tx_hash_hex = hex::encode(tx_hash);

    let vk_bytes = VerifyingKey::serialize(&state.pubkey_package.verifying_key()).map_err(js_err)?;

    // append witness
    let mut vkeys = tx
        .transaction_witness_set
        .vkeywitness
        .as_ref()
        .map(|x| x.clone().to_vec())
        .unwrap_or_default();

    vkeys.push(VKeyWitness {
        vkey: vk_bytes.clone().into(),
        signature: sig_bytes.clone().into(),
    });

    tx.transaction_witness_set.vkeywitness =
        Some(NonEmptySet::from_vec(vkeys).expect("at least one"));

    let witness_set_cbor = minicbor::to_vec(&tx.transaction_witness_set).map_err(js_err)?;
    let witness_set_hex = hex::encode(&witness_set_cbor);

    let signed_tx_cbor = minicbor::to_vec(&tx).map_err(js_err)?;
    let signed_tx_hex = hex::encode(&signed_tx_cbor);

    let out = serde_json::json!({
        "signature_hex": sig_hex,
        "pubkey_hex": hex::encode(&vk_bytes),
        "tx_hash_hex": tx_hash_hex,
        "witness_set_hex": witness_set_hex,
        "signed_tx_hex": signed_tx_hex
    });

    let json = serde_json::to_string(&out).map_err(js_err)?;
    Ok(JsValue::from_str(&json))
}
















#[derive(Serialize, Deserialize)]
struct ShareFile {
    identifier: frost::Identifier,
    secret_share: frost::keys::SecretShare,
}

#[derive(Serialize, Deserialize)]
struct EternlTx {
    #[serde(default)]
    r#type: Option<String>,
    #[serde(default)]
    description: Option<String>,
    cborHex: String,
}

#[derive(Serialize, Deserialize)]
struct CommitmentsOut {
    identifier: frost::Identifier,
    commitments_b64: String,   // bincode-serialized frost::round1::SigningCommitments
    nonces_b64: String,        // bincode-serialized frost::round1::SigningNonces (keep private!)
}

#[derive(Serialize, Deserialize)]
struct CommitmentsIn {
    identifier: frost::Identifier,
    commitments_b64: String,
}

#[derive(Serialize, Deserialize)]
struct SigningPackageOut {
    signing_package_b64: String,
    tx_hash_hex: String,
}

#[derive(Serialize, Deserialize)]
struct SignatureShareOut {
    identifier: frost::Identifier,
    signature_share_b64: String,
}

// ------------- (A) DOWNLOAD SHARES -------------

#[derive(serde::Serialize)]
struct ShareDownload {
    identifier_hex: String,
    share_json: String,
}

#[wasm_bindgen]
pub fn export_shares_for_download(state_json: &str) -> Result<JsValue, JsValue> {
    let state = parse_state(state_json)?;
    let mut out: Vec<ShareDownload> = Vec::new();

    for (_id, s) in state.shares.iter() {
        // serialize the SecretShare to JSON
        let share_val: Value = serde_json::to_value(s).map_err(js_err)?;
        // pull the "identifier" field (already a hex string via serde)
        let identifier_hex = share_val
            .get("identifier")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown_identifier")
            .to_string();

        let share_json = serde_json::to_string(s).map_err(js_err)?;
        out.push(ShareDownload { identifier_hex, share_json });
    }

    // Return as JSON (string); or use `JsValue::from_serde(&out)` if you enabled that feature
    let json = serde_json::to_string(&out).map_err(js_err)?;
    Ok(JsValue::from_str(&json))
}

// ------------- (B) ROUND 1: COMMITMENTS PER SIGNER -------------



#[wasm_bindgen]
pub fn round1_make_commitments(share_file_json: &str) -> Result<JsValue, JsValue> {
    let sf = parse_share_file_flexible(share_file_json)?;
    let kp = frost::keys::KeyPackage::try_from(sf.secret_share).map_err(js_err)?;
    let (nonces, commitments) = frost::round1::commit(kp.signing_share(), &mut OsRng);

    let nonces_b64 = general_purpose::STANDARD.encode(bincode::serialize(&nonces).map_err(js_err)?);
    let commits_b64 = general_purpose::STANDARD.encode(bincode::serialize(&commitments).map_err(js_err)?);

    js_json(&CommitmentsOut {
        identifier: sf.identifier,
        nonces_b64,
        commitments_b64: commits_b64,
    })
}

#[wasm_bindgen]
pub fn round2_sign_share(
    share_file_json: &str,
    nonces_b64: &str,
    signing_package_b64: &str,
) -> Result<JsValue, JsValue> {
    let sf = parse_share_file_flexible(share_file_json)?;
    let kp = frost::keys::KeyPackage::try_from(sf.secret_share).map_err(js_err)?;

    let nonces: frost::round1::SigningNonces =
        bincode::deserialize(&general_purpose::STANDARD.decode(nonces_b64).map_err(js_err)?)
            .map_err(js_err)?;
    let sp: frost::SigningPackage =
        bincode::deserialize(&general_purpose::STANDARD.decode(signing_package_b64).map_err(js_err)?)
            .map_err(js_err)?;

    let sig_share = frost::round2::sign(&sp, &nonces, &kp).map_err(js_err)?;
    let signature_share_b64 = general_purpose::STANDARD.encode(bincode::serialize(&sig_share).map_err(js_err)?);

    js_json(&SignatureShareOut {
        identifier: sf.identifier,
        signature_share_b64,
    })
}


// ------------- (C) BUILD SIGNING PACKAGE (COORDINATOR) -------------

/// Input: Eternl JSON (with cborHex) + array of commitments (id + b64)
/// Output: signing_package (b64, bincode-encoded) and tx_hash_hex
#[wasm_bindgen]
pub fn build_signing_package_from_eternl(
    eternl_json: &str,
    commitments_json: &str,
) -> Result<JsValue, JsValue> {
    let txj: EternlTx = serde_json::from_str(eternl_json).map_err(js_err)?;
    let tx_bytes = hex::decode(txj.cborHex).map_err(js_err)?;
    let mut tx: Tx = minicbor::decode(&tx_bytes).map_err(js_err)?;
    let body_cbor = minicbor::to_vec(&tx.transaction_body).map_err(js_err)?;
    let tx_hash = Hasher::<256>::hash(&body_cbor);
    let tx_hash_hex = hex::encode(tx_hash);

    let c_list: Vec<CommitmentsIn> = serde_json::from_str(commitments_json).map_err(js_err)?;

    // Rebuild map<Identifier, SigningCommitments>
    let mut map = std::collections::BTreeMap::new();
    for c in c_list {
        let commits_bin = general_purpose::STANDARD
            .decode(c.commitments_b64)
            .map_err(js_err)?;
        let commits: frost::round1::SigningCommitments =
            bincode::deserialize(&commits_bin).map_err(js_err)?;
        map.insert(c.identifier, commits);
    }

    // Option 1: Pass directly as a slice (recommended)
let sp = frost::SigningPackage::new(map, tx_hash.as_ref());

    // Serialize signing package with bincode and base64 it
    let sp_bin = bincode::serialize(&sp).map_err(js_err)?;
    let sp_b64 = general_purpose::STANDARD.encode(sp_bin);

    let out = SigningPackageOut {
        signing_package_b64: sp_b64,
        tx_hash_hex,
    };
    js_json(&out)
}

// ------------- (D) ROUND 2: SIGN SHARE (EACH SIGNER) -------------

// ------------- (E) AGGREGATE + APPEND WITNESS -------------

/// Input: state_json (has pubkey_package), signing_package_b64, array of {identifier, signature_share_b64},
///        Eternl JSON (with cborHex)
/// Output: full bundle (signature_hex, pubkey_hex, tx_hash_hex, witness_set_hex, signed_tx_hex)
#[wasm_bindgen]
pub fn aggregate_and_witness_from_eternl(
    state_json: &str,
    signing_package_b64: &str,
    sig_shares_json: &str,
    eternl_json: &str,
) -> Result<JsValue, JsValue> {
    let state = parse_state(state_json)?;
    let sp_bin = general_purpose::STANDARD.decode(signing_package_b64).map_err(js_err)?;
    let sp: frost::SigningPackage = bincode::deserialize(&sp_bin).map_err(js_err)?;

    // Rebuild map<Identifier, SignatureShare>
    #[derive(Deserialize)]
    struct SigIn { identifier: frost::Identifier, signature_share_b64: String }
    let list: Vec<SigIn> = serde_json::from_str(sig_shares_json).map_err(js_err)?;
    let mut map = std::collections::BTreeMap::new();
    for x in list {
        let bin = general_purpose::STANDARD.decode(x.signature_share_b64).map_err(js_err)?;
        let share: frost::round2::SignatureShare = bincode::deserialize(&bin).map_err(js_err)?;
        map.insert(x.identifier, share);
    }

    // Aggregate
    let group_sig = frost::aggregate(&sp, &map, &state.pubkey_package).map_err(js_err)?;
    let sig_bytes: Vec<u8> = group_sig.serialize().map_err(js_err)?;
    let sig_hex = hex::encode(&sig_bytes);

    // Reconstruct tx + body hash
    let txj: EternlTx = serde_json::from_str(eternl_json).map_err(js_err)?;
    let tx_bytes = hex::decode(txj.cborHex).map_err(js_err)?;
    let mut tx: Tx = minicbor::decode(&tx_bytes).map_err(js_err)?;
    let body_cbor = minicbor::to_vec(&tx.transaction_body).map_err(js_err)?;
    let tx_hash = Hasher::<256>::hash(&body_cbor);
    let tx_hash_hex = hex::encode(tx_hash);

    // Append witness
    let vk_bytes = VerifyingKey::serialize(&state.pubkey_package.verifying_key()).map_err(js_err)?;

    let mut vkeys = tx
        .transaction_witness_set
        .vkeywitness
        .as_ref()
        .map(|x| x.clone().to_vec())
        .unwrap_or_default();

    vkeys.push(VKeyWitness {
        vkey: vk_bytes.clone().into(),
        signature: sig_bytes.clone().into(),
    });

    tx.transaction_witness_set.vkeywitness =
        Some(NonEmptySet::from_vec(vkeys).expect("at least one"));

    let witness_set_cbor = minicbor::to_vec(&tx.transaction_witness_set).map_err(js_err)?;
    let witness_set_hex = hex::encode(&witness_set_cbor);

    let signed_tx_cbor = minicbor::to_vec(&tx).map_err(js_err)?;
    let signed_tx_hex = hex::encode(&signed_tx_cbor);

    let out = serde_json::json!({
        "signature_hex": sig_hex,
        "pubkey_hex": hex::encode(&vk_bytes),
        "tx_hash_hex": tx_hash_hex,
        "witness_set_hex": witness_set_hex,
        "signed_tx_hex": signed_tx_hex
    });
    js_json(&out)
}











// --- PUBLIC-ONLY helpers (no secrets) ---

#[wasm_bindgen]
pub fn pubkey_package_from_state(state_json: &str) -> Result<JsValue, JsValue> {
    let state = parse_state(state_json)?;
    let out = serde_json::to_string(&state.pubkey_package).map_err(js_err)?;
    Ok(JsValue::from_str(&out))
}

#[wasm_bindgen]
pub fn frost_pubkey_bytes_from_pubkey_package(pubkey_package_json: &str) -> Result<Vec<u8>, JsValue> {
    let pkg: frost::keys::PublicKeyPackage = serde_json::from_str(pubkey_package_json).map_err(js_err)?;
    let vk = pkg.verifying_key();
    VerifyingKey::serialize(&vk).map_err(js_err)
}

#[wasm_bindgen]
pub fn blake2b224_pubkey_from_pubkey_package(pubkey_package_json: &str) -> Result<Vec<u8>, JsValue> {
    let pkg: frost::keys::PublicKeyPackage = serde_json::from_str(pubkey_package_json).map_err(js_err)?;
    let vk = VerifyingKey::serialize(&pkg.verifying_key()).map_err(js_err)?;
    let mut st = blake2b_simd::Params::new().hash_length(28).to_state();
    st.update(&vk);
    Ok(st.finalize().as_bytes().to_vec())
}

// Same as your existing aggregate function, but takes only the public key package:
#[wasm_bindgen]
pub fn aggregate_and_witness_from_eternl_with_pubkey(
    pubkey_package_json: &str,
    signing_package_b64: &str,
    sig_shares_json: &str,
    eternl_json: &str,
) -> Result<JsValue, JsValue> {
    // parse pubkey package
    let pubkey_package: frost::keys::PublicKeyPackage =
        serde_json::from_str(pubkey_package_json).map_err(js_err)?;

    // decode signing package
    let sp_bin = base64::engine::general_purpose::STANDARD
        .decode(signing_package_b64)
        .map_err(js_err)?;
    let sp: frost::SigningPackage = bincode::deserialize(&sp_bin).map_err(js_err)?;

    // rebuild signature shares
    #[derive(Deserialize)]
    struct SigIn { identifier: frost::Identifier, signature_share_b64: String }
    let list: Vec<SigIn> = serde_json::from_str(sig_shares_json).map_err(js_err)?;
    let mut map = std::collections::BTreeMap::new();
    for x in list {
        let bin = base64::engine::general_purpose::STANDARD
            .decode(x.signature_share_b64)
            .map_err(js_err)?;
        let share: frost::round2::SignatureShare = bincode::deserialize(&bin).map_err(js_err)?;
        map.insert(x.identifier, share);
    }

    // aggregate
    let group_sig = frost::aggregate(&sp, &map, &pubkey_package).map_err(js_err)?;
    let sig_bytes: Vec<u8> = group_sig.serialize().map_err(js_err)?;
    let sig_hex = hex::encode(&sig_bytes);

    // reconstruct tx from Eternl
    let txj: EternlTxJson = serde_json::from_str(eternl_json).map_err(js_err)?;
    let tx_bytes = hex::decode(txj.cborHex).map_err(js_err)?;
    let mut tx: pallas_primitives::conway::Tx = pallas_codec::minicbor::decode(&tx_bytes).map_err(js_err)?;
    let body_cbor = pallas_codec::minicbor::to_vec(&tx.transaction_body).map_err(js_err)?;
    let tx_hash = pallas_crypto::hash::Hasher::<256>::hash(&body_cbor);

    // append witness
    let vk_bytes = VerifyingKey::serialize(&pubkey_package.verifying_key()).map_err(js_err)?;
    let mut vkeys = tx
        .transaction_witness_set
        .vkeywitness
        .as_ref()
        .map(|x| x.clone().to_vec())
        .unwrap_or_default();
    vkeys.push(pallas_primitives::conway::VKeyWitness {
        vkey: vk_bytes.clone().into(),
        signature: sig_bytes.clone().into(),
    });
    tx.transaction_witness_set.vkeywitness =
        Some(pallas_primitives::NonEmptySet::from_vec(vkeys).expect("at least one"));

    // outputs
    let witness_set_hex = hex::encode(pallas_codec::minicbor::to_vec(&tx.transaction_witness_set).map_err(js_err)?);
    let signed_tx_hex   = hex::encode(pallas_codec::minicbor::to_vec(&tx).map_err(js_err)?);

    let out = serde_json::json!({
        "tx_hash_hex": hex::encode(tx_hash),
        "signature_hex": sig_hex,
        "pubkey_hex": hex::encode(&vk_bytes),
        "witness_set_hex": witness_set_hex,
        "signed_tx_hex": signed_tx_hex
    });
    js_json(&out)
}





#[derive(Deserialize)]
struct EternlTxJson {
    #[serde(default)]
    r#type: String,
    #[serde(default)]
    description: String,
    cborHex: String,
}


/// NEW: parse Eternl JSON and return { tx_hex, tx_hash_hex }
#[wasm_bindgen]
pub fn parse_eternl_json_and_hash(eternl_json: &str) -> Result<JsValue, JsValue> {
    let parsed: EternlTxJson = serde_json::from_str(eternl_json).map_err(js_err)?;
    let tx_bytes = hex::decode(&parsed.cborHex).map_err(js_err)?;
    let tx: Tx = minicbor::decode(&tx_bytes).map_err(js_err)?;
    let body_cbor = minicbor::to_vec(&tx.transaction_body).map_err(js_err)?;
    let tx_hash = Hasher::<256>::hash(&body_cbor);

    let out = serde_json::json!({
        "tx_hex": parsed.cborHex,
        "tx_hash_hex": hex::encode(tx_hash)
    });
    let json = serde_json::to_string(&out).map_err(js_err)?;
    Ok(JsValue::from_str(&json))
}

/// NEW: accept CBOR hex directly and return { tx_hash_hex }
#[wasm_bindgen]
pub fn txhash_from_cbor_hex(tx_hex: &str) -> Result<JsValue, JsValue> {
    let tx_bytes = hex::decode(tx_hex).map_err(js_err)?;
    let tx: Tx = minicbor::decode(&tx_bytes).map_err(js_err)?;
    let body_cbor = minicbor::to_vec(&tx.transaction_body).map_err(js_err)?;
    let tx_hash = Hasher::<256>::hash(&body_cbor);
    let out = serde_json::json!({ "tx_hash_hex": hex::encode(tx_hash) });
    let json = serde_json::to_string(&out).map_err(js_err)?;
    Ok(JsValue::from_str(&json))
}

/// NEW: accept CBOR bytes (Uint8Array from JS) and return { tx_hex, tx_hash_hex }
#[wasm_bindgen]
pub fn txhash_from_cbor_bytes(tx_bytes: &[u8]) -> Result<JsValue, JsValue> {
    let tx: Tx = minicbor::decode(tx_bytes).map_err(js_err)?;
    let body_cbor = minicbor::to_vec(&tx.transaction_body).map_err(js_err)?;
    let tx_hash = Hasher::<256>::hash(&body_cbor);
    let out = serde_json::json!({
        "tx_hex": hex::encode(tx_bytes),
        "tx_hash_hex": hex::encode(tx_hash)
    });
    let json = serde_json::to_string(&out).map_err(js_err)?;
    Ok(JsValue::from_str(&json))
}





