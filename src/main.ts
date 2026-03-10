import * as utils from '@iobroker/adapter-core';
import axios from 'axios';

declare global {
	namespace ioBroker {
		interface AdapterConfig {
			updateInterval: number;
			favoriteDriver: string;
			favoriteTeam: string;
			highlightColor: string;
		}
	}
}

interface NextRace {
	session_key: number;
	session_name: string;
	date_start: string;
	date_end: string;
	circuit_short_name: string;
	country_name: string;
	location: string;
	year: number;
}

class F1 extends utils.Adapter {
	private updateInterval?: NodeJS.Timeout;
	private api: ReturnType<typeof axios.create>;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'f1',
		});

		this.api = axios.create({
			baseURL: 'https://api.openf1.org/v1',
			timeout: 10000,
			headers: { 'User-Agent': 'ioBroker.f1' }
		});

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	private async onReady(): Promise<void> {
		this.log.info('Starting F1 adapter...');
		await this.initializeStates();
		await this.setStateAsync('info.connection', { val: false, ack: true });
		await this.fetchData();

		const interval = (this.config.updateInterval || 60) * 1000;
		this.updateInterval = setInterval(() => this.fetchData(), interval);
		this.log.info(`F1 adapter initialized. Update interval: ${this.config.updateInterval}s`);
	}

	private async initializeStates(): Promise<void> {
		await this.setObjectNotExistsAsync('next_race', {
			type: 'channel',
			common: { name: 'Next Race Information' },
			native: {}
		});

		const states = [
			{ id: 'circuit', name: 'Circuit Name', type: 'string', role: 'text' },
			{ id: 'country', name: 'Country', type: 'string', role: 'text' },
			{ id: 'location', name: 'Location', type: 'string', role: 'text' },
			{ id: 'date_start', name: 'Race Start', type: 'string', role: 'date' },
			{ id: 'countdown_days', name: 'Days until race', type: 'number', role: 'value', unit: 'days' },
			{ id: 'json', name: 'Next Race (JSON)', type: 'string', role: 'json' }
		];

		for (const state of states) {
			await this.setObjectNotExistsAsync(`next_race.${state.id}`, {
				type: 'state',
				common: {
					name: state.name,
					type: state.type as 'string' | 'number',
					role: state.role,
					read: true,
					write: false,
					...(state.unit && { unit: state.unit })
				},
				native: {}
			});
		}
	}

	private async fetchData(): Promise<void> {
		try {
			this.log.debug('Fetching data from OpenF1 API...');
			const nextRace = await this.getNextRace();
			if (nextRace) {
				await this.updateNextRaceStates(nextRace);
				await this.setStateAsync('info.connection', { val: true, ack: true });
				this.log.debug(`Next race: ${nextRace.circuit_short_name} - ${nextRace.date_start}`);
			} else {
				this.log.warn('No upcoming race found');
			}
		} catch (error) {
			this.log.error(`Failed to fetch data: ${error}`);
			await this.setStateAsync('info.connection', { val: false, ack: true });
		}
	}

	private async getNextRace(): Promise<NextRace | null> {
		try {
			const now = new Date();
			const year = now.getFullYear();
			
			// Get all races for current year
			const response = await this.api.get<NextRace[]>('/sessions', {
				params: { session_name: 'Race', year: year }
			});

			if (response.data && response.data.length > 0) {
				// Filter future races client-side
				const futureRaces = response.data.filter((race: NextRace) => 
					new Date(race.date_start) > now
				);

				if (futureRaces.length > 0) {
					// Sort by date and get first
					return futureRaces.sort((a: NextRace, b: NextRace) => 
						new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
					)[0];
				}
			}
			return null;
		} catch (error) {
			this.log.error(`Failed to get next race: ${error}`);
			return null;
		}
	}

	private async updateNextRaceStates(race: NextRace): Promise<void> {
		await this.setStateAsync('next_race.circuit', { val: race.circuit_short_name, ack: true });
		await this.setStateAsync('next_race.country', { val: race.country_name, ack: true });
		await this.setStateAsync('next_race.location', { val: race.location, ack: true });
		await this.setStateAsync('next_race.date_start', { val: race.date_start, ack: true });
		const daysUntil = Math.ceil((new Date(race.date_start).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
		await this.setStateAsync('next_race.countdown_days', { val: daysUntil, ack: true });
		await this.setStateAsync('next_race.json', { val: JSON.stringify(race, null, 2), ack: true });
	}

	private onUnload(callback: () => void): void {
		try {
			if (this.updateInterval) clearInterval(this.updateInterval);
			this.log.info('F1 adapter stopped');
			callback();
		} catch { callback(); }
	}

	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (state) this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		else this.log.debug(`state ${id} deleted`);
	}
}

if (require.main !== module) {
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new F1(options);
} else {
	(() => new F1())();
}
