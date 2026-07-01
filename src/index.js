const axios = require('axios');

let Service;
let Characteristic;

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerPlatform(
    'homebridge-atmoce-cloud',
    'AtmoceCloud',
    AtmoceCloudPlatform
  );
};

class AtmoceAccessory {
  constructor(name, services) {
    this.name = name;
    this.services = Array.isArray(services) ? services : [services];

    this.informationService = new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Manufacturer, 'Atmoce')
      .setCharacteristic(Characteristic.Model, 'Atmoce Cloud')
      .setCharacteristic(Characteristic.Name, name);
  }

  getServices() {
    return [this.informationService, ...this.services];
  }
}

class AtmoceCloudPlatform {
  constructor(log, config) {
    this.log = log;
    this.config = config || {};

    this.debugEnabled = this.config.debug === true;

    this.token = null;
    this.stationId = this.config.stationId || null;
    this.stationName = this.config.stationName || null;

    this.lowBatteryThresholdPercent = Number(
      this.config.lowBatteryThresholdPercent || 20
    );

    this.batteryChargedThresholdPercent = Number(
      this.config.batteryChargedThresholdPercent || 90
    );

    this.pollIntervalSeconds = Math.max(
      Number(this.config.pollIntervalSeconds || 60),
      30
    );

    this.services = {};

    this.debug('Plugin initialized');
    this.debug(`Config name=${this.config.name}`);
    this.debug(`stationId=${this.stationId}`);
    this.debug(`stationName=${this.stationName}`);
    this.debug(`pollIntervalSeconds=${this.pollIntervalSeconds}`);
    this.debug(`lowBatteryThresholdPercent=${this.lowBatteryThresholdPercent}`);
    this.debug(
      `batteryChargedThresholdPercent=${this.batteryChargedThresholdPercent}`
    );
  }

  debug(message) {
    if (this.debugEnabled) {
      this.debug(`[DEBUG] ${message}`);
    }
  }

  accessories(callback) {
    this.debug('Creating HomeKit services...');

    const batteryOutletService = new Service.Outlet('Atmoce Battery');
    const batteryService = new Service.BatteryService('Battery Status');
    const batteryLevelService = new Service.HumiditySensor(
      'Atmoce Battery Level'
    );

    const solarService = new Service.LightSensor('Atmoce Solar Production');
    const houseService = new Service.LightSensor('Atmoce House Consumption');
    const gridImportService = new Service.LightSensor('Atmoce Grid Import');
    const gridExportService = new Service.LightSensor('Atmoce Grid Export');
    const batteryChargeService = new Service.LightSensor(
      'Atmoce Battery Charge'
    );
    const batteryDischargeService = new Service.LightSensor(
      'Atmoce Battery Discharge'
    );

    this.prepareOutlet(batteryOutletService);
    this.prepareHumiditySensor(batteryLevelService);

    this.prepareLightSensor(solarService);
    this.prepareLightSensor(houseService);
    this.prepareLightSensor(gridImportService);
    this.prepareLightSensor(gridExportService);
    this.prepareLightSensor(batteryChargeService);
    this.prepareLightSensor(batteryDischargeService);

    this.services.batteryOutlet = batteryOutletService;
    this.services.battery = batteryService;
    this.services.batteryLevel = batteryLevelService;

    this.services.solar = solarService;
    this.services.house = houseService;
    this.services.gridImport = gridImportService;
    this.services.gridExport = gridExportService;
    this.services.batteryCharge = batteryChargeService;
    this.services.batteryDischarge = batteryDischargeService;

    const accessories = [
      new AtmoceAccessory('Atmoce Battery', [
        batteryOutletService,
        batteryService,
      ]),
      new AtmoceAccessory('Atmoce Battery Level', batteryLevelService),
      new AtmoceAccessory('Atmoce Solar Production', solarService),
      new AtmoceAccessory('Atmoce House Consumption', houseService),
      new AtmoceAccessory('Atmoce Grid Import', gridImportService),
      new AtmoceAccessory('Atmoce Grid Export', gridExportService),
      new AtmoceAccessory('Atmoce Battery Charge', batteryChargeService),
      new AtmoceAccessory('Atmoce Battery Discharge', batteryDischargeService),
    ];

    this.debug(`Publishing ${accessories.length} accessories to Homebridge`);
    accessories.forEach((a) => this.debug(`Accessory created: ${a.name}`));

    callback(accessories);

    this.debug('Scheduling first refresh in 3 seconds');
    setTimeout(() => this.refresh(), 3000);

    this.debug(`Scheduling refresh every ${this.pollIntervalSeconds} seconds`);
    setInterval(() => this.refresh(), this.pollIntervalSeconds * 1000);
  }

