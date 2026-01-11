import { HomeyAPIV3Local } from 'homey-api';

declare module 'homey-api' {

		type Resolution = 
			| 'today'
			| 'thisWeek'
			| 'thisMonth'
			| 'thisYear'
			| 'lastWeek'
			| 'lastMonth'
			| 'yesterday'
			| 'lastHour'
			| 'last6Hours'
			| 'last24Hours'
			| 'last3Days'
			| 'last7Days'
			| 'last14Days'
			| 'last31Days'
			| 'last3Months'
			| 'last6Months'
			| 'lastYear'
			| 'last2Years';

	class ExtendedZone extends HomeyAPIV3Local.ManagerZones.Zone {
		name: string;
		parent: string;
		icon: string;
		active: boolean;
		activeLastUpdated: string;
	}

	class CapabilitiesObject {
		id: string;
		type: string;
		title?: string | null;
		getable: boolean;
		setable: boolean;
		min?: number;
		max?: number;
		value?: unknown;
		decimals?: number;
		units?: string;
		iconObj?: { id: string, url: string; };
	}

	class ExtendedDevice extends HomeyAPIV3Local.ManagerDevices.Device {
		class: string;
		zone: string;
		capabilities: string[];
		capabilitiesObj: { [key: string]: CapabilitiesObject };
		iconObj?: { id: string, url: string; };
		getZone(): Promise<ExtendedZone>;
	}

	class ExtendedDeviceCapability extends HomeyAPIV3Local.ManagerDevices.Device.DeviceCapability {
	}

	class ExtendedManagerZones extends HomeyAPIV3Local.ManagerZones {
		getZones(): Promise<{ [key: string]: ExtendedZone; }>;
		getZone(args: { id: string; }): Promise<ExtendedZone>;
		connect(): Promise<void>;
		on(event: "zone.create" | "zone.update" | "zone.delete", callback: (device: ExtendedZone) => void): void;
	}

	class ExtendedManagerDevices extends HomeyAPIV3Local.ManagerDevices {
		getDevices(): Promise<{ [key: string]: ExtendedDevice; }>;
		getDevice(opts: { id: string; }): Promise<ExtendedDevice>;
		connect(): Promise<void>;

		on(event: "device.create" | "device.update" | "device.delete", callback: (device: ExtendedDevice) => void): void;
	}

	class ExtendedManagerLogic extends HomeyAPIV3Local.ManagerLogic {
		getVariables(): Promise<{
			[key: string]: ExtendedVariable;
		}>;

		getVariable(opts: {
			id: string;
		}): Promise<ExtendedVariable>;
	}

	class ExtendedVariable extends HomeyAPIV3Local.ManagerLogic.Variable {
		value: boolean | number | string;
		uri: string;
	}

	class ExtendedManagerInsights extends HomeyAPIV3Local.ManagerInsights {
		getLog(opts: { id: string }): Promise<ExtendedLog>;
		getLogs(): Promise<{ [key: string]: ExtendedLog }>;
		getLogEntries(opts: { id: string; uri?: string; resolution?: Resolution; }): Promise<ExtendedInsightsLogs>;
	}

	class ExtendedLog extends HomeyAPIV3Local.ManagerInsights.Log {
		type: string;
		units?: string;
		lastValue?: any;
		title?: string;
		ownerUri: string;
		ownerId: string;
	}

	type ExtendedInsightsLogs = {
		updatesIn: number;
		values: Array<{
			t: string;
			v: number;
		}>;
		start: string;
		end: string;
		step: number;
		uri: string;
		id: string;
		lastValue: {
			t: string;
			v: number;
		};
	};


	export class ExtendedHomeyAPIV3Local extends HomeyAPIV3Local { 

		// manager: HomeyAPIV3Local.Manager;
		// alarms: HomeyAPIV3Local.ManagerAlarms;
		// api: HomeyAPIV3Local.ManagerApi;
		// apps: HomeyAPIV3Local.ManagerApps;
		// arp: HomeyAPIV3Local.ManagerArp;
		// ble: HomeyAPIV3Local.ManagerBLE;
		// backup: HomeyAPIV3Local.ManagerBackup;
		// clock: HomeyAPIV3Local.ManagerClock;
		// cloud: HomeyAPIV3Local.ManagerCloud;
		// coprocessor: HomeyAPIV3Local.ManagerCoprocessor;
		// cron: HomeyAPIV3Local.ManagerCron;
		// database: HomeyAPIV3Local.ManagerDatabase;
		// devices: HomeyAPIV3Local.ManagerDevices;
		// devkit: HomeyAPIV3Local.ManagerDevkit;
		// discovery: HomeyAPIV3Local.ManagerDiscovery;
		// drivers: HomeyAPIV3Local.ManagerDrivers;
		// energy: HomeyAPIV3Local.ManagerEnergy;
		// experiments: HomeyAPIV3Local.ManagerExperiments;
		// flow: HomeyAPIV3Local.ManagerFlow;
		// flowToken: HomeyAPIV3Local.ManagerFlowToken;
		// geolocation: HomeyAPIV3Local.ManagerGeolocation;
		// googleAssistant: HomeyAPIV3Local.ManagerGoogleAssistant;
		// i18n: HomeyAPIV3Local.ManagerI18n;
		// icons: HomeyAPIV3Local.ManagerIcons;
		// images: HomeyAPIV3Local.ManagerImages;
		// insights: HomeyAPIV3Local.ManagerInsights;
		// ledring: HomeyAPIV3Local.ManagerLedring;
		// logic: HomeyAPIV3Local.ManagerLogic;
		// matter: HomeyAPIV3Local.ManagerMatter;
		// mobile: HomeyAPIV3Local.ManagerMobile;
		// notifications: HomeyAPIV3Local.ManagerNotifications;
		// presence: HomeyAPIV3Local.ManagerPresence;
		// rf: HomeyAPIV3Local.ManagerRF;
		// safety: HomeyAPIV3Local.ManagerSafety;
		// satellites: HomeyAPIV3Local.ManagerSatellites;
		// security: HomeyAPIV3Local.ManagerSecurity;
		// sessions: HomeyAPIV3Local.ManagerSessions;
		// system: HomeyAPIV3Local.ManagerSystem;
		// thread: HomeyAPIV3Local.ManagerThread;
		// update: HomeyAPIV3Local.ManagerUpdates;
		// users: HomeyAPIV3Local.ManagerUsers;
		// virtualDevice: HomeyAPIV3Local.ManagerVirtualDevice;
		// weather: HomeyAPIV3Local.ManagerWeather;
		// webserver: HomeyAPIV3Local.ManagerWebserver;
		// zigbee: HomeyAPIV3Local.ManagerZigbee;
		// zones: HomeyAPIV3Local.ManagerZones;
		// zwave: HomeyAPIV3Local.ManagerZwave
		zones: ExtendedManagerZones;
		devices: ExtendedManagerDevices;
		logic: ExtendedManagerLogic;
		insights: ExtendedManagerInsights;
	}
}
