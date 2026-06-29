# Mobile field tracking — release QA checklist

Run on a **dev / standalone build** (not Expo Go) before each mobile release.

## 1. Shift start and background task

- [ ] Start shift with tracking enabled
- [ ] Open diagnostics (More → tracking debug): **Background task: yes**
- [ ] **Mode** shows `background` when «Allow all the time» is granted

## 2. Background collection (15 min)

- [ ] Minimize the app for ~15 minutes
- [ ] `pendingSamples` increases **or** `lastFlushAt` updates in diagnostics
- [ ] On web `/visits/team`: `gpsStatus` is `ok` for the test user

## 3. Presence vs GPS (web)

- [ ] App badge shows heartbeat state separately from GPS (e.g. «Немає heartbeat» vs «Є GPS»)
- [ ] Detail line shows both: `Heartbeat: … · GPS: …`

## 4. Android

- [ ] Persistent notification **«CRM — зміна активна»** while shift is active
- [ ] Battery optimization set to **Unrestricted** / «Без обмежень»
- [ ] After revoking battery exemption: app prompts again when background task is dead

## 5. Recovery

- [ ] Force-stop app → reopen → background task restarts (`resumeTrackingIfNeeded`)
- [ ] Reboot phone → open app → active shift restores tracking

## 6. Failure modes

- [ ] If background task fails to start: Shift card shows red warning (not «Збір локацій активний»)
- [ ] Foreground-only permission: warning «GPS тільки поки додаток відкритий»
