/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const frost_generate_state: (a: number, b: number) => [number, number, number];
export const frost_pubkey_bytes: (a: number, b: number) => [number, number, number, number];
export const blake2b224_pubkey: (a: number, b: number) => [number, number, number, number];
export const addr_bech32_from_hashes: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
export const frost_sign_and_witness: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
export const export_shares_for_download: (a: number, b: number) => [number, number, number];
export const round1_make_commitments: (a: number, b: number) => [number, number, number];
export const round2_sign_share: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
export const build_signing_package_from_eternl: (a: number, b: number, c: number, d: number) => [number, number, number];
export const aggregate_and_witness_from_eternl: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
export const pubkey_package_from_state: (a: number, b: number) => [number, number, number];
export const frost_pubkey_bytes_from_pubkey_package: (a: number, b: number) => [number, number, number, number];
export const blake2b224_pubkey_from_pubkey_package: (a: number, b: number) => [number, number, number, number];
export const aggregate_and_witness_from_eternl_with_pubkey: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
export const parse_eternl_json_and_hash: (a: number, b: number) => [number, number, number];
export const txhash_from_cbor_hex: (a: number, b: number) => [number, number, number];
export const txhash_from_cbor_bytes: (a: number, b: number) => [number, number, number];
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_start: () => void;
