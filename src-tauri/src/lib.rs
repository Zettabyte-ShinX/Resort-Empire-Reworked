//! Tauri shell for Resort Empire Reworked.
//!
//! The game itself is a web application; this crate only provides the native
//! window and the platform installers (deb / AppImage / msi / nsis).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Resort Empire Reworked");
}
