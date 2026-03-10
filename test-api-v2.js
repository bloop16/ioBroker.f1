const axios = require('axios');

console.log('🏎️  Testing OpenF1 API (Updated Logic)...\n');

const api = axios.create({
  baseURL: 'https://api.openf1.org/v1',
  timeout: 10000,
  headers: { 'User-Agent': 'ioBroker.f1-test' }
});

async function testNextRace() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    
    console.log('📅 Fetching races for year:', year);
    console.log('   Current time:', now.toISOString());
    
    const response = await api.get('/sessions', {
      params: { session_name: 'Race', year: year }
    });

    console.log('   Total races found:', response.data.length);

    if (response.data && response.data.length > 0) {
      // Filter future races client-side
      const futureRaces = response.data.filter(race => 
        new Date(race.date_start) > now
      );

      console.log('   Future races:', futureRaces.length);

      if (futureRaces.length > 0) {
        const sorted = futureRaces.sort((a, b) => 
          new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
        );
        const nextRace = sorted[0];

        console.log('\n✅ Next Race Found!\n');
        console.log('Circuit:', nextRace.circuit_short_name);
        console.log('Country:', nextRace.country_name);
        console.log('Location:', nextRace.location);
        console.log('Date:', nextRace.date_start);
        
        const raceDate = new Date(nextRace.date_start);
        const daysUntil = Math.ceil((raceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        console.log('Days until race:', daysUntil);
        
        console.log('\n📊 Full race data:');
        console.log(JSON.stringify(nextRace, null, 2));
        
        console.log('\n✅ API TEST SUCCESSFUL!');
      } else {
        console.log('⚠️  No future races in', year);
      }
    } else {
      console.log('⚠️  No races found for', year);
    }
  } catch (error) {
    console.error('❌ API TEST FAILED!');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testNextRace();
