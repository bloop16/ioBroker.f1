/**
 * Local test runner for F1 adapter
 * Tests adapter logic without ioBroker installation
 */

const axios = require('axios');

class MockAdapter {
	constructor() {
		this.config = {
			updateInterval: 60,
			favoriteDriver: 'Max Verstappen',
			favoriteTeam: 'Red Bull Racing',
			highlightColor: '#3bb273'
		};
		this.states = {};
		this.objects = {};
		this.api = axios.create({
			baseURL: 'https://api.openf1.org/v1',
			timeout: 10000,
			headers: { 'User-Agent': 'ioBroker.f1-test' }
		});
	}

	log = {
		info: (msg) => console.log('ℹ️  INFO:', msg),
		debug: (msg) => console.log('🔍 DEBUG:', msg),
		warn: (msg) => console.warn('⚠️  WARN:', msg),
		error: (msg) => console.error('❌ ERROR:', msg)
	};

	async setObjectNotExistsAsync(id, obj) {
		if (!this.objects[id]) {
			this.objects[id] = obj;
			console.log('📦 Object created:', id);
		}
	}

	async setStateAsync(id, state) {
		this.states[id] = state;
		console.log('💾 State set:', id, '=', state.val);
	}

	async getNextRace() {
		try {
			const now = new Date();
			const year = now.getFullYear();
			
			const response = await this.api.get('/sessions', {
				params: { session_name: 'Race', year: year }
			});

			if (response.data && response.data.length > 0) {
				const futureRaces = response.data.filter(race => 
					new Date(race.date_start) > now
				);

				if (futureRaces.length > 0) {
					return futureRaces.sort((a, b) => 
						new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
					)[0];
				}
			}
			return null;
		} catch (error) {
			this.log.error();
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
	}

	async test() {
		console.log('\n🏎️  F1 Adapter Local Test\n');
		console.log('==========================\n');

		this.log.info('Starting test...');
		
		// Test API connection
		this.log.info('Fetching next race...');
		const nextRace = await this.getNextRace();

		if (nextRace) {
			this.log.info('✅ Next race found!');
			await this.updateNextRaceStates(nextRace);

			console.log('\n📊 Race Information:\n');
			console.log('   Circuit:', nextRace.circuit_short_name);
			console.log('   Country:', nextRace.country_name);
			console.log('   Location:', nextRace.location);
			console.log('   Date:', nextRace.date_start);
			
			const daysUntil = Math.ceil((new Date(nextRace.date_start).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
			console.log('   Days until race:', daysUntil);

			console.log('\n💾 States created:\n');
			Object.keys(this.states).forEach(key => {
				const val = this.states[key].val;
				const display = typeof val === 'string' && val.length > 50 
					? val.substring(0, 50) + '...' 
					: val;
				console.log();
			});

			console.log('\n✅ TEST SUCCESSFUL!\n');
		} else {
			this.log.warn('❌ No upcoming race found');
			console.log('\n❌ TEST FAILED\n');
		}
	}
}

// Run test
const adapter = new MockAdapter();
adapter.test().catch(err => {
	console.error('Test failed:', err);
	process.exit(1);
});
