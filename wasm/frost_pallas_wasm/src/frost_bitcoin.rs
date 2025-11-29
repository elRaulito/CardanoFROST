use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use std::collections::BTreeMap;
use rand::rngs::OsRng;
use hex::FromHex;
use anyhow::Result;

use frost_secp256k1_tr as frost;
use frost_secp256k1_tr::Secp256K1Sha256TR;
use frost_secp256k1_tr::keys::Tweak;

use bitcoin::{
    psbt::Psbt,
    Address, Network,
    taproot,
    key::TweakedPublicKey,
    sighash::{SighashCache, Prevouts, TapSighashType},
    secp256k1::{Secp256k1, XOnlyPublicKey, Scalar},
    hashes::Hash,
    Witness,
};

use base64::{engine::general_purpose, Engine};
use bincode;

// ------------------ helpers ------------------

fn js_err<E: core::fmt::Display>(e: E) -> JsValue {
    JsValue::from_str(&format!("{e}"))
}

fn parse_state(state_json: &str) -> Result<BtcPersistedState, JsValue> {
    let v: serde_json::Value = serde_json::from_str(state_json).map_err(js_err)?;
    if let Some(inner) = v.as_str() {
        serde_json::from_str(inner).map_err(js_err)
    } else {
        serde_json::from_value(v).map_err(js_err)
    }
}

// ------------------ STATE ------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct BtcPersistedState {
    pub max_signers: u16,
    pub min_signers: u16,
    pub shares: Vec<(frost::Identifier, frost::keys::SecretShare)>,
    pub pubkey_package: frost::keys::PublicKeyPackage,
}

// ------------------ DEALER ------------------

#[wasm_bindgen]
pub fn btc_frost_generate_state(max: u16, min: u16) -> Result<JsValue, JsValue> {
    let (shares, pubkey_package) = frost::keys::generate_with_dealer(
        max,
        min,
        frost::keys::IdentifierList::Default,
        &mut OsRng,
    ).map_err(js_err)?;

    let shares_vec: Vec<(frost::Identifier, frost::keys::SecretShare)> =
        shares.into_iter().map(|(id, s)| (id, s)).collect();

    let state = BtcPersistedState {
        max_signers: max,
        min_signers: min,
        shares: shares_vec,
        pubkey_package,
    };

    let json = serde_json::to_string(&state).map_err(js_err)?;
    Ok(JsValue::from_str(&json))
}

// ------------------ PUBKEY / ADDRESS ------------------

#[wasm_bindgen]
pub fn btc_xonly_pubkey_from_pubkey_package(pubkey_pkg_json: &str) -> Result<Vec<u8>, JsValue> {
    let pkg: frost::keys::PublicKeyPackage =
        serde_json::from_str(pubkey_pkg_json).map_err(js_err)?;

    let compressed = pkg.verifying_key().serialize().map_err(js_err)?;
    Ok(compressed[1..33].to_vec())
}

#[wasm_bindgen]
pub fn btc_p2tr_address_from_pubkey_package(pubkey_pkg_json: &str, is_mainnet: bool) -> Result<String, JsValue> {
    let pkg: frost::keys::PublicKeyPackage =
        serde_json::from_str(pubkey_pkg_json).map_err(js_err)?;

    let compressed = pkg.verifying_key().serialize().map_err(js_err)?;
    let xonly = XOnlyPublicKey::from_slice(&compressed[1..33]).map_err(js_err)?;
    let secp = Secp256k1::new();

    let tweak_hash = bitcoin::TapTweakHash::from_key_and_tweak(xonly, None);
    let tweak_bytes: [u8; 32] = *tweak_hash.as_byte_array();
    let tweak = Scalar::from_be_bytes(tweak_bytes).map_err(js_err)?;

    let (tweaked, _) = xonly.add_tweak(&secp, &tweak).map_err(js_err)?;
    let tweaked_pk = TweakedPublicKey::dangerous_assume_tweaked(tweaked);

    let net = if is_mainnet { Network::Bitcoin } else { Network::Testnet };
    Ok(Address::p2tr_tweaked(tweaked_pk, net).to_string())
}

// ------------------ SIGNING PACKAGE ------------------

#[derive(Serialize, Deserialize)]
pub struct BtcSigningPackageOut {
    pub signing_package_b64: String,
    pub sighash_hex: String,
    pub address: String,
}

