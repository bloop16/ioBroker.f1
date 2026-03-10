"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils = __importStar(require("@iobroker/adapter-core"));
const axios_1 = __importDefault(require("axios"));
class F1 extends utils.Adapter {
    updateInterval;
    api;
    constructor(options = {}) {
        super({
            ...options,
            name: 'f1',
        });
        this.api = axios_1.default.create({
            baseURL: 'https://api.openf1.org/v1',
            timeout: 10000,
            headers: { 'User-Agent': 'ioBroker.f1' }
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    async onReady() {
        this.log.info('Starting F1 adapter...');
        await this.initializeStates();
        await this.setStateAsync('info.connection', { val: false, ack: true });
        await this.fetchData();
        const interval = (this.config.updateInterval || 60) * 1000;
        this.updateInterval = setInterval(() => this.fetchData(), interval);
        this.log.info(`F1 adapter initialized. Update interval: ${this.config.updateInterval}s`);
    }
    async initializeStates() {
        // Next Race Channel
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
            await this.setObjectNotExistsAsync(`next_race.${state.id}`, {
                type: 'state',
                common: {
                    name: state.name,
                    type: state.type,
                    role: state.role,
                    read: true,
                    write: false,
                    ...(state.unit && { unit: state.unit })
                },
                native: {}
            });
        }
        // Standings Channel
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
            await this.setObjectNotExistsAsync(`standings.${state.id}`, {
                type: 'state',
                common: {
                    name: state.name,
                    type: state.type,
                    role: state.role,
                    read: true,
                    write: false
                },
                native: {}
            });
        }
    }
    async fetchData() {
        try {
            this.log.debug('Fetching data from OpenF1 API...');
            // Fetch next race
            const nextRace = await this.getNextRace();
            if (nextRace) {
                await this.updateNextRaceStates(nextRace);
            }
            // Fetch standings
            await this.updateStandings();
            await this.setStateAsync('info.connection', { val: true, ack: true });
        }
        catch (error) {
            this.log.error(`Failed to fetch data: ${error}`);
            await this.setStateAsync('info.connection', { val: false, ack: true });
        }
    }
    async getNextRace() {
        try {
            const now = new Date();
            const year = now.getFullYear();
            const response = await this.api.get('/sessions', {
                params: { session_name: 'Race', year: year }
            });
            if (response.data && response.data.length > 0) {
                const futureRaces = response.data.filter((race) => new Date(race.date_start) > now);
                if (futureRaces.length > 0) {
                    return futureRaces.sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime())[0];
                }
            }
            return null;
        }
        catch (error) {
            this.log.error(`Failed to get next race: ${error}`);
            return null;
        }
    }
    async updateNextRaceStates(race) {
        await this.setStateAsync('next_race.circuit', { val: race.circuit_short_name, ack: true });
        await this.setStateAsync('next_race.country', { val: race.country_name, ack: true });
        await this.setStateAsync('next_race.location', { val: race.location, ack: true });
        await this.setStateAsync('next_race.date_start', { val: race.date_start, ack: true });
        const daysUntil = Math.ceil((new Date(race.date_start).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        await this.setStateAsync('next_race.countdown_days', { val: daysUntil, ack: true });
        await this.setStateAsync('next_race.json', { val: JSON.stringify(race, null, 2), ack: true });
        this.log.debug(`Next race: ${race.circuit_short_name} - ${race.date_start}`);
    }
    async updateStandings() {
        try {
            // Get drivers from latest session
            const response = await this.api.get('/drivers', {
                params: { session_key: 'latest' }
            });
            if (response.data && response.data.length > 0) {
                // Sort by team and driver number
                const drivers = response.data.sort((a, b) => {
                    if (a.team_name === b.team_name) {
                        return a.driver_number - b.driver_number;
                    }
                    return a.team_name.localeCompare(b.team_name);
                });
                // Extract unique teams
                const teams = Array.from(new Map(drivers.map(d => [d.team_name, { name: d.team_name, colour: d.team_colour }]))
                    .values());
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
                this.log.debug(`Updated standings: ${drivers.length} drivers, ${teams.length} teams`);
            }
        }
        catch (error) {
            this.log.error(`Failed to update standings: ${error}`);
        }
    }
    onUnload(callback) {
        try {
            if (this.updateInterval)
                clearInterval(this.updateInterval);
            this.log.info('F1 adapter stopped');
            callback();
        }
        catch {
            callback();
        }
    }
    onStateChange(id, state) {
        if (state)
            this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        else
            this.log.debug(`state ${id} deleted`);
    }
}
if (require.main !== module) {
    module.exports = (options) => new F1(options);
}
else {
    (() => new F1())();
}
//# sourceMappingURL=main.js.map