  prepareOutlet(service) {
    this.debug(`Preparing outlet service: ${service.displayName}`);

    service
      .getCharacteristic(Characteristic.On)
      .onSet((value) => {
        this.debug(
          `Manual change ignored on ${service.displayName}: requested On=${value}`
        );
      });

    service.setCharacteristic(Characteristic.On, false);
    service.setCharacteristic(Characteristic.OutletInUse, false);
  }

  prepareLightSensor(service) {
    this.debug(`Preparing light sensor: ${service.displayName}`);

    service.setCharacteristic(
      Characteristic.CurrentAmbientLightLevel,
      0.0001
    );
  }

  prepareHumiditySensor(service) {
    this.debug(`Preparing humidity sensor: ${service.displayName}`);

    service.setCharacteristic(Characteristic.CurrentRelativeHumidity, 0);
  }

  prepareOccupancySensor(service) {
    this.debug(`Preparing occupancy sensor: ${service.displayName}`);

    service.setCharacteristic(
      Characteristic.OccupancyDetected,
      Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED
    );
  }

  async login() {
    this.debug('Starting Atmoce login...');

    const response = await axios.post(
      'https://www.atmocecloud.com/permission-auth/api/login',
      {
        username: this.config.username,
        encrypted: true,
        password: this.config.encryptedPassword,
        appType: 'web',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: 'https://www.atmocecloud.com',
          Referer: 'https://www.atmocecloud.com/energy/login',
        },
      }
    );

    this.debug(`Login response code=${response.data?.code}`);

    if (!response.data || response.data.code !== 200 || !response.data.data) {
      throw new Error('Login failed: ' + JSON.stringify(response.data));
    }

    this.token = response.data.data.prefix + response.data.data.token;