#[wasm_bindgen]
pub fn btc_build_signing_package_from_psbt(
    psbt_hex: &str,
    input_index: u32,
    pubkey_pkg_json: &str,
) -> Result<JsValue, JsValue> {

    let psbt_bytes = hex::decode(psbt_hex).map_err(js_err)?;
    let mut slice: &[u8] = &psbt_bytes;
    let psbt = Psbt::deserialize(&mut slice).map_err(js_err)?;

    let prevouts_vec: Vec<&bitcoin::TxOut> = psbt.inputs
        .iter()
        .map(|i| i.witness_utxo.as_ref().expect("missing witness_utxo"))
        .collect();

    let prevouts = Prevouts::All(&prevouts_vec);

    let mut cache = SighashCache::new(&psbt.unsigned_tx);

    let sighash = cache.taproot_key_spend_signature_hash(
        input_index as usize,
        &prevouts,
        TapSighashType::Default,
    ).map_err(js_err)?;

    let msg: [u8; 32] = sighash.to_byte_array();
    let sighash_hex = hex::encode(msg);

    let pkg: frost::keys::PublicKeyPackage =
        serde_json::from_str(pubkey_pkg_json).map_err(js_err)?;

    let compressed = pkg.verifying_key().serialize().map_err(js_err)?;
    let xonly = XOnlyPublicKey::from_slice(&compressed[1..33]).map_err(js_err)?;
    let secp = Secp256k1::new();

    let tweak_hash = bitcoin::TapTweakHash::from_key_and_tweak(xonly, None);
    let tweak_bytes: [u8; 32] = *tweak_hash.as_byte_array();
    let tweak = Scalar::from_be_bytes(tweak_bytes).map_err(js_err)?;

    let (tweaked, _) = xonly.add_tweak(&secp, &tweak).map_err(js_err)?;
    let tweaked_pk = TweakedPublicKey::dangerous_assume_tweaked(tweaked);

    let addr = Address::p2tr_tweaked(tweaked_pk, Network::Bitcoin).to_string();

    let signing_pkg = frost::SigningPackage::new(BTreeMap::new(), &msg);
    let bin = bincode::serialize(&signing_pkg).map_err(js_err)?;
    let signing_package_b64 = general_purpose::STANDARD.encode(bin);

    let out = BtcSigningPackageOut {
        signing_package_b64,
        sighash_hex,
        address: addr,
    };

    Ok(JsValue::from_str(&serde_json::to_string(&out).map_err(js_err)?))
}

// ------------------ ROUND 1 ------------------

#[wasm_bindgen]
pub fn btc_round1_make_commitments(share_json: &str) -> Result<JsValue, JsValue> {
    let ss: frost::keys::SecretShare = serde_json::from_str(share_json).map_err(js_err)?;
    let kp = frost::keys::KeyPackage::try_from(ss.clone()).map_err(js_err)?;

    let (nonces, commitments) = frost::round1::commit(kp.signing_share(), &mut OsRng);

    let out = serde_json::json!({
        "identifier": kp.identifier(),
        "nonces_b64": general_purpose::STANDARD.encode(bincode::serialize(&nonces).map_err(js_err)?),
        "commitments_b64": general_purpose::STANDARD.encode(bincode::serialize(&commitments).map_err(js_err)?)
    });

    Ok(JsValue::from_str(&out.to_string()))
}

// ------------------ ROUND 2 ------------------

#[wasm_bindgen]
pub fn btc_round2_sign_share(
    share_json: &str,
    nonces_b64: &str,
    signing_package_b64: &str,
) -> Result<JsValue, JsValue> {

    let ss: frost::keys::SecretShare = serde_json::from_str(share_json).map_err(js_err)?;
    let kp = frost::keys::KeyPackage::try_from(ss).map_err(js_err)?;

    let nonces: frost::round1::SigningNonces = bincode::deserialize(
        &general_purpose::STANDARD.decode(nonces_b64).map_err(js_err)?
    ).map_err(js_err)?;

    let sp: frost::SigningPackage = bincode::deserialize(
        &general_purpose::STANDARD.decode(signing_package_b64).map_err(js_err)?
    ).map_err(js_err)?;

    let sig = frost::round2::sign(&sp, &nonces, &kp).map_err(js_err)?;

    let out = serde_json::json!({
        "identifier": kp.identifier(),
        "signature_share_b64": general_purpose::STANDARD.encode(
            bincode::serialize(&sig).map_err(js_err)?
        )
    });

    Ok(JsValue::from_str(&out.to_string()))
}

// ------------------ AGGREGATE + FINAL TX ------------------

#[wasm_bindgen]
pub fn btc_aggregate_and_finalize_psbt(
    pubkey_pkg_json: &str,
    signing_package_b64: &str,
    sig_shares_json: &str,
    psbt_hex: &str,
    input_index: u32,
) -> Result<JsValue, JsValue> {

    let pkg: frost::keys::PublicKeyPackage =
        serde_json::from_str(pubkey_pkg_json).map_err(js_err)?;

    let mut sp: frost::SigningPackage = bincode::deserialize(
        &general_purpose::STANDARD.decode(signing_package_b64).map_err(js_err)?
    ).map_err(js_err)?;

    let shares: Vec<serde_json::Value> = serde_json::from_str(sig_shares_json).map_err(js_err)?;

    let mut map = BTreeMap::new();
    for v in shares {
        let id: frost::Identifier = serde_json::from_value(v["identifier"].clone()).unwrap();
        let sig: frost::round2::SignatureShare = bincode::deserialize(
            &general_purpose::STANDARD.decode(v["signature_share_b64"].as_str().unwrap()).unwrap()
        ).unwrap();
        map.insert(id, sig);
    }

    let sig = frost::aggregate_with_tweak(&sp, &map, &pkg, None).map_err(js_err)?;

    let sig64: [u8; 64] = sig.serialize().map_err(js_err)?.try_into().unwrap();

    let mut slice: &[u8] = &hex::decode(psbt_hex).map_err(js_err)?;
    let mut psbt = Psbt::deserialize(&mut slice).map_err(js_err)?;

    let tap_sig = taproot::Signature::from_slice(&sig64).map_err(js_err)?;
    psbt.inputs[input_index as usize].tap_key_sig = Some(tap_sig);
    psbt.inputs[input_index as usize].final_script_witness = Some(Witness::from(vec![sig64.to_vec()]));

    let final_tx = psbt.extract_tx().map_err(js_err)?;
    let final_hex = bitcoin::consensus::encode::serialize_hex(&final_tx);

    let out = serde_json::json!({
        "final_tx_hex": final_hex,
        "sig_hex": hex::encode(sig64),
    });

    Ok(JsValue::from_str(&out.to_string()))
}
