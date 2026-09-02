# Homebridge Atmoce Cloud

Homebridge plugin for Atmoce Cloud solar and battery systems.

This plugin connects to the Atmoce Cloud web API, automatically logs in, discovers your Atmoce station, retrieves live solar/battery/house/grid data, and exposes it to Apple HomeKit through Homebridge.

> Note: Apple HomeKit does not currently provide a standard public "power sensor" characteristic in watts for Homebridge plugins. For this reason, instantaneous power values are exposed as `LightSensor` values. This is a workaround, but it allows the values to be visible and usable in HomeKit automations.

---
<p align="center">
<img src="https://www.atmocecloud.com/energy/app/static/images/pv-house.e909ac.png" width="400">
</p>

## Features

- Automatic Atmoce Cloud login
- Automatic token refresh / re-login when the token expires
- Automatic station discovery
- Optional station selection by `stationName`
- Optional manual `stationId`
- Battery accessory with:
  - Battery level / SOC
  - Charging state
  - Low battery status
- Separate HomeKit accessories for:
  - Solar production
  - House consumption
  - Grid flow
  - Battery

---

## HomeKit accessories exposed

| Accessory | HomeKit service | Atmoce field | Unit |
|---|---|---|---|
| Battery | Battery | `storageSoe` | `%` |
| Solar Production | LightSensor | `generationPower` | W, exposed as lux |
| House Consumption | LightSensor | `consumptionPower` | W, exposed as lux |
| Grid Flow | LightSensor | `abs(gridPower)` | W, exposed as lux |

### Grid power interpretation

Atmoce returns `gridPower` as a signed value.

Observed behavior:

- `gridPower > 0` = grid import
- `gridPower < 0` = grid export
- `gridPower = 0` = neutral

The HomeKit accessory currently exposes the absolute value because LightSensor cannot display signed values.

---

## Installation

```bash
npm install -g homebridge-atmoce-cloud
```

If installing manually from a local folder:

```bash
unzip homebridge-atmoce-cloud.zip
cd homebridge-atmoce-cloud
npm install
npm link
sudo systemctl restart homebridge
```

---

## Configuration

### Recommended config using automatic station discovery

```json
{
  "platform": "AtmoceCloud",
  "name": "Atmoce Home",
  "username": "your@email.com",
  "encryptedPassword": "PASTE_ENCRYPTED_PASSWORD_HERE",
  "stationName": "My House",
  "pollIntervalSeconds": 60,
  "lowBatteryThresholdPercent": 20,
  "debug": false
}
```

### Minimal config if you only have one Atmoce station

```json
{
  "platform": "AtmoceCloud",
  "name": "Atmoce Home",
  "username": "your@email.com",
  "encryptedPassword": "PASTE_ENCRYPTED_PASSWORD_HERE"
}
```

### Manual station ID config

```json
{
  "platform": "AtmoceCloud",
  "name": "Atmoce Home",
  "username": "your@email.com",
  "encryptedPassword": "PASTE_ENCRYPTED_PASSWORD_HERE",
  "stationId": 9825,
  "pollIntervalSeconds": 60
}
```

---

## Configuration fields

| Field | Required | Description |
|---|---:|---|
| `platform` | Yes | Must be `AtmoceCloud` |
| `name` | No | Prefix used for HomeKit accessories |
| `username` | Yes | Your Atmoce Cloud account email |
| `encryptedPassword` | Yes | Encrypted password captured from the Atmoce web portal login request |
| `stationName` | No | Station name to select if several stations exist |
| `stationId` | No | Manual station ID. If set, station discovery is skipped |
| `pollIntervalSeconds` | No | Refresh interval. Default: `60`, minimum recommended: `30` |
| `lowBatteryThresholdPercent` | No | Battery level considered low. Default: `20` |
| `debug` | No | To display debug log in the homebridge console. Default: `No` |

---

## How to get the encrypted password

Atmoce Cloud does not send your plain password to the API.  
The web portal encrypts it in the browser before sending the login request.

You need to copy the encrypted value from Chrome DevTools.

### Step-by-step guide

