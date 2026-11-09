# Retiradas Android TWA

Android wrapper for the REVO PWA hosted at `https://retiradas.tech`.

- Package: `br.com.brasiltecpar.retiradas`
- Generator: Bubblewrap
- Current version: `1.0.6` (`versionCode 106`)
- Production signing fingerprint: `D6:AA:94:49:78:01:5C:F5:7A:E9:FD:06:C6:49:2E:3E:61:4D:31:C6:B9:1B:38:DB:67:B7:65:03:0E:33:F4:EB`

The TWA delegates Web Push to Chrome and includes a native foreground location
service for technicians. Enrollment uses a one-time server code and the device
token is encrypted with Android Keystore before it is stored locally.

The private keystore and its password must never be committed. On the original build workstation they are stored under `%USERPROFILE%\.codex\secrets\retiradas-android`.

Build from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/android/build-retiradas-twa.ps1
```

The script writes the signed APK and AAB to `artifacts/android/retiradas`.
