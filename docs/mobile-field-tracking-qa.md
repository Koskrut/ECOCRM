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
- [ ] Notification channel importance is low (no sound/vibration spam)
- [ ] Battery optimization set to **Unrestricted** / «Без обмежень»
- [ ] Diagnostics show `Battery optimization: unrestricted/restricted`
- [ ] After repeated background task deaths (`restartCountToday > 2`): app prompts to disable battery optimization

## 5. Recovery

- [ ] Force-stop app → reopen → background task restarts (`resumeTrackingIfNeeded`)
- [ ] Reboot phone → open app → active shift restores tracking
- [ ] `inactive` AppState (notification shade / app switcher) does **not** spam restart logs

## 6. Failure modes

- [ ] If background task fails to start: Shift card shows red warning (not «Збір локацій активний»)
- [ ] Foreground-only permission: warning «GPS тільки поки додаток відкритий»
- [ ] Successful restarts log as info/warn, not error; only failed restarts appear as error
- [ ] Diagnostics show `lastRestartAt`, `restartCountToday`, `lastRestartReason`

## 7. Background watchdog

- [ ] After 15+ minutes in background with task killed by OS, watchdog may restart tracking
- [ ] Web `/visits/team` shows restart count/reason when telemetry is sent