1. Open Google Chrome.
2. Go to: `https://www.atmocecloud.com`
3. Log out if you are already logged in.
4. Open Chrome DevTools:
   - macOS: `CMD + OPTION + I`
   - Windows/Linux: `F12`
5. Open the **Network** tab.
6. Enable **Preserve log**.
7. In the Network filter box, type:

```text
login
```

8. Log in to your Atmoce Cloud account.
9. In the Network request list, click the request named:

```text
login
```

The request URL should look like:

```text
https://www.atmocecloud.com/permission-auth/api/login
```

10. Open the **Payload** tab.
11. Look for a JSON payload similar to:

```json
{
  "username": "your@email.com",
  "encrypted": true,
  "password": "ENCRYPTED_VALUE_HERE",
  "appType": "web"
}
```

12. Copy the value of the `password` field.
13. Paste it into your Homebridge config as:

```json
"encryptedPassword": "ENCRYPTED_VALUE_HERE"
```

Do not copy your plain password. Copy only the already encrypted value shown in the Network payload.

---

## How to find your station name or station ID

The plugin tries to discover stations automatically after login.

If only one station is found, it will be selected automatically.

If multiple stations are found, the plugin will log something like:

```text
Station found: Main House - ID: 9825
Station found: Office - ID: 1234
Multiple Atmoce stations found. Please set stationName or stationId in Homebridge config.
```

Then configure either:

```json
"stationName": "Main House"
```

or:

```json
"stationId": 9825
```

Manual `stationId` is the most reliable option.

---

## How automatic token refresh works

The plugin does not require you to manually paste a Bearer token.

Instead, it performs:

```text
Login with username + encryptedPassword
→ receives Bearer token
→ calls Atmoce station data endpoint
→ if request fails because token expired
→ logs in again
→ retries the request
```

This means Homebridge can keep running without manually refreshing the token.

---

## Atmoce endpoints used

This plugin currently uses the same web endpoints as the Atmoce Cloud portal.

### Login

```text
POST https://www.atmocecloud.com/permission-auth/api/login
```

Payload:

```json
{
  "username": "your@email.com",
  "encrypted": true,
  "password": "ENCRYPTED_PASSWORD",
  "appType": "web"
}
```

### Live station data

```text
POST https://www.atmocecloud.com/energy-manage/stationStatisticalData/getSingleStationsDetailData
```

Payload:

```json
{
  "stationId": 9825
}
```

### Station discovery

The plugin tries several known station discovery endpoints.  
If discovery fails, set `stationId` manually.

---

## Troubleshooting

### Plugin says: `Missing username or encryptedPassword`

Check that your config contains both:

```json
"username": "your@email.com",
"encryptedPassword": "..."
```

### Plugin says: `Multiple Atmoce stations found`

Set either:

```json
"stationName": "Exact Station Name"
```

or:

```json
"stationId": 9825
```

### Plugin says: `Unable to discover Atmoce station`

Station discovery endpoint may differ for your account or region.  
Use Chrome DevTools to find the station ID manually, then set:

```json
"stationId": 9825
```

### Values appear as lux instead of watts

This is expected.

HomeKit does not expose a standard watt/power sensor type through Homebridge.  
The plugin uses LightSensor as a workaround.

### Login fails after changing password

The encrypted password changes when your Atmoce password changes.

Repeat the Chrome DevTools process and update `encryptedPassword`.

---

## Known limitations

- Power values are exposed as LightSensor values due to HomeKit limitations.
- Station discovery may not work for all Atmoce regions/accounts.
- The plugin uses Atmoce web portal endpoints, not the official public Cloud API with `app_key` / `app_secret`.
- If Atmoce changes its web API, the plugin may need to be updated.

---

## Future improvements

- Reproduce the browser-side password encryption directly in the plugin
- Better station discovery once all endpoint variants are known
- Optional MQTT export
- Optional Eve/HomeKit custom history support
- Better representation of signed grid import/export
- Optional separate import/export occupancy sensors

---

## Security notes

The `encryptedPassword` is not your plain password, but it can still be used to obtain a valid Atmoce session token.

Treat it as sensitive.

Do not share your Homebridge config publicly.

---

## Disclaimer

This project is not affiliated with Atmoce.

Use at your own risk.
