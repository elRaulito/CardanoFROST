/* tslint:disable */
/* eslint-disable */
export function frost_generate_state(max: number, min: number): any;
export function frost_pubkey_bytes(state_json: string): Uint8Array;
export function blake2b224_pubkey(state_json: string): Uint8Array;
export function addr_bech32_from_hashes(pubkey_hash: Uint8Array, stakekey_hash: Uint8Array, is_mainnet: boolean): string;
export function frost_sign_and_witness(state_json: string, message_hex: string, tx_hex: string): any;
export function export_shares_for_download(state_json: string): any;
export function round1_make_commitments(share_file_json: string): any;
export function round2_sign_share(share_file_json: string, nonces_b64: string, signing_package_b64: string): any;
/**
 * Input: Eternl JSON (with cborHex) + array of commitments (id + b64)
 * Output: signing_package (b64, bincode-encoded) and tx_hash_hex
 */
export function build_signing_package_from_eternl(eternl_json: string, commitments_json: string): any;
/**
 * Input: state_json (has pubkey_package), signing_package_b64, array of {identifier, signature_share_b64},
 *        Eternl JSON (with cborHex)
 * Output: full bundle (signature_hex, pubkey_hex, tx_hash_hex, witness_set_hex, signed_tx_hex)
 */
export function aggregate_and_witness_from_eternl(state_json: string, signing_package_b64: string, sig_shares_json: string, eternl_json: string): any;
export function pubkey_package_from_state(state_json: string): any;
export function frost_pubkey_bytes_from_pubkey_package(pubkey_package_json: string): Uint8Array;
export function blake2b224_pubkey_from_pubkey_package(pubkey_package_json: string): Uint8Array;
export function aggregate_and_witness_from_eternl_with_pubkey(pubkey_package_json: string, signing_package_b64: string, sig_shares_json: string, eternl_json: string): any;
/**
 * NEW: parse Eternl JSON and return { tx_hex, tx_hash_hex }
 */
export function parse_eternl_json_and_hash(eternl_json: string): any;
/**
 * NEW: accept CBOR hex directly and return { tx_hash_hex }
 */
export function txhash_from_cbor_hex(tx_hex: string): any;
/**
 * NEW: accept CBOR bytes (Uint8Array from JS) and return { tx_hex, tx_hash_hex }
 */
export function txhash_from_cbor_bytes(tx_bytes: Uint8Array): any;
export function btc_frost_generate_state(max: number, min: number): any;
export function btc_xonly_pubkey_from_pubkey_package(pubkey_pkg_json: string): Uint8Array;
export function btc_p2tr_address_from_pubkey_package(pubkey_pkg_json: string, is_mainnet: boolean): string;
export function btc_build_signing_package_from_psbt(psbt_hex: string, input_index: number, pubkey_pkg_json: string, commitments_json: string): any;
export function btc_round1_make_commitments(share_json: string): any;
export function btc_round2_sign_share(secret_share_json: string, nonces_b64: string, signing_package_b64: string): any;
export function btc_aggregate_and_finalize_psbt(pubkey_pkg_json: string, signing_package_b64: string, sig_shares_json: string, psbt_hex: string, input_index: number): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly frost_generate_state: (a: number, b: number) => [number, number, number];
  readonly frost_pubkey_bytes: (a: number, b: number) => [number, number, number, number];
  readonly blake2b224_pubkey: (a: number, b: number) => [number, number, number, number];
  readonly addr_bech32_from_hashes: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
  readonly frost_sign_and_witness: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly export_shares_for_download: (a: number, b: number) => [number, number, number];
  readonly round1_make_commitments: (a: number, b: number) => [number, number, number];
  readonly round2_sign_share: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly build_signing_package_from_eternl: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly aggregate_and_witness_from_eternl: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
  readonly pubkey_package_from_state: (a: number, b: number) => [number, number, number];
  readonly frost_pubkey_bytes_from_pubkey_package: (a: number, b: number) => [number, number, number, number];
  readonly blake2b224_pubkey_from_pubkey_package: (a: number, b: number) => [number, number, number, number];
  readonly aggregate_and_witness_from_eternl_with_pubkey: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
  readonly parse_eternl_json_and_hash: (a: number, b: number) => [number, number, number];
  readonly txhash_from_cbor_hex: (a: number, b: number) => [number, number, number];
  readonly txhash_from_cbor_bytes: (a: number, b: number) => [number, number, number];
  readonly btc_frost_generate_state: (a: number, b: number) => [number, number, number];
  readonly btc_xonly_pubkey_from_pubkey_package: (a: number, b: number) => [number, number, number, number];
  readonly btc_p2tr_address_from_pubkey_package: (a: number, b: number, c: number) => [number, number, number, number];
  readonly btc_build_signing_package_from_psbt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
  readonly btc_round1_make_commitments: (a: number, b: number) => [number, number, number];
  readonly btc_round2_sign_share: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly btc_aggregate_and_finalize_psbt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
  readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
  readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
  readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
  readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
