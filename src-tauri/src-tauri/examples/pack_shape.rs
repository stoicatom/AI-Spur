use aispur::packs;
fn main() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("packs");
    let packs = packs::scan_packs_in(&dir, true);
    for p in packs.iter().take(3) {
        println!("{}", serde_json::to_string_pretty(p).unwrap());
        println!("---");
    }
    println!("total: {}", packs.len());
}