    this.debug('Atmoce login OK');
    this.debug('Bearer token received');
  }

  async discoverStation() {
    if (this.stationId) {
      this.debug(`Using configured stationId=${this.stationId}`);
      return this.stationId;
    }

    this.debug('Starting station auto-discovery...');

    const response = await axios.post(
      'https://www.atmocecloud.com/energy-manage/multipleStation/getDropDownStationList',
      {},
      {
        headers: {
          Authorization: this.token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );

    this.debug(
      'Station discovery raw response: ' + JSON.stringify(response.data)
    );

    const rawData = response.data?.data?.data;
    const stations = Array.isArray(rawData) ? rawData : [];

    this.debug(`Station count=${stations.length}`);

    if (!stations.length) {
      throw new Error(
        'No Atmoce station found. Raw response: ' + JSON.stringify(response.data)
      );
    }

    stations.forEach((s) => {
      this.debug(
        `Discovered station: name=${s.stationName}, stationId=${s.stationId}`
      );
    });

    let selectedStation = null;

    if (this.stationName) {
      selectedStation = stations.find((s) => {
        const name = s.stationName || '';
        return name.toLowerCase() === this.stationName.toLowerCase();
      });

      if (!selectedStation) {
        throw new Error('No station matching stationName: ' + this.stationName);
      }
    } else if (stations.length === 1) {
      selectedStation = stations[0];
    } else {
      this.debug('Multiple stations found:');
      stations.forEach((s) => {
        this.debug(`- ${s.stationName} / stationId=${s.stationId}`);
      });

      throw new Error(
        'Multiple Atmoce stations found. Please set stationName or stationId in config.'
      );
    }

    this.stationId = selectedStation.stationId;

    this.debug('Using Atmoce station: ' + selectedStation.stationName);
    this.debug(`Selected stationId=${this.stationId}`);

    return this.stationId;
  }

  async fetchData() {
    await this.discoverStation();

    this.debug(`Fetching live data for stationId=${this.stationId}`);

    const response = await axios.post(
      'https://www.atmocecloud.com/energy-manage/stationStatisticalData/getSingleStationsDetailData',
      {
        stationId: this.stationId,
      },
      {
        headers: {
          Authorization: this.token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );

    this.debug(`Live data response code=${response.data?.code}`);

    if (!response.data || response.data.code !== 200 || !response.data.data) {
      throw new Error(
        'Invalid Atmoce response: ' + JSON.stringify(response.data)
      );
    }

    this.debug('Live data received: ' + JSON.stringify(response.data.data));

    return response.data.data;
  }

  async refresh() {
    const start = Date.now();
    this.debug('Refresh cycle started');

    try {
      if (!this.token) {
        this.debug('No token available, login required');
        await this.login();
      }

      let data;

      try {
        data = await this.fetchData();
      } catch (e) {
        this.debug('Token expired or data request failed, re-login...');
        this.debug(`First fetch failed: ${e.message}`);

        await this.login();
        data = await this.fetchData();
      }

      this.update(data);
      this.debug(
        `Refresh cycle completed in ${Date.now() - start} ms`
      );
    } catch (e) {
      this.log.error('Atmoce refresh failed: ' + e.message);
    }
  }

  update(data) {
    const batterySoc = Number(data.storageSoe || 0);
    const solarPower = Number(data.generationPower || 0);
    const housePower = Number(data.consumptionPower || 0);
    const gridPower = Number(data.gridPower || 0);
    const batteryPower = Number(data.storagePower || 0);
    const storageStatusName = String(data.storageStatusName || '');

    const gridImport = gridPower > 0 ? gridPower : 0;
    const gridExport = gridPower < 0 ? Math.abs(gridPower) : 0;

    const batteryCharge =
      storageStatusName === 'Charging' ? batteryPower : 0;

    const batteryDischarge =
      storageStatusName === 'Discharging' ? batteryPower : 0;

    const batteryOutletActive =
      batterySoc >= this.batteryChargedThresholdPercent;

    this.debug(`Parsed values:`);
    this.debug(`batterySoc=${batterySoc}`);
    this.debug(`solarPower=${solarPower}`);
    this.debug(`housePower=${housePower}`);
    this.debug(`gridPower=${gridPower}`);
    this.debug(`gridImport=${gridImport}`);
    this.debug(`gridExport=${gridExport}`);
    this.debug(`batteryPower=${batteryPower}`);
    this.debug(`storageStatusName=${storageStatusName}`);
    this.debug(`batteryCharge=${batteryCharge}`);
    this.debug(`batteryDischarge=${batteryDischarge}`);
    this.debug(`batteryOutletActive=${batteryOutletActive}`);

    this.services.batteryOutlet
      .setCharacteristic(Characteristic.On, batteryOutletActive)
      .setCharacteristic(Characteristic.OutletInUse, batteryOutletActive);

    this.services.battery
      .setCharacteristic(Characteristic.BatteryLevel, batterySoc)
      .setCharacteristic(
        Characteristic.ChargingState,
        storageStatusName === 'Charging'
          ? Characteristic.ChargingState.CHARGING
          : Characteristic.ChargingState.NOT_CHARGING
      )
      .setCharacteristic(
        Characteristic.StatusLowBattery,
        batterySoc <= this.lowBatteryThresholdPercent
          ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
      );

    this.services.batteryLevel.setCharacteristic(
      Characteristic.CurrentRelativeHumidity,
      Math.max(0, Math.min(100, batterySoc))
    );

    this.setLux(this.services.solar, solarPower, 'Solar Production');
    this.setLux(this.services.house, housePower, 'House Consumption');
    this.setLux(this.services.gridImport, gridImport, 'Grid Import');
    this.setLux(this.services.gridExport, gridExport, 'Grid Export');
    this.setLux(this.services.batteryCharge, batteryCharge, 'Battery Charge');
    this.setLux(
      this.services.batteryDischarge,
      batteryDischarge,
      'Battery Discharge'
    );

    this.debug(
      `Battery=${batterySoc}% BatteryOutlet=${batteryOutletActive} Solar=${solarPower}W House=${housePower}W GridImport=${gridImport}W GridExport=${gridExport}W BatteryCharge=${batteryCharge}W BatteryDischarge=${batteryDischarge}W`
    );
  }

  setLux(service, watts, label) {
    const value = Math.max(0.0001, Number(watts || 0));

    this.debug(`${label}: setting LightSensor value=${value}`);

    service.setCharacteristic(
      Characteristic.CurrentAmbientLightLevel,
      value
    );
  }
}