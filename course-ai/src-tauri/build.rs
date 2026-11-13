fn main() {
    println!("cargo:rerun-if-changed=migrations");
    println!("cargo:rerun-if-changed=binaries");
    // sherpa-onnx 的动态库在安装包里放在 Contents/Frameworks（tauri.macos.conf.json 的 frameworks）。
    // 它自己的构建脚本只加了 @loader_path（开发时库就在可执行文件旁边），装好的 .app 里还得找这里。
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");
        // 依赖的构建脚本加的链接参数不会传到本包；不在 .app 里直接跑可执行文件时（库就在旁边）靠这一条。
        println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path");
    }
    #[cfg(target_os = "macos")]
    prepare_ios_plugin_api();
    #[cfg(target_os = "macos")]
    link_ios_plugin();
    #[cfg(target_os = "macos")]
    build_macos_cloud_sync();
    #[cfg(target_os = "windows")]
    copy_sidecars_to_target();
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .plugin(
                "mobile-files",
                tauri_build::InlinedPlugin::new()
                    .commands(&[
                        "persist_picked_file",
                        "pick_and_persist_file",
                        "share_file",
                        "system_bar_insets",
                        "move_task_to_back",
                        "network_info",
                    ])
                    .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
            )
            .plugin(
                "cloud-sync",
                tauri_build::InlinedPlugin::new()
                    .commands(&["account", "start", "status", "sync_now", "stop"])
                    .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
            ),
    )
    .expect("tauri build");
}

/// dev 模式下把 sidecar 可执行文件 + 依赖 DLL + tessdata 复制到 exe 所在目录
/// （target/debug 或 target/release），供 `sidecar::resolve` 在 exe 目录里找到。
/// 打包（tauri build）走 externalBin/resources，不依赖这条。
#[cfg(target_os = "windows")]
fn copy_sidecars_to_target() {
    use std::path::PathBuf;
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let target_dir = manifest_dir.join("target").join(&profile);
    let binaries_dir = manifest_dir.join("binaries");

    let _ = std::fs::create_dir_all(&target_dir);
    let Ok(entries) = std::fs::read_dir(&binaries_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().map(|n| n.to_string_lossy().to_string()) else {
            continue;
        };
        if name.ends_with(".exe") || name.ends_with(".dll") {
            let _ = std::fs::copy(&path, target_dir.join(&name));
        }
    }

    let tessdata_src = binaries_dir.join("tessdata");
    if tessdata_src.is_dir() {
        let tessdata_dst = target_dir.join("binaries").join("tessdata");
        let _ = std::fs::create_dir_all(&tessdata_dst);
        if let Ok(entries) = std::fs::read_dir(&tessdata_src) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().map(|n| n.to_string_lossy().to_string()) {
                    let _ = std::fs::copy(&path, tessdata_dst.join(&name));
                }
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn build_macos_cloud_sync() {
    use std::process::Command;

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }

    let target_arch = std::env::var("CARGO_CFG_TARGET_ARCH").expect("target arch");
    let target = format!("{target_arch}-apple-macosx14.0");
    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let module_cache = out_dir.join("swift-module-cache");
    std::fs::create_dir_all(&module_cache).expect("create Swift module cache");
    let output = out_dir.join("libcourse_cloud_sync.a");
    let sdk = Command::new("xcrun")
        .args(["--sdk", "macosx", "--show-sdk-path"])
        .output()
        .expect("locate macOS SDK");
    assert!(sdk.status.success(), "locate macOS SDK failed");
    let sdk = String::from_utf8(sdk.stdout)
        .expect("macOS SDK path is UTF-8")
        .trim()
        .to_string();

    for source in [
        "ios/CloudSyncCore/Sources/CloudSyncCore/CloudSyncProbeCore.swift",
        "ios/Sources/CloudSyncManager.swift",
        "macos/CloudSyncBridge.swift",
    ] {
        println!("cargo:rerun-if-changed={source}");
    }
    let status = Command::new("xcrun")
        .args([
            "swiftc",
            "-emit-library",
            "-static",
            "-parse-as-library",
            "-target",
            &target,
            "-module-cache-path",
            module_cache.to_str().expect("module cache path"),
            "-sdk",
            &sdk,
            "-module-name",
            "CourseCloudSync",
            "-o",
            output.to_str().expect("output path"),
            "ios/CloudSyncCore/Sources/CloudSyncCore/CloudSyncProbeCore.swift",
            "ios/Sources/CloudSyncManager.swift",
            "macos/CloudSyncBridge.swift",
        ])
        .status()
        .expect("compile macOS CloudKit bridge");
    assert!(status.success(), "compile macOS CloudKit bridge failed");

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-search=native={sdk}/usr/lib/swift");
    println!("cargo:rustc-link-lib=static=course_cloud_sync");
    for framework in ["CloudKit", "CryptoKit", "Foundation", "Security"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
    for library in [
        "swiftCore",
        "swift_Concurrency",
        "swiftCoreFoundation",
        "swiftDispatch",
        "swiftFoundation",
        "swiftIOKit",
        "swiftObjectiveC",
        "swiftUniformTypeIdentifiers",
        "swiftXPC",
        "swift_Builtin_float",
        "swiftos",
    ] {
        println!("cargo:rustc-link-lib=dylib={library}");
    }
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
}

#[cfg(target_os = "macos")]
fn link_ios_plugin() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        tauri_utils::build::link_apple_library("mobile-files", "ios");
    }
}

#[cfg(target_os = "macos")]
fn prepare_ios_plugin_api() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("ios") {
        return;
    }
    let Ok(source) = std::env::var("DEP_TAURI_IOS_LIBRARY_PATH") else {
        return;
    };
    let target = std::path::Path::new("ios").join(".tauri").join("tauri-api");
    let _ = std::fs::remove_dir_all(&target);
    copy_dir_filtered(
        std::path::Path::new(&source),
        &target,
        &[".build", "Package.resolved", "Tests"],
    )
    .expect("copy Tauri iOS API");
}

#[cfg(target_os = "macos")]
fn copy_dir_filtered(
    source: &std::path::Path,
    target: &std::path::Path,
    ignore: &[&str],
) -> std::io::Result<()> {
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let path = entry.path();
        let rel = path.strip_prefix(source).unwrap();
        let rel_str = rel.to_string_lossy();
        if ignore.iter().any(|item| rel_str.starts_with(item)) {
            continue;
        }
        let dest = target.join(rel);
        if path.is_dir() {
            std::fs::create_dir_all(&dest)?;
            copy_dir_filtered(&path, &dest, ignore)?;
        } else {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&path, &dest)?;
            println!("cargo:rerun-if-changed={}", path.display());
        }
    }
    Ok(())
}
