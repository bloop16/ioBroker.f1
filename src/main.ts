import * as utils from '@iobroker/adapter-core';
import axios from 'axios';

declare global {
	namespace ioBroker {
		interface AdapterConfig {
			updateInterval: number;
			updateIntervalNormal: number;
			updateIntervalRace: number;
			enableDynamicPolling: boolean;
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

interface Driver {
	driver_number: number;
	full_name: string;
	name_acronym: string;
	team_name: string;
	team_colour: string;
	headshot_url: string;
}

interface Session {
	session_key: number;
	session_name: string;
	session_type: string;
	date_start: string;
	date_end: string;
}

interface Weather {
	air_temperature: number;
	humidity: number;
	pressure: number;
	rainfall: number;
	track_temperature: number;
	wind_direction: number;
	wind_speed: number;
}

interface RaceControlMessage {
	date: string;
	lap_number: number;
	message: string;
	category: string;
	flag: string;
}

class F1 extends utils.Adapter {
	private updateInterval?: NodeJS.Timeout;
	private api: ReturnType<typeof axios.create>;
	private currentPollingMode: 'race' | 'normal' = 'normal';
	private currentSessionKey?: number;

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
		await this.updatePollingInterval();
	}

	private async updatePollingInterval(): Promise<void> {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
		}

		let interval: number;

		if (this.config.enableDynamicPolling) {
			const hasActiveSession = await this.checkActiveSession();
			
			if (hasActiveSession) {
				interval = (this.config.updateIntervalRace || 10) * 1000;
				if (this.currentPollingMode !== 'race') {
					this.currentPollingMode = 'race';
					this.log.info('Switching to RACE mode');
				}
			} else {
				interval = (this.config.updateIntervalNormal || 3600) * 1000;
				if (this.currentPollingMode !== 'normal') {
					this.currentPollingMode = 'normal';
					this.log.info('Switching to NORMAL mode');
				}
			}
		} else {
			interval = (this.config.updateInterval || 60) * 1000;
			this.log.info('Using legacy update interval');
		}

		this.updateInterval = setInterval(() => this.fetchData(), interval);
		this.log.debug('Next update scheduled');
	}

	private async checkActiveSession(): Promise<boolean> {
		try {
			const now = new Date();
			const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

			const response = await this.api.get<Session[]>('/sessions', {
				params: {
					date_start_gte: todayStart.toISOString(),
					date_start_lte: todayEnd.toISOString()
				}
			});

			if (!response.data || response.data.length === 0) {
				return false;
			}

			for (const session of response.data) {
				const sessionStart = new Date(session.date_start);
				const sessionEnd = new Date(session.date_end);

				if (now >= sessionStart && now <= sessionEnd) {
					this.log.debug('Active session detected');
					this.currentSessionKey = session.session_key;
					return true;
				}
			}

			for (const session of response.data) {
				const sessionStart = new Date(session.date_start);
				const minutesUntilStart = (sessionStart.getTime() - now.getTime()) / (1000 * 60);

				if (minutesUntilStart > 0 && minutesUntilStart <= 30) {
					this.log.debug('Session starting soon');
					this.currentSessionKey = session.session_key;
					return true;
				}
			}

			this.currentSessionKey = undefined;
			return false;
		} catch (error) {
			this.log.debug('Failed to check active session');
			return false;
		}
	}

	private async initializeStates(): Promise<void> {
		await this.setObjectNotExistsAsync('next_race', {
			type: 'channel',
			common: { name: 'Next Race Information' },
			native: {}
		});

		const raceStates = [
			{ id: 'circuit', name: 'Circuit Name', type: 'string', role: 'text' },
			{ id: 'country', name: 'Country', type: 'string', role: 'text' },
			{ id: 'location', name: 'Location', type: 'string', role: 'text' },
			{ id: 'date_start', name: 'Race Start', type: 'string', role: 'date' },
			{ id: 'countdown_days', name: 'Days until race', type: 'number', role: 'value', unit: 'days' },
			{ id: 'json', name: 'Next Race (JSON)', type: 'string', role: 'json' }
		];

		for (const state of raceStates) {
			await this.setObjectNotExistsAsync('next_race.' + state.id, {
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

		await this.setObjectNotExistsAsync('standings', {
			type: 'channel',
			common: { name: 'Championship Standings' },
			native: {}
		});

		const standingsStates = [
			{ id: 'drivers', name: 'Driver Standings', type: 'string', role: 'json' },
			{ id: 'teams', name: 'Team Standings', type: 'string', role: 'json' },
			{ id: 'last_update', name: 'Last Update', type: 'string', role: 'date' }
		];

		for (const state of standingsStates) {
			await this.setObjectNotExistsAsync('standings.' + state.id, {
				type: 'state',
				common: {
					name: state.name,
					type: state.type as 'string',
					role: state.role,
					read: true,
					write: false
				},
				native: {}
			});
		}

		await this.setObjectNotExistsAsync('live_session', {
			type: 'channel',
			common: { name: 'Live Session Data' },
			native: {}
		});

		const liveStates = [
			{ id: 'status', name: 'Session Status', type: 'string', role: 'text' },
			{ id: 'type', name: 'Session Type', type: 'string', role: 'text' },
			{ id: 'track_status', name: 'Track Status', type: 'string', role: 'text' },
			{ id: 'laps_total', name: 'Total Laps', type: 'number', role: 'value' },
			{ id: 'weather', name: 'Weather Data', type: 'string', role: 'json' }
		];

		for (const state of liveStates) {
			await this.setObjectNotExistsAsync('live_session.' + state.id, {
				type: 'state',
				common: {
					name: state.name,
					type: state.type as 'string' | 'number',
					role: state.role,
					read: true,
					write: false
				},
				native: {}
			});
		}

		await this.setObjectNotExistsAsync('race_control', {
			type: 'channel',
			common: { name: 'Race Control Messages' },
			native: {}
		});

		const raceControlStates = [
			{ id: 'latest_message', name: 'Latest Message', type: 'string', role: 'text' },
			{ id: 'messages', name: 'All Messages', type: 'string', role: 'json' }
		];

		for (const state of raceControlStates) {
			await this.setObjectNotExistsAsync('race_control.' + state.id, {
				type: 'state',
				common: {
					name: state.name,
					type: 'string',
					role: state.role,
					read: true,
					write: false
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
			}

			await this.updateStandings();

			if (this.currentSessionKey) {
				await this.updateLiveSession();
				await this.updateRaceControl();
			} else {
				await this.setStateAsync('live_session.status', { val: 'no_session', ack: true });
			}

			await this.setStateAsync('info.connection', { val: true, ack: true });

			if (this.config.enableDynamicPolling) {
				await this.updatePollingInterval();
			}
		} catch (error) {
			this.log.error('Failed to fetch data');
			await this.setStateAsync('info.connection', { val: false, ack: true });
		}
	}

	private async getNextRace(): Promise<NextRace | null> {
		try {
			const now = new Date();
			const year = now.getFullYear();
			
			const response = await this.api.get<NextRace[]>('/sessions', {
				params: { session_name: 'Race', year: year }
			});

			if (response.data && response.data.length > 0) {
				const futureRaces = response.data.filter((race: NextRace) => 
					new Date(race.date_start) > now
				);

				if (futureRaces.length > 0) {
					return futureRaces.sort((a: NextRace, b: NextRace) => 
						new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
					)[0];
				}
			}
			return null;
		} catch (error) {
			this.log.error('Failed to get next race');
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
		this.log.debug('Next race updated');
	}

	private async updateStandings(): Promise<void> {
		try {
			const response = await this.api.get<Driver[]>('/drivers', {
				params: { session_key: 'latest' }
			});

			if (response.data && response.data.length > 0) {
				const drivers = response.data.sort((a: Driver, b: Driver) => {
					if (a.team_name === b.team_name) {
						return a.driver_number - b.driver_number;
					}
					return a.team_name.localeCompare(b.team_name);
				});

				const teams = Array.from(
					new Map(drivers.map(d => [d.team_name, { name: d.team_name, colour: d.team_colour }]))
					.values()
				);

				await this.setStateAsync('standings.drivers', { 
					val: JSON.stringify(drivers, null, 2), 
					ack: true 
				});
				await this.setStateAsync('standings.teams', { 
					val: JSON.stringify(teams, null, 2), 
					ack: true 
				});
				await this.setStateAsync('standings.last_update', { 
					val: new Date().toISOString(), 
					ack: true 
				});

				this.log.debug('Updated standings');
			}
		} catch (error) {
			this.log.error('Failed to update standings');
		}
	}

	private async updateLiveSession(): Promise<void> {
		if (!this.currentSessionKey) return;

		try {
			const sessionResponse = await this.api.get<Session[]>('/sessions', {
				params: { session_key: this.currentSessionKey }
			});

			if (sessionResponse.data && sessionResponse.data.length > 0) {
				const session = sessionResponse.data[0];
				const now = new Date();
				const sessionStart = new Date(session.date_start);
				const sessionEnd = new Date(session.date_end);

				let status = 'unknown';
				if (now < sessionStart) status = 'pre_session';
				else if (now >= sessionStart && now <= sessionEnd) status = 'active';
				else status = 'finished';

				await this.setStateAsync('live_session.status', { val: status, ack: true });
				await this.setStateAsync('live_session.type', { val: session.session_name, ack: true });
			}

			const weatherResponse = await this.api.get<Weather[]>('/weather', {
				params: { 
					session_key: this.currentSessionKey
				}
			});

			if (weatherResponse.data && weatherResponse.data.length > 0) {
				const latestWeather = weatherResponse.data[weatherResponse.data.length - 1];
				await this.setStateAsync('live_session.weather', { 
					val: JSON.stringify(latestWeather, null, 2), 
					ack: true 
				});
			}

			this.log.debug('Updated live session');
		} catch (error) {
			this.log.debug('Failed to update live session');
		}
	}

	private async updateRaceControl(): Promise<void> {
		if (!this.currentSessionKey) return;

		try {
			const response = await this.api.get<RaceControlMessage[]>('/race_control', {
				params: { 
					session_key: this.currentSessionKey
				}
			});

			if (response.data && response.data.length > 0) {
				const messages = response.data.sort((a, b) => 
					new Date(b.date).getTime() - new Date(a.date).getTime()
				);

				const latestMessage = messages[0];
				const msgText = latestMessage.message + ' (' + (latestMessage.flag || latestMessage.category) + ')';
				await this.setStateAsync('race_control.latest_message', { 
					val: msgText, 
					ack: true 
				});
				await this.setStateAsync('race_control.messages', { 
					val: JSON.stringify(messages, null, 2), 
					ack: true 
				});

				this.log.debug('Updated race control');
			}
		} catch (error) {
			this.log.debug('Failed to update race control');
		}
	}

	private onUnload(callback: () => void): void {
		try {
			if (this.updateInterval) clearInterval(this.updateInterval);
			this.log.info('F1 adapter stopped');
			callback();
		} catch { callback(); }
	}

	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (state) this.log.debug('state changed');
		else this.log.debug('state deleted');
	}
}

if (require.main !== module) {
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new F1(options);
} else {
	(() => new F1())();
}
