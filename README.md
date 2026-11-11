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
| `encryptedPassword` | Yes | Your Atmoce password encoded in Base64 (`echo -n "password" \| base64`) |
| `stationName` | No | Station name to select if several stations exist |
| `stationId` | No | Manual station ID. If set, station discovery is skipped |
| `pollIntervalSeconds` | No | Refresh interval. Default: `60`, minimum recommended: `30` |
| `showBattery` | No | Set to `false` to hide all battery accessories (battery, level, charge, discharge). Default: `true` |
| `lowBatteryThresholdPercent` | No | Battery level considered low. Default: `20` |
| `debug` | No | To display debug log in the homebridge console. Default: `No` |

---

## How to get the encrypted password

The Atmoce Cloud web portal does not send your plain password to the API: it only encodes it in **Base64** before sending the login request (`"encrypted": true`).

So you can generate the `encryptedPassword` value with a simple command:

```bash
echo -n "PasswordExample" | base64
```

Output:

```text
UGFzc3dvcmRFeGFtcGxl
```

Paste the result into your Homebridge config:

```json
"encryptedPassword": "UGFzc3dvcmRFeGFtcGxl"
```

> Use `echo -n` (no trailing newline), otherwise the encoded value will be wrong.

### Alternative: copy it from Chrome DevTools

1. Open `https://www.atmocecloud.com` in Chrome and log out if needed.
2. Open DevTools (`CMD + OPTION + I` on macOS, `F12` on Windows/Linux) → **Network** tab → enable **Preserve log** → filter on `login`.
3. Log in, click the `login` request (`https://www.atmocecloud.com/permission-auth/api/login`) and open the **Payload** tab.
4. Copy the value of the `password` field.

---

## Test your credentials with curl (optional)

### Get a Bearer token

```bash
curl --request POST \
  --url https://www.atmocecloud.com/permission-auth/api/login \
  --header 'Content-Type: application/json' \
  --data '{
  "username": "my.super@email",
  "encrypted": true,
  "password": "<Base64 command result>",
  "appType": "web"
}'
```

### Get your station ID from the token

```bash
curl --request POST \
  --url https://www.atmocecloud.com/energy-manage/multipleStation/getDropDownStationList \
  --header 'Authorization: Bearer <BearerToken from previous request>' \
  --header 'Content-Type: application/json' \
  --data '{
  "pageIndex": 1,
  "pageSize": 20
}'
```

Example response:

```json
{
  "success": true,
  "code": 200,
  "msg": "",
  "data": {
    "success": true,
    "data": [
      {
        "stationId": 1111,
        "stationName": "Example",
        "businessId": "111111111111",
        "collectState": false,
        "scene": 1,
        "style": 0,
        "miniStation": false
      }
    ],
    "pageIndex": 1,
    "pageSize": 20,
    "total": 1,
    "totalPage": 1
  }
}
```

Use the returned `stationId` as `"stationId"` in your config (or `stationName` as `"stationName"`).

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
Use the `getDropDownStationList` curl request above (or Chrome DevTools) to find the station ID manually, then set:

```json
"stationId": 9825
```

### Values appear as lux instead of watts

This is expected.

HomeKit does not expose a standard watt/power sensor type through Homebridge.  
The plugin uses LightSensor as a workaround.

### Login fails after changing password

The encoded password changes when your Atmoce password changes.

Re-run the `base64` command with your new password and update `encryptedPassword`.

---

## Known limitations

- Power values are exposed as LightSensor values due to HomeKit limitations.
- Station discovery may not work for all Atmoce regions/accounts.
- The plugin uses Atmoce web portal endpoints, not the official public Cloud API with `app_key` / `app_secret`.
- If Atmoce changes its web API, the plugin may need to be updated.

---

## Future improvements

- Accept the plain password in the config and encode it in the plugin
- Better station discovery once all endpoint variants are known
- Optional MQTT export
- Optional Eve/HomeKit custom history support
- Better representation of signed grid import/export
- Optional separate import/export occupancy sensors

---

## Security notes

The `encryptedPassword` is only Base64-encoded: it is **not** encryption and can be decoded trivially back to your plain password.

Treat it exactly like your real password.

Do not share your Homebridge config publicly.

---

## Disclaimer

This project is not affiliated with Atmoce.

Use at your own risk.
