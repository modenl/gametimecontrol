# Game Time Control

Electron + React + TypeScript Windows kiosk app for controlling a child's weekly game time on a single PC.

## What is implemented

- Child mode by default, with admin unlock using the default password `qwert`
- Local JSON persistence for config, runtime state, and weekly usage ledger
- White-listed game launcher driven from the Electron main process
- 2-hour weekly budget, 40-minute max session, 4-hour cooldown between sessions
- Session recovery after reboot using the original countdown budget
- Timeout kill via `taskkill /T /F`
- Full-screen kiosk shell with always-on-top and power-save blocking
- Child/admin UI with a modern, low-chrome visual system
- Packaging setup for `electron-builder`
- One-line installer helper and shell/startup configuration scripts

## Project structure

- `src/main`: Electron main process, storage, session timing, launcher, kiosk controls, IPC
- `src/preload`: secure renderer bridge
- `src/renderer`: React UI for child and admin modes
- `scripts`: install/bootstrap and shell replacement helpers

## Development

1. Install dependencies.
2. Run `npm.cmd install`
3. Run `npm.cmd run dev`
4. Build with `npm.cmd run build`
5. Package with `npm.cmd run dist`

## One-line install

Fastest install from GitHub Releases:

This command does two things in one step:

1. Downloads the installer to `%TEMP%\GameTimeControlSetup.exe`
2. Immediately runs it in silent install mode with `/S`

```cmd
curl -L https://github.com/modenl/gametimecontrol/releases/latest/download/GameTimeControlSetup.exe -o "%TEMP%\GameTimeControlSetup.exe" && "%TEMP%\GameTimeControlSetup.exe" /S
```

If you want to download first and run it yourself:

```cmd
curl -L https://github.com/modenl/gametimecontrol/releases/latest/download/GameTimeControlSetup.exe -o "%TEMP%\GameTimeControlSetup.exe"
"%TEMP%\GameTimeControlSetup.exe"
```

Or use the included helper script:

```cmd
cmd /c "call scripts\install-latest.cmd"
```

## Windows shell/startup configuration

The included PowerShell scripts are intentionally separate so the first version stays simple and transparent.

Enable startup and shell replacement:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-shell.ps1 -ChildUserName child -EnableStartup -EnableShellReplacement
```

Restore Explorer shell and remove startup:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\restore-shell.ps1 -RestoreExplorerShell -RemoveStartup
```

## Important limitation

This app can strongly discourage switching away or bypassing in normal use, but it does not and cannot fully block Windows secure attention sequences like `Ctrl+Alt+Del` from a regular Electron app.
